# 云端 API 配置指南

本文对应项目 `0.26.0`。模型、音色、免费额度和控制台界面会变化；下面的 Gemini 模型 ID 已在 2026-09-22 通过当前账号的真实状态与请求核验，Google Cloud TTS 适配器已通过自动测试，但仍需用你自己的 Cloud 凭证完成真实调用验收。

## 1. 准备条件

- Node.js 24 或更高版本（启动脚本使用 Node 的环境代理支持）；
- 可以使用 Google AI Studio 与 Gemini API 的地区和账号；
- Chrome、Edge 等支持 `SpeechRecognition / webkitSpeechRecognition` 或 `MediaRecorder` 的现代浏览器；
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

## 4. 可选：配置 Google Cloud TTS

这一步只负责“云端音色”，不负责对话，也不负责浏览器实时转写。三个凭证的职责不要混淆：

| 配置 | 负责什么 | 是否必需 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 自由对话、RAG、Gemini 录音转写兜底；未配置 Cloud TTS 时也负责云端语音 | 必需 |
| 浏览器 `SpeechRecognition` | 支持时直接做实时增量转写 | 不需要项目 API Key |
| `GOOGLE_CLOUD_TTS_API_KEY` 或 ADC / 服务账号 | Google Cloud Text-to-Speech | 可选，二选一 |

### 4.1 创建项目并启用 API

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)；
2. 在页面顶部创建或选择一个项目，记下“项目 ID”，不是只记项目显示名称；
3. 给该项目关联结算账号。Cloud TTS 的免费额度和价格以控制台当日显示为准；
4. 打开“API 和服务 → 库”，搜索 **Cloud Text-to-Speech API**；
5. 进入后点击“启用”。不要误开成 Gemini API，也不需要为浏览器实时转写启用 Cloud Speech-to-Text。

### 4.2 本机开发：受限 API Key

1. 打开“API 和服务 → 凭据”；
2. 点击“创建凭据 → API 密钥”；
3. 立即进入“修改 API 密钥”；
4. 在“API 限制”选择“限制密钥”，只勾选 **Cloud Text-to-Speech API**；
5. 本机网络出口固定时可再加 IP 限制；出口经常变化时至少保留 API 限制，并只把 Key 放在本机服务端；
6. 在项目根目录的 `.env` 增加：

```dotenv
GEMINI_API_KEY=你原来的AI-Studio密钥
GOOGLE_CLOUD_TTS_API_KEY=你新建的Cloud-TTS受限密钥
GOOGLE_CLOUD_PROJECT=你的项目ID
GOOGLE_CLOUD_TTS_LANGUAGE=cmn-CN
GOOGLE_CLOUD_TTS_VOICE=cmn-CN-Wavenet-B
GOOGLE_CLOUD_TTS_SPEAKING_RATE=0.92
GOOGLE_CLOUD_TTS_PITCH=-3
GOOGLE_CLOUD_TTS_SAMPLE_RATE=24000
```

`GEMINI_API_KEY` 和 `GOOGLE_CLOUD_TTS_API_KEY` 不是同一个 Key。API Key 方案由官方客户端作为服务端凭证使用；如果账号、组织策略或部署平台拒绝 API Key 鉴权，改用下一节的 ADC / 服务账号方案。

### 4.3 更稳妥的 ADC / 服务账号方案

生产环境优先使用平台附加的服务账号或 Application Default Credentials，避免长期 JSON 密钥。Windows 本机也可按下面方式配置：

1. 在 Cloud Console 打开“IAM 和管理 → 服务账号”；
2. 创建只供守简使用的服务账号，并只授予 Text-to-Speech 所需的最小权限；控制台可用时选择 **Cloud Text-to-Speech User**；
3. 本机开发若必须使用 JSON，进入该服务账号的“密钥 → 添加密钥 → 创建新密钥 → JSON”；
4. 把下载文件移到仓库外，例如 `C:\Users\你的用户名\.config\shoujian\service-account.json`；
5. 删除或注释 `.env` 中的 `GOOGLE_CLOUD_TTS_API_KEY`，改填绝对路径：

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\你的用户名\.config\shoujian\service-account.json
GOOGLE_CLOUD_PROJECT=你的项目ID
GOOGLE_CLOUD_TTS_LANGUAGE=cmn-CN
GOOGLE_CLOUD_TTS_VOICE=cmn-CN-Wavenet-B
```

也可安装 Google Cloud CLI 后执行 `gcloud auth application-default login` 使用本机 ADC，此时不必在仓库中保存 JSON，但要在 `.env` 加入 `GOOGLE_CLOUD_TTS_ENABLED=true` 才会显式启用该供应商。部署在带附加服务账号的 Google Cloud 运行环境时也使用这个开关。不要把 API Key、JSON 内容或凭证截图发到聊天中，也不要提交到 GitHub；本项目已忽略 `.env`、`.secrets/` 和 `*-service-account.json`，但仓库外保存仍更安全。

### 4.4 重启并确认真的切换

```powershell
# 先在正在运行服务的终端按 Ctrl+C
npm start
```

另开一个 PowerShell：

```powershell
(Invoke-RestMethod http://127.0.0.1:8000/api/status) | ConvertTo-Json -Depth 5
```

看到以下结果才说明新进程读取了 Cloud TTS 配置：

```json
{
  "cloud": true,
  "speechProvider": "google-cloud-tts",
  "transcribeProvider": "gemini"
}
```

然后打开页面，开启“语音回答”，切到“云端音色”，发送一句从未合成过的短句。第一次请求应显示 `cache=miss`，重复同一句应命中缓存。真实首声速度必须以你自己的账号、网络和音色实测，项目不能在配置前承诺固定毫秒数。

## 5. 启动与验收

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
11. 打开“语音回答”默认进入“极速”模式；第一句完整文字出现后直接交给浏览器语音引擎，不等待 Gemini TTS；
12. 点击“切换到云端音色”：已配置 Cloud 凭证时使用 Google Cloud TTS，否则使用 Gemini TTS；开始播放后人物显示“开口”，句间顺序不能颠倒；云端模式按 PCM 真实音量驱动，极速模式按朗读节奏驱动；
13. 文字完成后输入框必须立即恢复，剩余语音可继续在后台生成和播放；此时提交新问题应立即停止旧语音；
14. 若 TTS 配额不足，人物应显示“失声”和错误说明，但文字回答及下一轮输入仍然正常；
15. 回答期间应出现“停止回答”，转写期间应出现“取消转写”，两者均可恢复可输入状态；
16. 在窄屏浏览器中，虚拟人舞台应移到对话上方，人物、输入框和按钮均不能横向溢出。

项目不会把转写内容自动发送为问题，用户可以先检查文字再点“送问”。实时识别最长 45 秒；只有浏览器不支持实时识别时才录制文件，上传上限 6 MB。Gemini 优先直接接收内联音频；仅在模型拒绝内联格式时使用 Files API，并尽力立即删除临时文件。

## 6. 云端能力分别做什么

| 能力 | 默认模型 | 接口 | 本项目职责 |
| --- | --- | --- | --- |
| 自由对话 / RAG | `gemini-3.1-flash-lite`；备用 3.5 / 3.6 与可选兼容供应商 | `streamGenerateContent?alt=sse` / OpenAI-compatible chat | SSE 真流式输出；首包前可跨模型、跨供应商回退；已有分片后断流则恢复完整答案 |
| 语音转文字 | 浏览器语音服务；兜底 `gemini-3.5-transcribe` | 实时识别；Interactions 内联音频；Files API 最终兜底 | 优先返回增量文字；当前不是 Google Cloud STT v2 |
| 极速文字转语音 | 浏览器优先本地普通话音色 | Web Speech Synthesis | 无项目服务端 TTS 往返；音色和启动速度取决于浏览器 / 操作系统 |
| 云端文字转语音 | 优先 `cmn-CN-Wavenet-B`；未配置时回退 `gemini-3.1-flash-tts-preview` | Google Cloud `synthesizeSpeech` / Gemini Interactions API | 按完整句预取 2 段 24 kHz PCM；重复合成合并并命中有界缓存；当前是句级流水线，不是句内音频流式 |

起卦不调用模型：六个爻值、本卦、动爻和之卦仍由 `src/oracle-engine.js` 在浏览器本地机械计算。Gemini 只能解释只读结果与本轮冻结片段。

知识检索也不让 Gemini 自由编出处：服务端从 `knowledge/shoujian-rag.v1.json` 的 456 条冻结片段中选择最多 8 条，随请求发送给 Gemini；模型没有标源或引用本轮未检索源号时，服务端拒绝整条回答。回答页面会公开本轮片段、层次和维基文库源链接。

服务端每轮把当前 `Asia/Shanghai` 时钟写入系统提示词。最近 24 条完成的对话、当前原问和六爻快照仅保存在当前浏览器 `localStorage`，刷新后由本地确定性引擎重建同一卦；每次请求最多发送最近 16 条且总计约 6000 字符，错误、取消、未完成回答及其孤立问题不会进入后续模型上下文。“清除本机记忆”可立即删除这些记录，服务端不建立用户档案。

## 7. 常见问题

- 显示“本地有限对话”：确认文件名确实是 `.env`，重启 `npm start`，并检查变量名。
- 显示已连接但送问后提示网络错误：密钥已被读取，但 Node 无法连接 Google；确认本机代理正在运行，并填写 `HTTPS_PROXY` 后重启。
- `quota_exceeded`：当前已配置的模型链都没有可用额度或容量；稍后重试、检查对应控制台，或按上面的步骤配置一个兼容文字兜底。
- 地区不可用：这是 Google 账号或地区限制；项目会保留本地起卦，不能通过代码合法绕过。
- 麦克风按钮不出现：浏览器不支持录音，或当前没有连接 Gemini；使用 `127.0.0.1`/HTTPS 并允许麦克风。
- 能转写但没有声音：浏览器可能拦截自动播放；先手动点击页面按钮，再重试语音回答。
- `/api/status` 的 `speechProvider` 仍是 `gemini`：确认 Cloud 变量写在 `.env`、变量名无误，并在旧服务终端按 `Ctrl+C` 后重新运行 `npm start`；只刷新浏览器不会重载服务端环境变量。
- Google Cloud 返回权限或凭证错误：先确认项目已启用 Cloud Text-to-Speech API、结算有效、Key 已限制到正确 API；若组织策略不允许 API Key，改用 ADC / 服务账号。
- 一句话很长时迟迟没有声音：极速模式约 40 字软切分，云端模式约 72 字软切分；两者都优先使用句号、问号等自然终止符。
- 回答已经出现但中途网络抖动：当前版本会用同一系统约束和检索证据恢复完整回答，再通过 `replace` 事件原位替换半截文本；若恢复请求也失败，才显示稳定错误提示。
- 模型下线：修改 `.env` 中对应的 `FAST / GROUNDED / TTS / TRANSCRIBE` 模型 ID，不需要改源码；先到官方模型页核对替代型号。

## 8. 上线前的密钥原则

这个示例服务默认只监听 `127.0.0.1`，适合本机学习。公开部署时必须额外加入用户认证、按用户配额、持久化限流、HTTPS、日志脱敏、知识版本监控和账单告警；不要把你个人的 Gemini 密钥直接提供给匿名公网访问者。

Docker、正式域名、Caddy 自动 HTTPS、存活 / 就绪探针、结构化脱敏日志和 Redis 共享限流见 [生产部署指南](DEPLOYMENT.md)。

## 官方资料

- [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API 定价与免费层](https://ai.google.dev/gemini-api/docs/pricing)
- [音频转写](https://ai.google.dev/gemini-api/docs/transcribe)
- [文本转语音](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Files API](https://ai.google.dev/gemini-api/docs/files)
- [Interactions API 文本生成](https://ai.google.dev/gemini-api/docs/text-generation)
- [Google Cloud TTS 使用前准备](https://cloud.google.com/text-to-speech/docs/before-you-begin)
- [Google Cloud TTS 认证](https://cloud.google.com/text-to-speech/docs/authentication)
- [Google Cloud API Key 管理](https://cloud.google.com/docs/authentication/api-keys)
- [Google Cloud TTS StreamingSynthesize](https://cloud.google.com/text-to-speech/docs/create-audio-text-streaming)
- [Google Cloud STT v2 StreamingRecognize](https://cloud.google.com/speech-to-text/v2/docs/streaming-recognize)
- [Groq OpenAI 兼容接口](https://console.groq.com/docs/openai)
- [OpenRouter API](https://openrouter.ai/docs/api-reference/overview)
