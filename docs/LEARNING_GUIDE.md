# 代码学习指南

## 推荐阅读顺序

### 1. 先看确定性计算

打开 `src/oracle-engine.js`，按这个顺序理解：

1. `LINE_DEFINITIONS`：为什么 6、9 是动爻；
2. `coinsToLine()`：三枚钱怎样得到一个爻值；
3. `castHexagram()`：六爻怎样拆成下卦和上卦；
4. `KING_WEN_MATRIX`：上下卦怎样映射到 64 卦编号；
5. 动爻翻转后怎样生成之卦。

这里最重要的工程原则是：同样的六个数字永远得到同样的卦，文案不能改变计算结果。

### 2. 再看问题安全边界

打开 `src/question-boundary.js`：

- 每条规则都有 `code / level / label / pattern / reply`；
- `blocked` 只用于即时伤害自己或他人的问题，此时停止起卦并给出现实危机支持；
- `advisory` 表示仍可起卦，但医疗、投资、生意、法律、隐私、长期或多问等主题要附对应参考说明；
- `clear` 表示公开字规没有发现需要额外说明的主题，不代表系统理解了隐藏意图。

可以尝试新增一条规则，并为它补一项测试。

然后打开 `src/response-policy.js`。边界模块只回答“是否适合起卦”，策略模块才结合普通聊天、危机求助和起卦场景决定如何响应。这个拆分避免“只要出现危险关键词，就对普通求助说不能起卦”的错误。

### 3. 理解本地降级对话

打开 `src/dialogue-engine.js`：

- `detectIntent()` 只识别六种明确意图；
- `followUpReply()` 必须读取已经计算出的卦象；
- 未识别内容诚实返回能力菜单，而不是编造回答。

它是无 API 时的可靠降级层，不再是完整能力的上限。

### 4. 学习 RAG 检索层

打开 `server/knowledge-retriever.mjs` 和 `knowledge/shoujian-rag.v1.json`：

- 知识包把 64 个卦级记录、384 个爻级记录和 8 个《说卦》取象拆成 456 个片段；
- 当前本卦、实际动爻、之卦和上下卦使用确定性高权重，不让普通关键词把核心证据挤走；
- 不带当前卦时，可以按卦名、爻位和经传短语检索；
- 明确询问九五等爻位、卦辞或《说卦》取象时，会提升对应证据并抑制无关兄弟片段；
- 每条返回证据都有稳定源号、原文、层次、许可与源页面；
- 没有命中时返回空证据，不生成装饰性出处。

然后看 `server/prompt.mjs`，理解为什么 Gemini 只能引用本轮检索片段，以及服务端怎样拒绝未检索源号。

### 5. 再看云端适配器

按顺序看 `src/api-client.js`、`server/index.mjs`、`server/cloud-client.mjs`、三个供应商适配器和 `server/prompt.mjs`：

- 浏览器永远不接触 Gemini 密钥；
- 服务端先做长度、类型和问题边界校验；
- 每轮由服务端注入可信的 `Asia/Shanghai` 当前时间，模型不得自行猜日期；
- 自由回答使用 Gemini `streamGenerateContent` SSE，浏览器解析 `meta / delta / replace / done / error` 事件；若上游在已有分片后中断，服务端会重新生成完整答案并通过 `replace` 原位恢复；
- 普通问题使用 `fast` 路由，经传 / 解卦使用 `grounded` 路由；当前实测两者默认同用低延迟模型，但保留独立配置和质量备用链；
- `cloud-client.mjs` 只在首字前跨供应商回退，连续瞬态失败会短时熔断；`openai-compatible-client.mjs` 让 Groq、OpenRouter、SiliconFlow 使用同一契约；
- 语音优先使用浏览器实时识别并持续更新输入框；不支持时把短音频内联交给 Transcribe，只有格式不兼容才使用 Files API；
- 提示词把本地计算结果标为只读，模型不能重新排卦，并把本轮 RAG 片段作为唯一经传证据；
- `fetch` 可以注入，所以测试不需要真实密钥或额度。

再看 `speech-segmenter.js`、`speech-queue.js`、`audio-recorder.js`、`browser-speech.js` 与 `audio-player.js`：

- 分句器如何从任意 SSE 边界恢复完整中文句子，并在长句中安全切分；
- 播放队列如何把“并发预取”和“严格按序播放”分开；
- 为什么取消必须同时覆盖待合成请求、当前播放器和后续队列；
- PCM16 如何直接转换成 Web Audio 浮点采样，并用 RMS 音量驱动嘴部叠层；
- Web Audio 不可用时，怎样退回 WAV Blob，而不影响文字回答。
- `server/speech-cache.mjs` 怎样合并相同在途句子，并用哈希键和 LRU / TTL 控制缓存边界。
- `server/google-cloud-tts-client.mjs` 怎样隔离 Cloud 凭证、固定普通话音色参数，并把 Google 的 LINEAR16 WAV 容器还原成现有播放器需要的裸 PCM；对应测试不需要真实 Cloud 账号。

### 6. 最后看 UI 状态机与视图拆分

打开 `src/shoujian-oracle.js`：

- `question` 阶段可“直接问墨衡”进行普通闲聊或经传 RAG，也可“以此问起卦 · 仅供参考”；
- `ready` 阶段冻结原问并等待起卦；
- `reading` 阶段显示结果、自由输入和可展开来源；有 Gemini 时不再用固定追问按钮限制用户；
- `sendText()` 是对话入口；
- `askCloud()` 在同一条气泡里消费流式分片并逐字符揭示；
- `restoreMemory()` / `persistMemory()` 通过 `conversation-memory.js` 只在浏览器本机保留最近 24 条完成对话，并从六爻快照恢复相同卦象；
- `cast()` 只负责连接随机适配器与纯计算层；
- `render()` 只收集状态，`oracle-view.js` 负责转义并投影为 Shadow DOM；
- `streaming-text.js` 把网络分片变成可取消的字符级显示，并在积压过多时自动提速；
- `avatar-state.js` 把录音、转写、推演、润声、开口和卦象阶段映射为可测试的人物状态；
- `speech-segmenter.js` 与 `speech-queue.js` 让首句不必等待整篇回答，并限制最多两句并发预取；
- 录音、转写、文字回答和后台 TTS 使用分离的取消边界，录音期间禁止并发提交文字。

## 可练习的小改动

1. 为知识检索增加新的可解释同义词，但保留本卦和动爻的强绑定；
2. 将随机起卦换成用户手动录入六个 6/7/8/9；
3. 给 `question → ready → reading` 写一个纯状态机模块，并保持现有会话快照兼容；
4. 给最终失败的回答增加由用户点击触发的重试按钮；自动恢复只处理已经开始但中途断开的同一轮回答；
5. 写浏览器测试，确认原问通过后不能在起卦前被悄悄替换。

不要把住宅知识、主项目案卷或支付能力作为练习复制进来；它们属于另一个产品边界。新增经传数据必须登记来源、修订、许可和结构改动。

需要逐文件学习时，使用 [守简模块池](MODULE_POOL.md)：其中给每个运行模块列出了输入输出、依赖、降级路径、测试文件和一个可练习的小改动。
