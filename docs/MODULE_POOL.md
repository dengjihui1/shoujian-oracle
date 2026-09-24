# 守简模块池

这份文档把项目拆成可独立理解、测试和替换的模块。它既是架构索引，也是后续学习与迭代池。编号保持稳定；新增能力优先增加模块或扩展既有模块，不把所有逻辑继续堆进 Web Component。

## 一、全局依赖图

```text
index.html
  └─ P01 Web Component 编排
      ├─ P02 安全视图 ── P03 虚拟人状态 ── P16 动作编排 ── A01 人物素材
      ├─ P04 本机会话记忆
      ├─ P05 流式文字显示
      ├─ P12 对话视口跟随 ├─ P13 键盘提交契约
      ├─ P14 问卦情境访谈 / 摘要确认
      ├─ P15 语音对话状态机
      ├─ P17 本机语音性能汇总
      ├─ P06 浏览器 API 客户端 ─────────────┐
      ├─ P07 录音 / 浏览器实时识别          │
      └─ P08 分句 → P09 TTS 队列 → P10 PCM 播放 / P11 浏览器语音 │
                                               ↓
D01 问题边界 → D02 响应策略 → S11 对话请求准备 → S01 HTTP 服务 → S07 云端供应商池
                                              ├─ S12 请求来源 / 代理边界
                                              └─ S13 请求 ID / 脱敏日志
                  └─ D03 本地降级对话       ├─ S03 Gemini 适配器
D04 起卦纯计算 ──────────────────────────────├─ S06 OpenAI-compatible 适配器
                                             ├─ S02 提示词 / 时间 / 上下文
                                             ├─ S04 RAG 检索 → S10 知识路由 / 引用修复 → K01
                                             ├─ S05 内存 / Redis 共享限流 ├─ S08 TTS 缓存
                                             └─ S09 Google Cloud TTS
K02 知识导入与来源登记 → K01
Q01 行为测试 + Q02 项目体检 + Q03 RAG 评测 + Q04 浏览器 E2E 覆盖全部模块
```

## 二、模块总表

| 编号 | 模块 | 主文件 | 成熟度 | 关键验证 |
| --- | --- | --- | --- | --- |
| P01 | 前端生命周期编排 | `src/shoujian-oracle.js` | 稳定 | 服务器契约、视图与各子模块测试 |
| P02 | 安全视图投影 | `src/oracle-view.js` | 稳定 | `test/oracle-view.test.js` |
| P03 | 虚拟人状态选择 | `src/avatar-state.js` | 稳定 | `test/avatar-state.test.js` |
| P04 | 本机会话记忆与迁移 | `src/conversation-memory.js` | 稳定 | `test/conversation-memory.test.js`、浏览器 E2E |
| P05 | 流式文字揭示 | `src/streaming-text.js` | 稳定 | `test/streaming-text.test.js` |
| P06 | 浏览器 API 客户端 | `src/api-client.js`、`src/stream-limits.js` | 稳定 | `test/api-client.test.js` |
| P07 | 语音输入 | `src/audio-recorder.js` | 稳定 | `test/audio-recorder.test.js` |
| P08 | 中文语音分句 | `src/speech-segmenter.js` | 稳定 | `test/speech-segmenter.test.js` |
| P09 | TTS 预取队列 | `src/speech-queue.js` | 稳定 | `test/speech-queue.test.js` |
| P10 | PCM 播放与嘴型信号 | `src/audio-player.js` | 稳定 | `test/audio-player.test.js` |
| P11 | 极速浏览器语音 | `src/browser-speech.js` | 稳定 | `test/browser-speech.test.js` |
| P12 | 对话视口跟随 | `src/conversation-scroll.js` | 稳定 | `test/conversation-scroll.test.js` |
| P13 | 输入键盘契约 | `src/composer-keys.js` | 稳定 | `test/composer-keys.test.js` |
| P14 | 问卦情境访谈 | `src/divination-intake.js` | 稳定 | `test/divination-intake.test.js`、会话记忆与视图测试 |
| P15 | 直接语音对话状态机 | `src/voice-conversation.js` | 代码稳定，待真实设备指标 | `test/voice-conversation.test.js`、人物与视图测试 |
| P16 | 虚拟人动作编排 | `src/avatar-motion.js`、`src/oracle-view.js` | 稳定 | `test/avatar-motion.test.js`、视图与人物状态测试 |
| P17 | 本机语音性能汇总 | `src/voice-performance.js` | 代码稳定，待真实设备数据 | `test/voice-performance.test.js`、视图测试 |
| D01 | 起卦问题边界 | `src/question-boundary.js` | 稳定 | `test/question-boundary.test.js` |
| D02 | 场景响应策略 | `src/response-policy.js` | 稳定 | `test/response-policy.test.js` |
| D03 | 无云端降级对话 | `src/dialogue-engine.js` | 稳定 | `test/dialogue-engine.test.js` |
| D04 | 三钱六爻纯计算 | `src/oracle-engine.js` | 稳定 | `test/oracle-engine.test.js` |
| S01 | HTTP / SSE 服务壳 | `server/index.mjs` | 稳定 | `test/server-contract.test.js` |
| S02 | 人设、约束、时钟与上下文 | `server/prompt.mjs` | 稳定 | `test/prompt.test.js` |
| S03 | Gemini 供应商适配 | `server/gemini-client.mjs` | 稳定 | `test/gemini-client.test.js` |
| S04 | 可追溯知识检索 | `server/knowledge-retriever.mjs` | 稳定 | `test/knowledge-retriever.test.js` |
| S05 | 内存 / Redis 滑动窗口限流 | `server/rate-limiter.mjs`、`server/redis-rate-limiter.mjs` | 稳定 | `test/rate-limiter.test.js`、`test/redis-rate-limiter.test.js`、CI Redis 冒烟 |
| S06 | OpenAI-compatible 适配 | `server/openai-compatible-client.mjs` | 稳定 | `test/openai-compatible-client.test.js` |
| S07 | 跨供应商路由与熔断 | `server/cloud-client.mjs` | 稳定 | `test/cloud-client.test.js` |
| S08 | TTS 合并与有界缓存 | `server/speech-cache.mjs` | 稳定 | `test/speech-cache.test.js` |
| S09 | Google Cloud TTS 适配 | `server/google-cloud-tts-client.mjs` | 已实现，待真实凭证验收 | `test/google-cloud-tts-client.test.js` |
| S10 | 知识路由与引用修复 | `server/knowledge-routing.mjs` | 稳定 | `test/knowledge-routing.test.js`、服务器契约测试 |
| S11 | 对话请求准备 | `server/chat-preparation.mjs` | 稳定 | `test/chat-preparation.test.js` |
| S12 | 请求来源与代理边界 | `server/request-context.mjs` | 稳定 | `test/request-context.test.js` |
| S13 | 脱敏可观测性 | `server/observability.mjs` | 稳定 | `test/observability.test.js`、服务器契约测试 |
| K01 | 冻结经传知识包 | `knowledge/shoujian-rag.v1.json` | 稳定 | 完整性体检、检索测试 |
| K02 | 公开知识导入 | `scripts/import-open-knowledge.mjs` | 工具 | 人工来源复核、项目体检 |
| A01 | 墨衡人物与品牌素材 | `assets/` | 稳定 | 视图渲染、人工视觉检查 |
| Q01 | 行为与契约测试池 | `test/` | 持续增长 | `npm test` |
| Q02 | 发布体检与仓库边界 | `scripts/check-project.mjs`、CI | 稳定 | `npm run check` |
| Q03 | 固定 RAG 质量 / 性能评测 | `evaluation/rag-cases.json`、`scripts/evaluate-rag.mjs` | 稳定 | `npm run eval:rag` |
| Q04 | 跨浏览器端到端回归 | `e2e/oracle-flow.spec.js`、`playwright.config.js` | 稳定 | `npm run test:e2e` |

成熟度含义：“稳定”表示已有明确契约和自动测试；“工具”表示不在日常运行链路中，变更时需要人工复核产物。

## 三、前端交互池

### P01 前端生命周期编排

- 文件：`src/shoujian-oracle.js`
- 单一职责：把用户事件、三阶段会话、云端流、记忆、录音和 TTS 串成一个可取消生命周期；不负责生成 HTML、计算卦象规则或直接调用 Gemini。
- 输入 / 输出：键盘、按钮、麦克风事件与 API 分片 → 组件状态、消息、卦象和渲染调用。
- 依赖：P02–P11、P15、P16、D01、D03、D04。
- 正常路径：自由对话；明确选择起卦；`question → intake → ready → reading`；卦后自由追问。
- 失败与降级：流式中途断开会尝试恢复完整回答并原位替换；恢复仍失败才结束当前回复；TTS 失败不锁文字；取消会中止当前请求并淘汰旧音频；无云端退回 D03。
- 测试：通过各子模块单测和 `test/server-contract.test.js` 间接覆盖；目前最值得补的是浏览器级组件集成测试。
- 练习：把三阶段转换进一步抽成纯状态机，同时保持现有本机快照兼容。

### P02 安全视图投影

- 文件：`src/oracle-view.js`
- 单一职责：把只读状态投影为 Shadow DOM HTML 和样式。
- 输入 / 输出：组件状态 → 已转义的页面、来源链接、卦卡、虚拟人舞台和无障碍标签。
- 依赖：P03、A01；不发网络请求。
- 正常路径：按阶段展示双入口、卦卡、消息、来源、语音对话面板和人物状态。
- 失败与降级：所有用户文本转义；来源只允许 HTTPS；未知阶段退回 `question`。
- 测试：`test/oracle-view.test.js`。
- 练习：把内联样式拆成 Constructable Stylesheet，并做视觉回归截图。

### P03 虚拟人状态选择

- 文件：`src/avatar-state.js`
- 单一职责：按优先级把普通输入、语音对话和卦象阶段映射成人物表现。
- 输入 / 输出：录音、转写、生成、播放、错误和卦象阶段 → `key / label / detail`。
- 依赖：无，纯函数。
- 优先级：语音对话的倾听 / 听清 / 打断 / 开口 / 推演 → 单次录音 → 辨音 → TTS → 失声 → 卦象阶段。
- 失败与降级：语音失败显示“失声”，但更高优先级的活动状态仍可覆盖它。
- 测试：`test/avatar-state.test.js`。
- 练习：新增人物状态时先补纯映射和优先级测试，再交给 P16 选择动作。

### P04 本机会话记忆

- 文件：`src/conversation-memory.js`
- 单一职责：只保存已完成轮次和可恢复的确定性会话快照，并提供版本化本机 JSON 迁移。
- 输入 / 输出：消息、阶段、原问、六爻或导入 JSON → 最多 24 条本机记录、请求上下文或 `shoujian.oracle-session` v1 文件。
- 依赖：D04 用六爻重建卦象。
- 正常路径：刷新后恢复上下文、阶段和相同卦象；用户可导出、清除，再从文件恢复。
- 失败与降级：导入上限 256 KiB；损坏 JSON、未知 schema / 版本、孤立问题、取消或未完成回复被拒绝或忽略；存储不可用时保持内存会话。
- 测试：`test/conversation-memory.test.js` 覆盖往返和拒绝路径；E2E 覆盖下载、清除和文件恢复。
- 练习：增加导入前预览和差异提示，仍不增加服务器档案。

### P05 流式文字揭示

- 文件：`src/streaming-text.js`
- 单一职责：把任意网络分片变成同一消息中的渐进字符显示。
- 输入 / 输出：SSE 文本块、取消信号、减少动态偏好 → 有序累积文本。
- 依赖：可注入计时器。
- 正常路径：小积压保留逐字感，大积压自动提速；恢复事件可清空半截文本并从完整回答重新揭示。
- 失败与降级：减少动态模式立即显示分片；取消后不再写入。
- 测试：`test/streaming-text.test.js`。
- 练习：测量首字延迟与尾部追赶时间，建立性能预算。

### P06 浏览器 API 客户端

- 文件：`src/api-client.js`
- 单一职责：封装状态、聊天、SSE、转写和语音接口；浏览器永远不接触密钥。
- 输入 / 输出：结构化请求与 `AbortSignal` → JSON、`meta / delta / replace / done / error` 事件。
- 依赖：浏览器 `fetch`，测试时可注入。
- 正常路径：解析跨网络边界拆开的 CRLF / SSE 事件并持续回调。
- 失败与降级：把服务端错误码转换为稳定中文；取消信号原样传递。
- 测试：`test/api-client.test.js`。
- 练习：给恢复也失败的最终错误增加显式、由用户点击触发的重试。

### P07 语音输入

- 文件：`src/audio-recorder.js`
- 单一职责：优先浏览器实时识别，兼容时录制短音频交给 Gemini。
- 输入 / 输出：麦克风音频 → 增量可编辑文字或音频 Base64。
- 依赖：Web Speech API、MediaRecorder、P06。
- 正常路径：实时 interim / final 更新；不支持时录音后单次转写。
- 失败与降级：构造、录制或取消失败都会释放媒体轨；供应商错误转成稳定说明。
- 测试：`test/audio-recorder.test.js`。
- 练习：加入 45 秒倒计时和客户端音量过低提示。

### P08 中文语音分句

- 文件：`src/speech-segmenter.js`
- 单一职责：从任意 SSE 边界提取可立即朗读的完整句，并清理不适合朗读的标记。
- 输入 / 输出：连续文字片段 → 完整短句队列。
- 依赖：无，纯逻辑。
- 正常路径：优先句末标点；达到约 72 字的超长句在中文软标点附近切开，以更早启动 TTS。
- 失败与降级：最后残句由 `flush()` 收束；来源号、Markdown 和 URL 不送去 TTS。
- 测试：`test/speech-segmenter.test.js`。
- 练习：用真实长回答样本建立停顿自然度语料。

### P09 TTS 预取队列

- 文件：`src/speech-queue.js`
- 单一职责：分离“并发合成”和“严格顺序播放”，最多预取两句。
- 输入 / 输出：完整句、合成器、播放器、取消信号 → 有序音频播放。
- 依赖：P06、P10；异步函数均可注入。
- 正常路径：首句到达即合成，下一句可预取，但永不乱序播放。
- 失败与降级：新问题、停止回答或关闭语音会同时取消等待、合成和播放；失败只影响语音。
- 测试：`test/speech-queue.test.js`。
- 练习：记录首句开声时间 P50 / P95，不增加无限预取。

### P10 PCM 播放与嘴型信号

- 文件：`src/audio-player.js`
- 单一职责：播放 Gemini PCM16，并把实时 RMS 音量转换成嘴型驱动值。
- 输入 / 输出：Base64 PCM、采样率 → Web Audio 播放、0–1 音量回调和可取消句柄。
- 依赖：Web Audio；不可用时退回 WAV Blob + `<audio>`。
- 正常路径：PCM16 转 Float32，AnalyserNode 持续计算音量。
- 失败与降级：无 Web Audio 时仍可播放；停止会清理节点、URL 与动画帧。
- 测试：`test/audio-player.test.js`。
- 练习：用静音、爆音和不同音量样本校准嘴型阈值。

### P11 极速浏览器语音

- 文件：`src/browser-speech.js`
- 单一职责：把完整短句直接交给浏览器 Web Speech Synthesis，消除新句等待项目云端 PCM 的合成阶段。
- 输入 / 输出：短句、本机可用音色 → 可取消朗读句柄与 0–1 节奏信号。
- 依赖：浏览器 `speechSynthesis` 与 `SpeechSynthesisUtterance`；不访问密钥或服务端。
- 正常路径：存在本地普通话音色时只在本地候选中优先男声音色提示，采用较沉稳的语速与音高；页面可显式切换回 Gemini 云端音色。
- 失败与降级：浏览器不支持时不展示模式切换并继续使用云端 PCM；失败不影响文字回答。
- 测试：`test/browser-speech.test.js` 与视图模式切换测试。
- 练习：在 Chrome / Edge / Safari 和不同系统建立真实首声 P50 / P95 与音色矩阵。

### P12 对话视口跟随

- 文件：`src/conversation-scroll.js`
- 单一职责：记录用户是否在底部附近、是否有未读内容，并在完整重绘和流式更新后恢复正确滚动位置。
- 输入 / 输出：滚动容器尺寸、旧位置、内容变化 → 跟随 / 上翻保持 / 未读状态。
- 失败与降级：用户主动上翻时绝不强拉；点击“回到最新”后才恢复自动跟随。
- 测试：`test/conversation-scroll.test.js`，并完成桌面和 390 px 页面验收。

### P13 输入键盘契约

- 文件：`src/composer-keys.js`
- 单一职责：把 Enter、Shift+Enter 和中文输入法组字状态转换为可审计的提交决定。
- 输入 / 输出：键盘事件与表单 → 普通聊天提交按钮或不提交。
- 失败与降级：`isComposing` 或历史兼容键码 229 一律不发送；Enter 优先普通聊天，避免误触起卦。
- 测试：`test/composer-keys.test.js` 与真实页面回归。

### P14 问卦情境访谈

- 文件：`src/divination-intake.js`
- 单一职责：根据原问已包含的信息选择最多 4 个现实问题，管理回答、跳过、提前整理、摘要编辑和确认冻结；不执行排卦。
- 输入 / 输出：原问与逐项回答 → `collecting / review / confirmed` 状态和不超过 500 字的问卦摘要。
- 依赖：无；纯状态转换。P04 只负责序列化并兼容旧快照，D04 只在摘要确认后的 `ready` 阶段运行。
- 失败与降级：每项均可跳过，用户可随时提前整理；不索取生辰八字；损坏状态拒绝恢复并退回普通候问。
- 测试：`test/divination-intake.test.js`、`test/conversation-memory.test.js`、`test/oracle-view.test.js` 与真实页面全流程。

### P15 直接语音对话状态机

- 文件：`src/voice-conversation.js`
- 单一职责：把浏览器连续识别、停顿收束、自动提交、回答 / 朗读期回声隔离、显式打断和恢复倾听编排成独立状态机；不生成 HTML、不访问网络、不改变卦象。
- 输入 / 输出：可注入识别器、提交与取消回调、SSE 首字和 TTS 状态 → `off / listening / heard / thinking / speaking / interrupted / error` 快照。
- 正常路径：用户明确点击带“自动发送”的入口后才启动；final 采用短停顿，interim 采用较长停顿；识别停止后送问；文字轮次完成且 TTS idle 后自动恢复倾听。
- 失败与降级：`epoch` 丢弃旧轮迟到事件；打断同时取消旧回答、合成与播放；识别失败保留文字输入并提供重新听；不宣称全双工。
- 指标：每轮记录 ASR 定稿、提交后首字、提交后首声；仓库只提供单轮可视值，P50 / P95 需要真实设备样本。
- 测试：`test/voice-conversation.test.js`、`test/oracle-view.test.js`、`test/avatar-state.test.js`。
- 练习：把真实设备指标导出为本机 JSON，仍不上传服务器或保存原始音频。

### P17 本机语音性能汇总

- 文件：`src/voice-performance.js`、`docs/DEVICE_ACCEPTANCE.md`。
- 单一职责：汇总最近 30 个完整语音轮次的 ASR 定稿、首字和首声毫秒数，计算各自 P50 / P95。
- 输入 / 输出：状态机指标 → 页面汇总与 `shoujian.voice-performance` v1 JSON；没有转写文本、问题、回答或音频。
- 正常路径：同一轮迟到的首声会补全原样本而不重复计数；不完整指标各自使用独立样本数。
- 失败与降级：不足 10 轮时页面明确提示样本不足；刷新后清空，避免建立隐形长期遥测。
- 测试：`test/voice-performance.test.js` 覆盖窗口、去重、百分位、隐私和清空；`test/oracle-view.test.js` 覆盖页面投影。
- 成熟度边界：记录器已完成，真实麦克风、噪声、回声和设备性能仍必须由用户亲自授权并执行。

### P16 虚拟人动作编排

- 文件：`src/avatar-motion.js`、`src/oracle-view.js`
- 单一职责：把 P03 的语义状态映射成低幅度身体动作、环境强调和嘴部规则；动作不决定对话内容，也不读取音频或网络。
- 输入 / 输出：人物表现键与 0–1 音频能量 → 动作键、手势语义、`closed / audio` 嘴部状态。
- 正常路径：静候呼吸与定时眨眼；倾听轻微靠近；听清单次点头；推演轻摆；开口由音频节奏带动；打断回撤后靠近；照卦出现“易 / 观象”令牌。
- 失败与降级：未知状态退回静候；音频能量未过 0.08 或状态不是 `speaking` 时始终闭口；减少动态偏好停用动作但保留状态文字和照卦符号。
- 性能：只改变 `transform / opacity` 等合成友好属性；interim 转写只更新文本节点，不再重建人物舞台。
- 测试：`test/avatar-motion.test.js`、`test/oracle-view.test.js`、`test/avatar-state.test.js`。
- 练习：用视觉回归检查不同宽度下眼睑与面部对齐，不在未验证前增加更大动作幅度。

## 四、领域与安全池

### D01 起卦问题边界

- 文件：`src/question-boundary.js`
- 单一职责：只判断“这段文字是否适合作为起卦原问”，不是通用内容审核器。
- 输入 / 输出：原问 → `clear / advisory / blocked`、命中规则和公开判定说明。
- 依赖：无，纯函数。
- 正常路径：生意、投资、医疗、法律、隐私、长期和多问均以 `advisory` 放行并附参考边界；只有即时伤害自己或他人的问题 `blocked`。
- 失败与降级：只做公开字符匹配，不推断隐藏意图；因此必须由 D02 结合场景解释。
- 测试：`test/question-boundary.test.js`。
- 练习：新增规则时同时写正例和“基础知识问答不应被误伤”的反例。

### D02 场景响应策略

- 文件：`src/response-policy.js`
- 单一职责：区分普通聊天、现实危机与起卦边界，并识别卦后追问是否真的需要当前卦证据；决定放行给 Gemini 还是直接返回确定性响应。
- 输入 / 输出：消息、用户目的、阶段、D01 评估 → `allow` 或带语义类型的直接响应。
- 依赖：D01。
- 正常路径：普通专业话题继续聊天；卦后只有“本卦、动爻、之卦、原问”等追问强制绑定卦证据，明确询问其他卦或《说卦》仍是独立知识问答；各类现实主题起卦照常解释并追加参考说明；现实危机给立即行动步骤。
- 失败与降级：危机回复不依赖模型或额度；不会再把现实求助包装成“不能替你起卦”。
- 测试：`test/response-policy.test.js`、`test/server-contract.test.js`。
- 练习：把地区紧急号码做成部署配置，同时保留默认中国大陆提示。

### D03 无云端降级对话

- 文件：`src/dialogue-engine.js`
- 单一职责：在没有 Gemini 时提供诚实、有限、可审计的主持和卦后追问。
- 输入 / 输出：明确意图与当前卦象 → 固定回答或重置动作。
- 依赖：D02 提供起卦边界文案。
- 正常路径：解释意义、动爻、算法、边界、帮助和另起一问。
- 失败与降级：未知问题直接说明能力范围，不编造自由回答。
- 测试：`test/dialogue-engine.test.js`。
- 练习：新增意图必须保持集合小而可测，不把它扩成另一个脆弱聊天机器人。

### D04 三钱六爻纯计算

- 文件：`src/oracle-engine.js`
- 单一职责：三钱结果到本卦、动爻、之卦和审计轨迹的确定性映射。
- 输入 / 输出：六个 `6 / 7 / 8 / 9` → 上下卦、文王序编号、动爻和之卦。
- 依赖：仅 `crypto.getRandomValues` 外围适配器；核心排卦为纯函数。
- 正常路径：问题文字永不参与结果。
- 失败与降级：爻数、取值或随机源无效时立即失败，不猜测修复。
- 测试：`test/oracle-engine.test.js`。
- 练习：增加手工录入三枚钱六次的适配器，不改核心函数。

## 五、服务端与模型池

### S01 HTTP / SSE 服务壳

- 文件：`server/index.mjs`
- 单一职责：密钥隔离、HTTP 路由、模型调用、引用校验、静态文件和安全响应头；请求准备委托给 S11。
- 输入 / 输出：`/healthz`、`/readyz`、`/api/status`、`chat`、`chat/stream`、`transcribe`、`speech` → 稳定 JSON / SSE。
- 依赖：S02–S11。
- 正常路径：`/healthz` 只检查进程，`/readyz` 检查共享限流依赖；两者都不占聊天限流或调用模型。之后验证用户请求并决定直接响应或调用检索和模型；浏览器断线会中止上游流；供应商在已有分片后断开时，用相同输入和证据恢复完整答案并发出 `replace`。
- 失败与降级：恢复失败后才发脱敏 4xx / 5xx；未配置密钥返回 503；静态路径阻断点文件和目录穿越。
- 测试：`test/server-contract.test.js`。
- 练习：保持 HTTP 读写、SSE 生命周期和领域决策分离，不把 S11 逻辑重新塞回服务壳。

### S02 人设、约束、时钟与上下文

- 文件：`server/prompt.mjs`
- 单一职责：构造墨衡系统约束、只读卦象、可信时钟、RAG 证据与最近上下文。
- 输入 / 输出：阶段、原问、卦象、证据、时间、最近消息 → 模型系统指令和不超过约 6000 字符的最近上下文。
- 依赖：S04 的证据格式化。
- 正常路径：自由问题自然回答；专业基础知识不因关键词被整段拒绝；经传结论必须标证据号。
- 失败与降级：无卦时明确禁止假装看见卦象；日期只认服务端 `Asia/Shanghai` 时钟。
- 测试：`test/prompt.test.js`。
- 练习：建立一组固定问答评测，不用不断加长提示词来修单个例子。

### S03 Gemini 供应商适配

- 文件：`server/gemini-client.mjs`
- 单一职责：封装 Gemini 文本流、语音转写、Files 兼容兜底、TTS 与错误分类。
- 输入 / 输出：系统指令、文本或音频 → 文本块、转写文本或 PCM。
- 依赖：Google Generative Language API；`fetch` 可注入。
- 正常路径：按 `fast / grounded` 场景选择模型链；首模型过载且尚未产出时尝试备用；已有分片后由 S01 恢复；短音频优先内联。
- 失败与降级：取消不重试；供应商错误脱敏；只有格式不兼容才走较慢文件上传。
- 测试：`test/gemini-client.test.js`。
- 练习：新增供应商时实现相同接口，不在前端增加供应商分支。

### S04 可追溯知识检索

- 文件：`server/knowledge-retriever.mjs`
- 单一职责：从冻结包检索本轮可引用片段，并保证当前卦结构证据优先。
- 输入 / 输出：问题、当前卦象、上限 → 最多 8 条带稳定 ID 和源链接的证据。
- 依赖：K01。
- 正常路径：强制纳入本卦、实际动爻、之卦和上下卦，再用字符 grams 补充；明确爻位、卦义和《说卦》取象有独立可解释权重。
- 失败与降级：未知问题返回空，不制造装饰性来源；包结构不完整时启动失败。
- 测试：`test/knowledge-retriever.test.js`。
- 练习：增加可解释同义词表，并为每次召回变化写回归案例。

### S10 知识路由与引用修复

- 文件：`server/knowledge-routing.mjs`
- 单一职责：把检索候选分成普通聊天与必须落地到经传的请求，并提供一次白名单引用修复和自然失败文案。
- 输入 / 输出：用户问题、目的、检索分数与命中原因 → `fast / grounded` 决策、过滤后的证据和修复指令。
- 正常路径：库外或弱相关误召回清空证据走普通模型；明确经传、强词条和当前卦保留冻结证据。
- 失败与降级：首稿漏引或错引时仅用本轮证据再生成一次；第二次仍不合格时原位替换为自然说明，不暴露内部错误码。
- 测试：`test/knowledge-routing.test.js`、`test/server-contract.test.js`。

### S11 对话请求准备

- 文件：`server/chat-preparation.mjs`。
- 单一职责：清洗对话请求，执行 D01 / D02，选择知识证据和 `fast / grounded` 路由，并组装带可信时钟的只读模型输入。
- 输入 / 输出：普通对象、显式注入的知识检索端口与时间函数 → 确定性直接响应，或完整模型请求描述；不启动服务器、不调用模型。
- 正常路径：普通聊天清空弱误召回；起卦绑定固定原问与已清洗卦象；现实危机在检索前返回稳定支持文案。
- 失败与降级：空白和超长文字保留稳定 400 / 413 契约；非法阶段回退到自由对话；非法卦象按无卦处理。
- 测试：`test/chat-preparation.test.js` 覆盖普通聊天、起卦证据、危机短路与输入边界；S01 契约测试继续验证 HTTP 组合。
- 练习：增加新路由维度时先扩展本模块返回契约和直接测试，再接服务壳。

### S12 请求来源与代理边界

- 文件：`server/request-context.mjs`。
- 单一职责：规范化 Socket / `X-Forwarded-For` 地址，并且只在部署显式开启 `TRUST_PROXY` 后信任代理头。
- 正常路径：本机直连按 Socket 限流；受控反向代理部署按首个规范 IP 限流；非法代理值回退 Socket。
- 失败与降级：未开启信任时完全忽略外部代理头，避免匿名用户伪造限流身份。
- 测试：`test/request-context.test.js`。

### S13 脱敏可观测性

- 文件：`server/observability.mjs`。
- 单一职责：生成请求 ID、按固定元数据输出 JSON，并递归遮蔽正文、提示词、Cookie、令牌和密钥字段。
- 正常路径：记录方法、纯路径、状态码、耗时；配置日志盐值时只记录 HMAC 短指纹，不记录原始 IP。
- 失败与降级：日志写出失败不会中断用户请求；未配置盐值时客户端字段为 `null`。
- 测试：`test/observability.test.js` 与健康检查服务器契约。

### S05 内存 / Redis 滑动窗口限流

- 文件：`server/rate-limiter.mjs`、`server/redis-rate-limiter.mjs`。
- 单一职责：按来源地址限制短时 API 请求；本地用内存窗口，生产可用 Redis Lua 原子共享窗口。
- 输入 / 输出：来源键和可注入时间 → 同步或异步的允许结果。
- 隐私：Redis 键只保存独立盐值生成的 HMAC 摘要，不保存原始 IP；成员只含时间与随机请求 ID。
- 正常路径：未配置 `REDIS_URL` 时保持零配置本地运行；生产 Compose 默认启用私网 Redis，多个应用实例共享同一窗口。
- 失败与降级：Redis 模式缺少私有盐时拒绝启动；运行中 Redis 命令失败时请求返回稳定服务错误，不会静默放开限流。
- 测试：内存与 Redis 单元测试、异步服务与就绪探针契约、CI 中真实 Redis 容器冒烟。
- 练习：在有账号的商业系统中，再叠加账号级日配额和供应商实际成本预算；不要把 IP 窗口当付费权益系统。

### S06 OpenAI-compatible 适配

- 文件：`server/openai-compatible-client.mjs`
- 单一职责：把 Groq、OpenRouter、SiliconFlow 或其他兼容接口投影为与 Gemini 相同的文字 / SSE 契约。
- 失败与降级：密钥和上游详情脱敏；取消不重试；浏览器不接触供应商配置。
- 测试：`test/openai-compatible-client.test.js`。

### S07 跨供应商路由与熔断

- 文件：`server/cloud-client.mjs`
- 单一职责：在首字产生前跨供应商回退，并对连续瞬态失败的供应商短时熔断。
- 失败与降级：已经输出文字后不拼接另一供应商的半段回答，而交给 S01 完整恢复。
- 测试：`test/cloud-client.test.js`。

### S08 TTS 合并与有界缓存

- 文件：`server/speech-cache.mjs`
- 单一职责：合并相同在途合成，并以 30 分钟 TTL、48 条 / 24 MB LRU 复用完成音频。
- 失败与降级：键只保存文本与音色的 SHA-256；超大音频不缓存；合成失败不写缓存。
- 测试：`test/speech-cache.test.js`。

### S09 Google Cloud TTS 适配

- 文件：`server/google-cloud-tts-client.mjs`
- 单一职责：用官方 Node 客户端调用 Cloud Text-to-Speech，把凭证、普通话音色参数、超时和 LINEAR16 容器适配隔离在单一模块。
- 输入 / 输出：完整短句、服务端 API Key 或显式启用的 ADC / 服务账号 → 24 kHz 裸 PCM Base64、MIME 类型与采样率。
- 依赖：`@google-cloud/text-to-speech`；凭证只从服务端环境变量读取，浏览器不可见。
- 正常路径：配置 Cloud 凭证时由 S07 把云端语音路由到本模块；默认 `cmn-CN-Wavenet-B`，语速 0.92、音高 -3；Google 返回 WAV 时剥离 `data` 块后复用 P10。
- 失败与降级：未配置 Cloud 凭证时不实例化本模块，继续使用 Gemini TTS；无音频、损坏 WAV、配额和上游错误均转换为稳定错误，不把凭证或供应商原始详情发给浏览器。
- 测试：`test/google-cloud-tts-client.test.js` 覆盖请求参数、环境适配、WAV → PCM 和损坏容器；`test/cloud-client.test.js` 覆盖独立 TTS 路由。
- 成熟度边界：自动契约已完成；没有用户 Cloud 凭证，尚未真实测量新句首声 P50 / P95，也未接入单句内部 `StreamingSynthesize`。
- 练习：在不改动 P09 / P10 契约的前提下，增加可注入的真实 Cloud 性能探针，并只记录耗时、供应商和音色，不记录朗读文本。

## 六、知识、素材与质量池

### K01 冻结经传知识包

- 文件：`knowledge/shoujian-rag.v1.json`、`knowledge/README.md`
- 单一职责：提供 64 卦、384 爻与 8 个《说卦》取象，共 456 个可追溯片段。
- 输入 / 输出：只读 JSON → S04 检索片段。
- 依赖：中文维基文库公开来源和许可登记。
- 失败与降级：缺卦、缺爻或 schema 不匹配时项目体检失败。
- 验证：S04 测试、Q02 完整性检查。
- 练习：新增版本必须保留来源、修订日期、许可和 schema 迁移说明。

### K02 公开知识导入

- 文件：`scripts/import-open-knowledge.mjs`
- 单一职责：把允许使用的公开结构化资料转换成 K01 格式。
- 输入 / 输出：公开源 → 可审阅的冻结 JSON。
- 依赖：来源页面结构；不参与日常服务。
- 失败与降级：来源变化时停止并人工复核，不能静默生成半套知识。
- 验证：生成后运行 S04 测试与 Q02。
- 练习：给导入产物增加内容哈希和变更摘要。

### A01 墨衡人物与品牌素材

- 文件：`assets/avatar/`、`assets/brand/`
- 单一职责：提供独立生成、非真人的墨衡中性帧、开口帧和 Jihui 品牌标记。
- 输入 / 输出：静态 WebP / PNG → P02 的 2.5D 人物舞台。
- 依赖：无第三方人物运行时，不包含 Cactus 人物资产。
- 失败与降级：素材加载失败仍保留文字对话与无障碍状态文本。
- 验证：P02 测试与人工视觉检查。
- 练习：新增表情帧前先定义状态契约，避免只堆图片没有行为逻辑。

### Q01 行为与契约测试池

- 文件：`test/*.test.js`
- 单一职责：以 Node 内建测试器覆盖纯函数、异步取消、供应商适配和 HTTP 契约。
- 输入 / 输出：可注入假时间、假 fetch、假音频与假模型 → 可重复的通过 / 失败结果。
- 正常路径：`npm test` 不读取真实密钥、不调用真实 Gemini、不消耗额度。
- 失败与降级：真实浏览器布局、麦克风权限和端到端视觉仍需人工或浏览器自动化补充。
- 练习：每修一个用户可见缺陷，先保留一个能复现它的回归测试。

### Q02 发布体检与仓库边界

- 文件：`scripts/check-project.mjs`、`.github/workflows/ci.yml`、`.gitignore`、`.env.example`
- 单一职责：检查必要文件、完整知识包、疑似密钥与主项目商业核心耦合。
- 输入 / 输出：整个仓库 → 发布前通过 / 失败。
- 正常路径：`npm run check`，再配合 `git diff --check` 和 GitHub CI。
- 远端门禁：CI 还会执行 RAG 评测、生产依赖审计、Compose 与 Caddyfile 解析、真实 Redis 冒烟、镜像构建，并以只读文件系统启动容器访问 `/readyz`。
- 失败与降级：这是静态守门，不代替依赖漏洞扫描、浏览器兼容测试或生产监控。
- 练习：在真实域名部署后，把证书续期、上游配额和 P95 延迟接入外部监控。

### Q03 固定 RAG 质量 / 性能评测

- 文件：`evaluation/rag-cases.json`、`scripts/evaluate-rag.mjs`
- 单一职责：固定经传正例、当前卦案例和域外负例，同时限制平均 / P95 检索耗时。
- 正常路径：`npm run eval:rag`；评测失败以非零状态退出，可直接接入 CI。
- 边界：它验证检索，不把一次模型文案主观评价伪装成完整产品质量分数。

### Q04 跨浏览器端到端回归

- 文件：`e2e/oracle-flow.spec.js`、`playwright.config.js`。
- 单一职责：在 Chromium、Firefox、WebKit 和移动仿真视口中验证前端、Shadow DOM、网络契约和交互状态机的组合行为。
- 输入 / 输出：拦截的稳定 `/api/status`、SSE 与 TTS 失败响应 → 连续三轮、停止后再问、访谈至起卦、语音故障降级、会话迁移与延迟报告的用户可见断言。
- 正常路径：`npm run test:e2e` 启动独立 8018 端口；不读取密钥、不消耗模型或语音额度。CI 会安装固定 Playwright Chromium、Firefox 与 WebKit 后执行 30 条流程。
- 失败与降级：API 模拟验证的是浏览器集成契约，不等于真实 Gemini 质量、真实麦克风权限或 Cloud TTS 延迟验收。
- 练习：新增用户可见故障时，先写一个稳定路由模拟，再补真实外部服务抽样，不让 CI 依赖云端配额。

## 七、推荐学习路径

1. 从 D04 理解“可重复的核心计算”，再看 D01 与 D02 如何把安全判断和响应文案拆开。
2. 看 S04 与 K01，理解 RAG 的证据如何进入 S02，并由 S01 做引用白名单验证。
3. 看 P06 与 P05，跟一遍 SSE 从网络分片到同一气泡逐字显示。
4. 看 P08 → P09 → P10，理解流式文字怎样提前变成按序语音和真实嘴型信号。
5. 最后看 P01，它只负责编排前面这些模块；此时大文件会比从头硬读更容易理解。
6. 每读完一个模块，先运行对应测试，再从“练习”中选一个低风险改动。

## 八、后续迭代池

2026-09-22 用户实测后确认的交互、RAG 降级、问卦访谈、直接语音对话与人物动作问题，已拆成带验收标准的独立任务，见 [用户反馈与下一阶段任务池](USER_FEEDBACK_BACKLOG.md)。该文件优先于下表中的泛化候选描述。

| 优先级 | 候选任务 | 验收标准 | 状态 |
| --- | --- | --- | --- |
| P0 | 浏览器端到端回归 | 连续三轮文字、停止、再问、起卦、TTS 失败均不锁死 | 已完成；0.24.0 在 3 个桌面引擎和 2 个移动视口共 30 / 30 |
| P1 | 固定 RAG 质量评测集 | 经传、取象、当前卦和域外负例同时达到阈值 | 已完成；模型回答评分继续扩展 |
| P1 | 真实设备语音性能预算 | 首字、首句开声、转写完成 P50 / P95 有记录 | 汇总与隐私导出已完成（0.22.0）；真实设备样本待用户授权 |
| P1 | `prepareChat` 纯模块化 | 请求策略、检索和提示词准备可不启动服务器单测 | 已完成（0.19.0，4 个直接测试） |
| P2 | 本地记忆导出 / 导入 | 用户可审阅、清除和迁移，默认仍不上云 | 已完成（0.20.0，JSON v1 + E2E） |
| P2 | 生产部署适配 | HTTPS、反向代理、共享限流、日志脱敏和健康检查有独立指南 | 代码与配置已完成；0.25.0 Redis 共享限流、0.26.0 就绪探针，真实域名和凭证待外部部署 |

“待补”不等于当前功能不可用；它表示要从本地教学组件升级为面向公众的长期服务时，还需要完成的工程层。

当前自动化、真实云端链路和浏览器人工验收结果见 [0.27.0 历史质量基线](QUALITY_BASELINE.md)、[0.28.0 全方位评估](ASSESSMENT_2026-09-23.md)、[0.29.0 后续自检](SELF_ITERATION_2026-09-23.md)与 [0.30.0 浏览器回归](RELEASE_0.30.0.md)。语音队列只在播放器触发开声事件后进入 `playing`；服务端根据六爻重算卦象；卦后普通聊天不再强塞旧卦和原问；用户原问留在用户层消息，不混入系统指令。

0.31.0 的录音并发与累计识别结果回归见 [0.31.0 发布记录](RELEASE_0.31.0.md)。识别器按 `event.results` 的完整快照重建文本，录音器在授权未返回和录制期间拒绝第二次启动；宿主页面离开时会释放迟到的录音授权。

0.32.0 的授权取消与页面恢复见 [0.32.0 发布记录](RELEASE_0.32.0.md)。P07 增加取消令牌；授权迟到时只释放对应流，不创建录音器。P01 在等待授权期间锁住其他送问入口，提供取消按钮；取消后文字输入立即恢复，录音入口待浏览器授权请求返回后重新开放。

0.33.0 的重复识别快照过滤见 [0.33.0 发布记录](RELEASE_0.33.0.md)。P07 只把变化的 final / interim 文本通知 P15，避免浏览器重复事件反复重置自动提交的停顿定时器。

0.34.0 的会话导入边界见 [0.34.0 发布记录](RELEASE_0.34.0.md)。P04 在导入与本机恢复时规范化来源条目，拒绝缺失会话内容，并只保留本项目冻结知识包的 HTTPS 来源；浏览器回归现在会真实刷新页面验证会话可恢复。

0.35.0 的服务端请求体边界见 [0.35.0 发布记录](RELEASE_0.35.0.md)。所有 POST API 共用的 JSON 解析器要求顶层为对象，避免语音与转写端点收到合法 JSON 原始值后抛出 500。

0.36.0 的静态资源边界见 [0.36.0 发布记录](RELEASE_0.36.0.md)。服务端只公开页面、前端模块及所需图片，不再将仓库其他路径当作可下载的网页资源。

0.37.0 的流式经传引用边界见 [0.37.0 发布记录](RELEASE_0.37.0.md)。P08 对含检索证据的回答等引用核验完成后才向页面发送文本；自由闲聊仍保留增量流式显示。

0.38.0 的连续语音打断竞态见 [0.38.0 发布记录](RELEASE_0.38.0.md)。P15 在打断后继续倾听，但会等上一轮提交承诺收束后才真正提交新问题，避免 P01 忙碌状态吞掉新语音。

0.39.0 的上游流边界见 [0.39.0 发布记录](RELEASE_0.39.0.md)。S01 与兼容供应商流解析器限制单个事件和网络块；S01 的 HTTP 层限制单轮回答文字长度，超限时取消上游请求。

0.40.0 的并发边界见 [0.40.0 发布记录](RELEASE_0.40.0.md)。S01 对聊天、转写、朗读共用进程级云端并发上限，超出时返回带 `Retry-After` 的 503；健康与状态接口不占用名额。

0.41.0 的 HTTP 接收期限见 [0.41.0 发布记录](RELEASE_0.41.0.md)。S01 启动入口为请求头、请求体和长连接设显式上界，并限制请求头数量。

0.42.0 的连接中断日志见 [0.42.0 发布记录](RELEASE_0.42.0.md)。S01 记录未正常完成的 HTTP 请求的状态、耗时与请求 ID，同时继续避免记录用户输入和录音。

0.43.0 的聊天总期限见 [0.43.0 发布记录](RELEASE_0.43.0.md)。S01 对非流式与流式聊天的整个云端链路使用同一个取消信号，覆盖模型切换和引用修复，超时后释放并发名额。

0.44.0 的录音转写期限见 [0.44.0 发布记录](RELEASE_0.44.0.md)。S01 对内联转写、必要时的文件上传及后续识别传递取消信号；已取得文件名的上传仍尝试删除。

0.45.0 的供应商熔断修复见 [0.45.0 发布记录](RELEASE_0.45.0.md)。S01 在全部聊天供应商冷却时立即返回服务暂不可用，不再强行重试主供应商。

0.46.0 的浏览器流边界见 [0.46.0 发布记录](RELEASE_0.46.0.md)。P06 与供应商解析器共用网络块、事件和回答长度上限；异常数据会取消响应流。
