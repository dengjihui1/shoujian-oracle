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
- `blocked` 表示不应起卦；
- `rewrite` 表示可以改成更小、更可观察的问题；
- 没有命中只代表公开字规没发现问题，不代表系统理解了隐藏意图。

可以尝试新增一条规则，并为它补一项测试。

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
- 每条返回证据都有稳定源号、原文、层次、许可与源页面；
- 没有命中时返回空证据，不生成装饰性出处。

然后看 `server/prompt.mjs`，理解为什么 Gemini 只能引用本轮检索片段，以及服务端怎样拒绝未检索源号。

### 5. 再看云端适配器

按顺序看 `src/api-client.js`、`server/index.mjs`、`server/gemini-client.mjs` 和 `server/prompt.mjs`：

- 浏览器永远不接触 Gemini 密钥；
- 服务端先做长度、类型和问题边界校验；
- 每轮由服务端注入可信的 `Asia/Shanghai` 当前时间，模型不得自行猜日期；
- 自由回答使用 Gemini `streamGenerateContent` SSE，浏览器解析 `meta / delta / done / error` 事件；
- 语音优先使用浏览器实时识别并持续更新输入框；不支持时把短音频内联交给 Transcribe，只有格式不兼容才使用 Files API；
- 提示词把本地计算结果标为只读，模型不能重新排卦，并把本轮 RAG 片段作为唯一经传证据；
- `fetch` 可以注入，所以测试不需要真实密钥或额度。

再看 `audio-recorder.js` 与 `audio-player.js`，理解实时转写、WebM/base64 兼容兜底、PCM 包装 WAV，以及为什么文字会话不能等待 TTS 完成。新问题通过取消令牌淘汰旧音频，避免慢请求把界面锁死。

### 6. 最后看 UI 状态机与视图拆分

打开 `src/shoujian-oracle.js`：

- `question` 阶段可“直接问墨衡”进行普通闲聊或经传 RAG，也可“以此问起卦”；
- `ready` 阶段冻结原问并等待起卦；
- `reading` 阶段显示结果、自由输入和可展开来源；有 Gemini 时不再用固定追问按钮限制用户；
- `sendText()` 是对话入口；
- `askCloud()` 在同一条气泡里消费流式分片并逐字符揭示；
- `restoreMemory()` / `persistMemory()` 通过 `conversation-memory.js` 只在浏览器本机保留最近 24 条完成对话，并从六爻快照恢复相同卦象；
- `cast()` 只负责连接随机适配器与纯计算层；
- `render()` 只收集状态，`oracle-view.js` 负责转义并投影为 Shadow DOM；
- `streaming-text.js` 把网络分片变成可取消的字符级显示，并在积压过多时自动提速；
- 录音、转写、文字回答和后台 TTS 使用分离的取消令牌，录音期间禁止并发提交文字。

## 可练习的小改动

1. 为知识检索增加新的可解释同义词，但保留本卦和动爻的强绑定；
2. 将随机起卦换成用户手动录入六个 6/7/8/9；
3. 给 `question → ready → reading` 写一个纯状态机模块，并保持现有会话快照兼容；
4. 给 API 客户端增加重试按钮，但不要自动重放可能计费的请求；
5. 写浏览器测试，确认原问通过后不能在起卦前被悄悄替换。

不要把住宅知识、主项目案卷或支付能力作为练习复制进来；它们属于另一个产品边界。新增经传数据必须登记来源、修订、许可和结构改动。
