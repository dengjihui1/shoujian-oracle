# 墨衡小卦 · 守简版

![Jihui](assets/brand/jihui-wordmark.png)

独立的轻量虚拟卦师与经传 RAG 组件。它保留虚拟人主持、问题边界、三钱六爻和 64 卦确定性映射，并加入可追溯的《周易》《彖》《象》《说卦》冻结知识检索；明确不包含住宅分析、纳甲时证、档案、支付与追验等主项目核心。

![版本](https://img.shields.io/badge/version-0.24.0-8e332a)
![许可](https://img.shields.io/badge/license-MIT-d3b27f)

## 现在能完成什么

1. 墨衡以专属双帧 2.5D 虚拟人迎客；统一动作编排驱动待机呼吸与眨眼、倾听靠近、听清点头、思考、开口、被打断复位和照卦展示；
2. 生意、投资、医疗、法律、感情、长期命运和多问题均可起卦并附对应参考边界；只有即时伤害自己或他人的问题停止起卦并转现实危机支持；
3. 问题通过后，浏览器本机模拟三钱六掷并机械排出本卦、动爻和之卦；
4. 配置 Gemini 后，可以直接闲聊、询问墨衡的身份与能力、问一般基础问题，也可以不先起卦自由问经传知识；
5. 只有点击“以此问起卦”才会固定原问并进入排卦；起卦后既可追问本卦、动爻和之卦，也可随时转回普通聊天，普通问题不会被强塞当前卦的证据；
6. 涉及经传或当前卦象时，服务端从 456 条冻结片段中检索最多 8 条证据，回答下方可展开原文、层次、源号和维基文库页面；
7. 普通聊天会过滤弱相关误召回；经传 / 解卦保留冻结证据，漏引或错引会自动受约束修复一次，仍失败才给自然资料不足说明；回答通过 SSE 真流式传输，若供应商半途断流会恢复并原位替换；
8. 每轮注入 `Asia/Shanghai` 服务器时钟，日期与时间问题不再交给模型猜测；
9. 最近 24 条已完成对话、当前原问和程序卦象保存在当前浏览器本机；刷新后恢复同一阶段与同一卦，每次最多发送最近 16 条且不超过约 6000 字符；
10. 支持浏览器实时语音转写，并在不支持时退回真实 Gemini 单请求内联转写；这不是 Google Cloud STT v2，接口边界明确记录；
11. 语音回答提供“极速浏览器 / 云端音色”切换：配置 Google Cloud 后云端音色自动使用 Google TTS，否则兼容回退 Gemini TTS；两者继续使用两句预取、请求合并和有界缓存；
12. 浏览器直接把 PCM 放进 Web Audio，按真实音量驱动墨衡嘴型与音量柱；不支持 Web Audio 时才回退到 WAV 播放；
13. 回答和转写都可以手动停止；新问题、关闭语音或停止回答都会立即清理旧 TTS 请求和播放队列；
14. TTS 配额或网络失败时显示“失声”和稳定错误说明，文字回答、输入与下一轮对话不受影响；
15. 云端文字回答最终失败时输入立即恢复，并提供用户主动点击的“重试本次回答”，不会重复插入用户问题；
16. 可选配置 Groq、OpenRouter、SiliconFlow 或任意 OpenAI-compatible 文字兜底，连续故障会短时熔断；没有密钥时仍可本地起卦；
17. 固定 RAG 评测集同时守住命中、负例和检索延迟，明确爻位与《说卦》问题不再携带大批无关片段。
18. 对话在底部时自动跟随流式内容，用户上翻时保持原位并显示“回到最新”；`Enter` 发送、`Shift+Enter` 换行，中文输入法组字不会误发。
19. 选择起卦后先进入 2–4 项情境访谈；可跳过、提前整理并编辑问卦摘要，只有确认摘要后才随机排卦，不索取生辰八字，文字不会影响六爻结果。
20. 支持独立“实时语音对话”：用户明确开启后，interim 转写实时可见，定稿或停顿自动送问；回答首个完整短句即进入朗读，朗读时暂停收音，并可“打断并说话”。
21. 页面记录本轮 ASR 定稿、首字和首声延迟，并在本机滚动汇总最多 30 轮 P50 / P95；可导出只含毫秒数的验收报告，不保存录音或转写内容。识别、模型或 TTS 失败后仍保留文字输入；该模式不宣称真正全双工。
22. 本机会话可导出为可审阅 JSON，并在清除或更换浏览器后重新导入；文件只含最近已完成对话和可恢复问卦状态，导入导出不经过项目服务器。
23. 提供非 root Docker、Caddy 自动 HTTPS、`/healthz`、显式代理信任、可注入共享限流边界和不记录对话正文的结构化日志。

问题文字不会改变卦象。项目没有账号、遥测或支付；本地模式不上传内容，云端模式会把用户主动提交的文字、录音、最近上下文和必要卦象证据发送给已配置的供应商。对话记忆只存当前浏览器的 `localStorage`，服务端不建立用户档案。

## 抽取了什么、没有抽取什么

| 主项目来源 | 本项目保留 | 明确排除 |
| --- | --- | --- |
| `MohengGuide` / `mohengPosture` | 人物主持、阶段仪态、边界语气 | 主项目八步宅案状态与本机语音系统 |
| `mohengConsultation` | 主持方式与本地降级思想 | 宅盘结构化案据和完整案门 |
| `oracleQuestionBoundary` | 7 类公开字规 | 问契签名、验期、准绳与追验 |
| `iching` | 6/7/8/9、八卦、文王序 64 卦映射 | 古籍全文、爻辞、纳甲、六亲、旬空、六神 |

经传数据另从中文维基文库公开来源建立独立知识包，不复制主项目住宅知识。语音 API 的真实边界、Google Cloud 配置和 RAG 构建全过程见 [语音 API 与 RAG 架构说明](docs/VOICE_RAG_ARCHITECTURE.md)；从上游 Cactus 提取了什么、拒绝照搬什么见 [Cactus 模块拆解](docs/CACTUS_MODULE_EXTRACTION.md)；完整映射见 [组件抽取与流程图](docs/COMPONENT_MAP.md)，逐模块说明见 [守简模块池](docs/MODULE_POOL.md)，发布验收见 [0.24.0 质量基线](docs/QUALITY_BASELINE.md)。

用户实测确认的交互、RAG 降级、问卦访谈和直接语音对话改进，统一记录在 [下一阶段任务池](docs/USER_FEEDBACK_BACKLOG.md)；任务状态以该文件和实际测试为准。

## 本地运行（无需 API）

```bash
npm install
npm start
```

访问 `http://127.0.0.1:8000/`。此时可以完整起卦，但对话仅支持固定意图。

## 启用真正的语音虚拟人

1. 在 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建 Gemini API 密钥；
2. 复制 `.env.example` 为 `.env`；
3. 只在本机 `.env` 的 `GEMINI_API_KEY` 后填写密钥；
4. 若网络不能直连 Google，在 `.env` 填写 `HTTPS_PROXY=http://127.0.0.1:你的代理端口`；
5. 再运行 `npm start`，页面状态应显示“墨衡云端 · 周易 RAG 已连接”。

不要把真实密钥写进前端、提交到 GitHub，或发送到聊天中。完整配置、模型选择、免费层限制和故障排查见 [API 配置指南](docs/API_SETUP.md)。

云端链路为：

```text
麦克风 → 浏览器实时转写（支持时）→ 可编辑文字
实时语音对话 → 定稿 / 停顿自动提交 → 回答期间暂停识别 → 首句朗读结束后恢复倾听
麦克风 → Gemini 3.5 Transcribe 单请求内联音频（兼容兜底）→ 可编辑文字
普通文字 → Gemini 3.1 Flash Lite SSE（普通 / RAG 场景路由；半途断流恢复）→ 字符级呈现
经传问题或本地卦象 → 冻结知识检索 → 引用白名单校验 → 带来源回答
Gemini 失败 → 可选 OpenAI-compatible 供应商池 → 短时熔断与自动回退
墨衡 SSE 分片 → 中文分句器 → 极速浏览器朗读（默认，不等待 Gemini TTS）→ 节奏驱动开口
墨衡 SSE 分片 → 可切换 Google Cloud / Gemini 云端 TTS → 两句预取 / 合并 / 有界缓存 → 24 kHz PCM 音量驱动开口
```

## 嵌入自己的网页

```html
<script type="module" src="./src/shoujian-oracle.js"></script>
<shoujian-oracle></shoujian-oracle>
```

组件使用 Shadow DOM，不污染宿主页面样式。

## 文件入口

- `src/shoujian-oracle.js`：Web Component 与会话／语音生命周期编排；
- `src/oracle-view.js`：Shadow DOM 视图、卦卡、证据展示和输出转义；
- `src/conversation-memory.js`：完成轮次过滤、最近上下文与可恢复会话快照；
- `src/streaming-text.js`：可取消、积压自适应的字符级显示队列；
- `src/conversation-scroll.js` / `composer-keys.js`：智能跟随、未读提示和输入法安全的键盘发送契约；
- `src/voice-conversation.js`：显式开启、自动送问、回声隔离、打断恢复与 ASR / 首字 / 首声指标状态机；
- `src/voice-performance.js`：最多 30 轮语音延迟 P50 / P95 与不含内容的本机报告；
- `src/avatar-state.js`：虚拟人的可测试语义状态与优先级；
- `src/avatar-motion.js`：人物状态到身体动作、嘴部约束和手势语义的纯映射；无声音时强制闭口；
- `src/speech-segmenter.js`：面向中文流式文本的分句、长句切分与引用标记清理；
- `src/speech-queue.js`：最多两句预取、严格顺序播放和可立即淘汰的 TTS 队列；
- `src/browser-speech.js`：不等待项目云端 TTS 的普通话浏览器语音与可取消播放；
- `src/dialogue-engine.js`：有限意图识别与墨衡回答；
- `src/api-client.js`：浏览器与本机 API 的 JSON/SSE 通信；
- `src/audio-recorder.js` / `audio-player.js`：浏览器实时转写、录音兜底、PCM Web Audio 播放与实时音量分析；
- `src/question-boundary.js`：起卦前问题边界；
- `src/divination-intake.js`：起卦前必要问题选择、跳过 / 提前整理、可编辑摘要与确认冻结；
- `src/response-policy.js`：区分自由聊天、现实危机与起卦边界，并给出可继续的安全路径；
- `src/oracle-engine.js`：三钱六爻与 64 卦纯计算；
- `server/`：密钥隔离、场景模型路由、Gemini / OpenAI-compatible 适配、故障熔断、TTS 缓存、限流和静态服务；
- `server/chat-preparation.mjs`：不启动 HTTP 服务即可测试的输入清洗、响应策略、检索路由与提示词准备；
- `server/knowledge-retriever.mjs`：本卦强绑定与自由问题检索；
- `server/knowledge-routing.mjs`：普通 / 经传相关性路由、一次引用修复和自然降级；
- `server/google-cloud-tts-client.mjs`：官方 Google Cloud TTS 客户端、凭证隔离与 WAV/PCM 适配；
- `server/request-context.mjs` / `observability.mjs`：显式代理信任、客户端限流键、请求 ID 与脱敏结构化日志；
- `knowledge/shoujian-rag.v1.json`：64 卦、384 爻与 8 个说卦取象冻结知识；
- `evaluation/` / `scripts/evaluate-rag.mjs`：固定 RAG 质量集与检索延迟预算；
- `test/`：上述各层的确定性测试。
- `e2e/` / `playwright.config.js`：Chromium、Firefox、WebKit 与移动仿真视口中的关键用户流程回归；
- `docs/MODULE_POOL.md`：全项目模块的学习、测试、成熟度与后续迭代池。
- `docs/DEPLOYMENT.md`：Docker + Caddy HTTPS、健康检查、日志、限流和回滚步骤。
- `docs/DEVICE_ACCEPTANCE.md`：真实麦克风、回声、打断和语音延迟的人工验收步骤与阈值。

## 验证

```bash
npm test
npm run test:e2e
npm run eval:rag
npm run check
```

需要 Node.js 24 或更高版本；首次克隆后先运行 `npm install` 安装锁定依赖。测试不会调用真实 Gemini / Google Cloud，也不会消耗额度。

虚拟人技术取舍、参考项目、许可边界和没有采用 Live2D／VRM 的原因见 [虚拟人研究与实现说明](docs/VIRTUAL_HUMAN_RESEARCH.md)。

## 内容边界

这是传统文化与娱乐体验。任何主题都可作为卦象反思材料，但回答不提供停药、买卖、诉讼等医疗、法律、投资或其他专业指令，也不输出生死、灾祸、疾病、收益、应期或保证性预测。请勿把卦象作为高风险现实决定的唯一依据。

## License

代码使用 [MIT](LICENSE)。冻结经传数据的维基文库编辑层及适用改编按 CC BY-SA 4.0；详见[知识包来源与许可](knowledge/README.md)和[抽取说明](NOTICE.md)。
