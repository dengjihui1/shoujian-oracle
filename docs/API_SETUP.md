# 云端 API 配置指南

本文对应项目 `0.11.0`。模型和免费额度会变化；下面的模型 ID 已在 2026-09-22 通过当前账号的真实状态与请求核验。

## 1. 准备条件

- Node.js 24 或更高版本（启动脚本使用 Node 的环境代理支持）；
- 可以使用 Google AI Studio 与 Gemini API 的地区和账号；
- Chrome、Edge 等支持 `MediaRecorder` 的现代浏览器；
- 麦克风权限（语音输入需要）。

Google 的免费层依模型、地区、账号状态和当日配额而异，不能保证每个账号都可用。免费层请求可能被用于改进 Google 产品；若内容敏感，请不要开启云端模式。

## 2. 创建密钥

1. 打开 [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)；
2. 登录 Google 账号，按页面提示创建或选择项目；
3. 点击创建 API key，并把密钥保存在你自己的密码管理器中；
4. 不要把密钥粘贴到聊天、截图、前端 JS 或 GitHub Issue。

## 3. 配置本机

在项目目录执行：

```powershell
Copy-Item .env.example .env
notepad .env
```

最小配置只需填写第一项：

```dotenv
GEMINI_API_KEY=你的密钥
GEMINI_FAST_MODEL=gemini-3.1-flash-lite
GEMINI_FAST_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.6-flash
GEMINI_GROUNDED_MODEL=gemini-3.1-flash-lite
GEMINI_GROUNDED_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.6-flash
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TIMEOUT_MS=60000
HTTPS_PROXY=
PORT=8000
```

`.env` 已被 Git 忽略。项目的浏览器代码无法读取这个文件；只有本机 Node 服务会在请求 Google 时使用密钥。

如果所在网络不能直接连接 Google API，在 `HTTPS_PROXY=` 后填写本机代理，例如 `http://127.0.0.1:9674`。启动命令使用 Node 24 的环境代理支持；可以直连时保持空白。不要把带有代理认证信息的地址提交到 GitHub。

### 可选文字兜底

现在不注册额外 Key 也能正常使用。若要避免 Gemini 429 / 503 成为单点，优先增加一个 Groq Key：

1. 打开 [Groq API Keys](https://console.groq.com/keys)，登录后创建密钥；
2. 在 [Groq Models](https://console.groq.com/docs/models) 选择当前可用的文字模型；
3. 只在本机 `.env` 增加 `GROQ_API_KEY` 和 `GROQ_CHAT_MODEL`；
4. 重启服务。Gemini 正常时仍优先使用 Gemini，只有瞬态失败才切换。

也可使用 `OPENROUTER_API_KEY` + `OPENROUTER_CHAT_MODEL`、`SILICONFLOW_API_KEY` + `SILICONFLOW_CHAT_MODEL`，或用 `OPENAI_COMPAT_API_KEY / BASE_URL / MODEL / PROVIDER` 接任意兼容服务。不要把 Key 发给他人，也不要放进浏览器代码。

## 4. 启动与验收

```powershell
npm test
npm run eval:rag
npm run check
npm start
```

打开 `http://127.0.0.1:8000/`，依次检查：

1. 顶部显示“墨衡云端 · 周易 RAG 已连接”，并显示“64 卦 · 8 八卦 · 456 条冻结片段”；
2. 输入“你是谁”，点击“直接问墨衡”，应得到普通自然回答且不会自动起卦；
3. 输入“今天是几号”，应按页面服务端的 `Asia/Shanghai` 当前日期回答；
4. 观察回答气泡：网络分片到达后文字应持续增长并显示闪烁光标，而不是等整段完成后一次出现；
5. 输入“我叫小明，请记住”，再问“我叫什么”；刷新页面后再问一次，均应回答“小明”；
6. 输入“潜龙勿用是什么意思”，点击“直接问墨衡”，回答应标为“墨衡 · RAG”并能展开 `ZY-01-LINE-1`；
7. 提交“未来三个月，这门生意和投资是否值得继续？”，点击“以此问起卦 · 仅供参考”；页面应说明该主题只给观察角度，但仍进入待起卦状态；
8. 起卦后输入任意相关追问，回答旁显示“墨衡 · RAG”，并能展开本卦、实际动爻和之卦来源；刷新页面后应仍显示相同原问和卦象；
9. 支持浏览器实时识别时，点击“实时语音输入”，说话期间文字应逐步进入输入框；停止后仍可修改再提交；
10. 不支持实时识别时，页面显示“按下说话”，停止后使用 Gemini 单请求内联音频转写，失败时才退回 Files API；
11. 打开“语音回答”再提问：第一句完整文字出现后，人物应先显示“润声”，无需等整段回答完成才发起 TTS；
12. 开始播放后人物显示“开口”，嘴部和音量柱应随真实声音变化；句间顺序不能颠倒；
13. 文字完成后输入框必须立即恢复，剩余语音可继续在后台生成和播放；此时提交新问题应立即停止旧语音；
14. 若 TTS 配额不足，人物应显示“失声”和错误说明，但文字回答及下一轮输入仍然正常；
15. 回答期间应出现“停止回答”，转写期间应出现“取消转写”，两者均可恢复可输入状态；
16. 在窄屏浏览器中，虚拟人舞台应移到对话上方，人物、输入框和按钮均不能横向溢出。

项目不会把转写内容自动发送为问题，用户可以先检查文字再点“送问”。实时识别最长 45 秒；只有浏览器不支持实时识别时才录制文件，上传上限 6 MB。Gemini 优先直接接收内联音频；仅在模型拒绝内联格式时使用 Files API，并尽力立即删除临时文件。

## 5. 云端能力分别做什么

| 能力 | 默认模型 | 接口 | 本项目职责 |
| --- | --- | --- | --- |
| 自由对话 / RAG | `gemini-3.1-flash-lite`；备用 3.5 / 3.6 与可选兼容供应商 | `streamGenerateContent?alt=sse` / OpenAI-compatible chat | SSE 真流式输出；首包前可跨模型、跨供应商回退；已有分片后断流则恢复完整答案 |
| 语音转文字 | 浏览器语音服务；兜底 `gemini-3.5-transcribe` | 实时识别；Interactions 内联音频；Files API 最终兜底 | 优先返回增量文字，避免等待完整录音上传 |
| 文字转语音 | `gemini-3.1-flash-tts-preview` | Interactions API | 按完整句预取 2 段 24 kHz PCM；重复合成合并并命中有界缓存；Web Audio 顺序播放并驱动人物口型 |

起卦不调用模型：六个爻值、本卦、动爻和之卦仍由 `src/oracle-engine.js` 在浏览器本地机械计算。Gemini 只能解释只读结果与本轮冻结片段。

知识检索也不让 Gemini 自由编出处：服务端从 `knowledge/shoujian-rag.v1.json` 的 456 条冻结片段中选择最多 8 条，随请求发送给 Gemini；模型没有标源或引用本轮未检索源号时，服务端拒绝整条回答。回答页面会公开本轮片段、层次和维基文库源链接。

服务端每轮把当前 `Asia/Shanghai` 时钟写入系统提示词。最近 24 条完成的对话、当前原问和六爻快照仅保存在当前浏览器 `localStorage`，刷新后由本地确定性引擎重建同一卦；每次请求最多发送最近 16 条且总计约 6000 字符，错误、取消、未完成回答及其孤立问题不会进入后续模型上下文。“清除本机记忆”可立即删除这些记录，服务端不建立用户档案。

## 6. 常见问题

- 显示“本地有限对话”：确认文件名确实是 `.env`，重启 `npm start`，并检查变量名。
- 显示已连接但送问后提示网络错误：密钥已被读取，但 Node 无法连接 Google；确认本机代理正在运行，并填写 `HTTPS_PROXY` 后重启。
- `quota_exceeded`：当前已配置的模型链都没有可用额度或容量；稍后重试、检查对应控制台，或按上面的步骤配置一个兼容文字兜底。
- 地区不可用：这是 Google 账号或地区限制；项目会保留本地起卦，不能通过代码合法绕过。
- 麦克风按钮不出现：浏览器不支持录音，或当前没有连接 Gemini；使用 `127.0.0.1`/HTTPS 并允许麦克风。
- 能转写但没有声音：浏览器可能拦截自动播放；先手动点击页面按钮，再重试语音回答。
- 一句话很长时迟迟没有声音：流式分句器会优先等待句号、问号等终止符，达到约 72 字后在逗号附近强制切分，以降低首句开声延迟。
- 回答已经出现但中途网络抖动：0.11.0 会用同一系统约束和检索证据恢复完整回答，再通过 `replace` 事件原位替换半截文本；若恢复请求也失败，才显示稳定错误提示。
- 模型下线：修改 `.env` 中对应的 `FAST / GROUNDED / TTS / TRANSCRIBE` 模型 ID，不需要改源码；先到官方模型页核对替代型号。

## 7. 上线前的密钥原则

这个示例服务默认只监听 `127.0.0.1`，适合本机学习。公开部署时必须额外加入用户认证、按用户配额、持久化限流、HTTPS、日志脱敏、知识版本监控和账单告警；不要把你个人的 Gemini 密钥直接提供给匿名公网访问者。

## 官方资料

- [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API 定价与免费层](https://ai.google.dev/gemini-api/docs/pricing)
- [音频转写](https://ai.google.dev/gemini-api/docs/transcribe)
- [文本转语音](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Files API](https://ai.google.dev/gemini-api/docs/files)
- [Interactions API 文本生成](https://ai.google.dev/gemini-api/docs/text-generation)
- [Groq OpenAI 兼容接口](https://console.groq.com/docs/openai)
- [OpenRouter API](https://openrouter.ai/docs/api-reference/overview)
