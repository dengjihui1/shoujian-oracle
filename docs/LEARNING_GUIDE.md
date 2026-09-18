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

### 3. 先理解本地降级对话

打开 `src/dialogue-engine.js`：

- `detectIntent()` 只识别六种明确意图；
- `followUpReply()` 必须读取已经计算出的卦象；
- 未识别内容诚实返回能力菜单，而不是编造回答。

它是无 API 时的可靠降级层，不再是完整能力的上限。

### 4. 再看云端适配器

按顺序看 `src/api-client.js`、`server/index.mjs`、`server/gemini-client.mjs` 和 `server/prompt.mjs`：

- 浏览器永远不接触 Gemini 密钥；
- 服务端先做长度、类型和问题边界校验；
- 转写先上传 Files API，再把 URI 交给 Transcribe；
- 提示词把本地计算结果标为只读，模型不能重新排卦；
- `fetch` 可以注入，所以测试不需要真实密钥或额度。

再看 `audio-recorder.js` 与 `audio-player.js`，理解 WebM 录音、base64 传输和 PCM 包装 WAV 的边界。

### 5. 最后看 UI 状态机

打开 `src/shoujian-oracle.js`：

- `question` 阶段收问；
- `ready` 阶段冻结原问并等待起卦；
- `reading` 阶段显示结果和追问按钮；
- `sendText()` 是对话入口；
- `cast()` 只负责连接随机适配器与纯计算层；
- `render()` 把当前状态投影为 Shadow DOM。

## 可练习的小改动

1. 增加“这次卦象的上下卦是什么”追问意图；
2. 将随机起卦换成用户手动录入六个 6/7/8/9；
3. 给 `question → ready → reading` 写一个纯状态机模块；
4. 给 API 客户端增加重试按钮，但不要自动重放可能计费的请求；
5. 写浏览器测试，确认原问通过后不能在起卦前被悄悄替换。

不要把住宅知识、主项目案卷或支付能力作为练习复制进来；它们属于另一个产品边界。
