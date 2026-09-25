# 语音 API 与 RAG 架构说明

更新日期：2026-09-25（Asia/Shanghai）。本文把“浏览器能力”“Gemini API”“Google Cloud API”和本地 RAG 分开说明，避免把不同产品混成一个接口。

## 一、当前语音链路到底调用了什么

### 语音转文字（STT）

当前有三层：

1. 浏览器提供 `SpeechRecognition / webkitSpeechRecognition` 时，`src/audio-recorder.js` 使用它做增量转写，用户说话时输入框持续出现 interim / final 文字。这个浏览器接口由浏览器厂商实现，本项目无法承诺它一定使用 Google Cloud Speech-to-Text，也拿不到服务端 SLA、词表适配或计费控制。
2. 在自动语音对话中，浏览器不支持增量识别，或在线识别返回 `network` 时，`src/cloud-turn-recognizer.js` 用 Web Audio 监听音量，听到说话后等待约 850 ms 安静，再自动结束 `MediaRecorder`、提交 `/api/transcribe`，得到整句后自动发问；无语音时不上传录音。墨衡朗读时暂停收音。该模式是自动轮流对话，但无逐字增量转写，延迟取决于 Gemini 单请求，不能当作 Cloud STT 流式识别。
3. 用户也可手动点击“按下说话”与“停止并转文字”。两种录音都由 `server/index.mjs` 校验格式和大小，再由 `server/gemini-client.mjs` 调用 Gemini Interactions API 的 `gemini-3.5-transcribe`。短录音以内联 Base64 发送，只有模型拒绝该格式时才走 Files API。转写有整轮期限，浏览器断开会取消上游；取得文件名后，即使识别被取消也会尽力删除临时文件。上传尚未返回文件名时无法保证删除，实际清理与留存仍须核对供应商条款和真实调用。

所以准确说法是：**已经真实调用 Google 的 Gemini 转写 API，但尚未接入 Google Cloud Speech-to-Text v2 StreamingRecognize。**

2026-09-22 的一次真实回环复验使用 Gemini TTS 生成新中文音频，再送入 `/api/transcribe`：TTS 约 16.5 秒，转写约 17.4 秒；“守简”被识别为“手写”。它证明接口真的调用成功，也证明当前 Gemini 录音兜底不应被描述为低延迟生产级 STT。

2026-09-25 再次通过本机服务 `/api/speech` → WAV → `/api/transcribe` 做真实回环：TTS 约 5.8 秒，转写约 4.7 秒；“守简语音回环测试”识别成“手写语音回环测试”。这些是两次单样本接口检查，不能作为准确率或延迟承诺；真实麦克风、权限、噪声和回声仍须在用户设备验收。

0.52.0 又运行了完整浏览器录音回环：云端 TTS 生成“你好，今天我们聊聊周易。”，独立 Chromium 的合成麦克风把音频送入真实 `MediaRecorder`，录音上传至真实 `/api/transcribe` 后返回同一句，媒体轨已结束。本次 TTS 约 4.1 秒、录音 3.4 秒、转写约 4.5 秒。这是一条链路健康检查，不是识别准确率、低延迟或真人设备体验的统计结论。仓库提供可重跑的 `npm run smoke:voice-browser`，它会调用真实语音 API 并消耗额度。

0.53.0 的同一脚本改为验证浏览器 `network` 错误后自动停顿、自动转写和自动发送。真实 Gemini 回环已完成，录音音轨正常释放；本次“周易”被误识别为“中医”，TTS 约 4.3 秒、录音约 4.1 秒、停顿至自动发问约 8.3 秒。它证明链路连通，也显示准确率和交互延迟仍需改进，不能宣称达到低延迟实时 STT。

### 文字转语音（TTS）

现在提供两个可显式切换的模式：

| 模式 | 实现 | 网络等待 | 适合场景 | 主要限制 |
| --- | --- | --- | --- | --- |
| 极速浏览器 | `src/browser-speech.js`，Web Speech Synthesis | 无项目服务端 TTS 往返 | 面对面即时对话、演示 | 音色取决于浏览器和操作系统；无本地音色时浏览器实现仍可能联网 |
| 云端音色 | `server/google-cloud-tts-client.mjs`；未配置时回退 `server/gemini-client.mjs` | 首次新句需等待完整 PCM | 更统一的声音风格 | 当前是句级 `synthesizeSpeech`，不是句内音频分片流 |

“极速浏览器”有本地普通话音色时只在本地候选中优先男声音色提示（如 Microsoft Yunxi / Yunjian），并降低语速和音高；第一段文字达到完整句或 40 字软切分后即可交给浏览器朗读，不再等待 Gemini TTS。它仍保留取消、顺序播放和虚拟人开口状态，但嘴型是节奏驱动，不是云端 PCM 的真实 RMS。若系统没有本地普通话音色，具体是否联网由浏览器实现决定。

“云端音色”继续保留 30 分钟 TTL、48 条 / 24 MB LRU、相同并发请求合并和两句预取。有 Google Cloud 凭证时使用官方 `@google-cloud/text-to-speech` 客户端和普通话 Wavenet 音色；未配置时兼容 Gemini TTS。Google 返回的 LINEAR16 WAV 会在服务端剥离容器，继续复用现有 24 kHz PCM 播放与 RMS 嘴型链路。

缓存命中约 9 毫秒只代表重复句无需再次合成，**不能降低每条新句的供应商首次生成时间**。2026-09-22 在 Gemini TTS 上已观察到约 6.1 秒和约 16.5 秒两次新句结果，因此 6 秒不应被当作稳定上限或可接受实时目标。Google Cloud TTS 适配器已通过请求参数、错误边界和 WAV → PCM 自动测试，但当前开发机没有用户 Cloud 凭证，尚未做真实 Cloud 首声测速。

## 二、当前接入到哪一层

Google Cloud 是另一套产品和认证，不等于现有 Gemini API Key。当前已经接入的是同步 `synthesizeSpeech` 适配器，行为与 Cactus 的句级 TTS 相同：每个完整短句单独合成，句与句可以流水预取，但单句内部仍需等完整音频返回。完整配置步骤见 [API 配置指南](API_SETUP.md)。

尚未接入的是更复杂的真正音频流式层：

- [Cloud Text-to-Speech StreamingSynthesize](https://cloud.google.com/text-to-speech/docs/create-audio-text-streaming) 提供双向流式合成，官方页面说明流式合成适用于 Chirp 3 HD voices；
- [Cloud Speech-to-Text v2 StreamingRecognize](https://cloud.google.com/speech-to-text/v2/docs/streaming-recognize) 通过 gRPC 持续发送音频并接收增量结果；
- 两者需要 Google Cloud 项目、启用 API、结算/配额和独立 Cloud 凭证，而不是把现有 AI Studio Key 换个变量名；
- 当前开发机没有用户 Cloud 凭证，所以仓库不能诚实地声称已经完成真实 Google Cloud 调用或流式验收。

生产版若采用 Google Cloud，建议把目标定为“真实设备测得的首字 / 首声 P50 与 P95”，而不是写死未经实测的毫秒宣传值。接入前还要确认项目所在区域、中文 voice / recognizer 可用性、费用上限和数据处理条款。

## 三、RAG 数据放在哪里

RAG 不是远程数据库，也没有隐藏在 Gemini 账号里。唯一运行时知识包是：

```text
knowledge/shoujian-rag.v1.json
```

它约 171 KB，包含：

- 64 条卦级记录：卦辞、《彖》和大象；
- 384 条爻级记录：爻辞和小象；
- 8 条《说卦》八卦取象；
- 运行时共构建 456 个可引用片段。

来源是中文维基文库《周易》逐卦页面和《易传／说卦》的固定修订。来源 URL、页面 ID、修订 ID、修订时间、原 wikitext SHA-256 和许可字段都保存在知识包；边界与许可见 `knowledge/README.md`。

## 四、RAG 是怎么构建和运行的

```text
已审查的公开经传结构化数据
  → scripts/import-open-knowledge.mjs
  → knowledge/shoujian-rag.v1.json（只读、版本化）
  → 服务启动时 loadKnowledgeBase()
  → OracleKnowledgeBase 在内存构建 456 个片段
  → 每轮按问题 + 本卦 + 动爻 + 之卦 + 上下卦检索
  → 最多 8 条证据进入系统提示词
  → 模型回答必须使用本轮【证据编号】
  → validateCitations() 拒绝无引用或白名单外引用
  → 页面展示片段、源号和原始来源链接
```

关键文件：

- 导入：`scripts/import-open-knowledge.mjs`
- 数据：`knowledge/shoujian-rag.v1.json`
- 加载与检索：`server/knowledge-retriever.mjs`
- 提示词组装：`server/prompt.mjs`
- 引用白名单校验：`server/index.mjs`
- 固定质量集：`evaluation/rag-cases.json`
- 评测器：`scripts/evaluate-rag.mjs`

当前检索不是向量数据库，也没有调用 embedding API。456 条资料规模很小，检索器使用可解释的混合规则：

- 当前本卦、实际动爻、之卦和上下卦强制高权重；
- 卦名、爻位、经传短语和 2/3/4 字符 n-gram 负责自由知识问题；
- “九五”“卦辞”“大象”“《说卦》取象”等意图单独加权；
- 域外闲聊允许返回空证据，不为了显示 RAG 而硬塞来源。

这比在 456 条片段上增加向量数据库更快、更透明，也能精确测试“实际动爻必须召回”“无关问题必须空召回”。将来加入大量现代注疏、案例、风水典籍和跨文献同义问题后，再升级为 BM25 + embedding reranker / 向量库更合理；升级时仍应保留当前的卦象强绑定与引用白名单，不能让相似度搜索覆盖确定性事实。

## 五、怎样自己复验

```powershell
npm test
npm run eval:rag
npm run check
```

`npm run eval:rag` 只测本地检索，不调用模型、不消耗 API 额度。真实语音 API 的速度属于账号、模型、网络和当时容量共同作用的外部结果，应单独记录，不和自动测试混写。
