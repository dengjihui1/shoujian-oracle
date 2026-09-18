# Gemini API 配置指南

本文对应项目 `0.3.0`。模型和免费额度会变化；下面的模型 ID 与价格状态已在 2026-09-18 对照 Google 官方文档核验。

## 1. 准备条件

- Node.js 20 或更高版本；
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

只填写第一项：

```dotenv
GEMINI_API_KEY=你的密钥
GEMINI_CHAT_MODEL=gemini-3.8-flash
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
PORT=8000
```

`.env` 已被 Git 忽略。项目的浏览器代码无法读取这个文件；只有本机 Node 服务会在请求 Google 时使用密钥。

## 4. 启动与验收

```powershell
npm test
npm run check
npm start
```

打开 `http://127.0.0.1:8000/`，依次检查：

1. 顶部显示“Gemini 自由对话已连接”；
2. 提交一个低风险、单一且带期限的问题；
3. 起卦后输入任意相关追问，回答旁显示“墨衡 · 云端”；
4. 点击“按下说话”，说完后点“停止并转文字”，转写应进入输入框供你确认；
5. 打开“语音回答”，再提问，浏览器应播放回答。

项目不会把转写内容自动发送为问题，用户可以先检查文字再点“送问”。录音最长 45 秒、上传上限 6 MB；完成转写后，服务会尽力立即删除 Google Files API 中的临时文件。

## 5. 三个 API 分别做什么

| 能力 | 默认模型 | 接口 | 本项目职责 |
| --- | --- | --- | --- |
| 自由对话 | `gemini-3.8-flash` | Interactions API | 墨衡人格与卦象解释 |
| 语音转文字 | `gemini-3.5-transcribe` | Files API + Interactions API | 上传短录音并转写 |
| 文字转语音 | `gemini-3.1-flash-tts-preview` | Interactions API | 返回 24 kHz PCM，浏览器包装成 WAV 播放 |

起卦不调用模型：六个爻值、本卦、动爻和之卦仍由 `src/oracle-engine.js` 在浏览器本地机械计算。Gemini 只能解释只读结果。

## 6. 常见问题

- 显示“本地有限对话”：确认文件名确实是 `.env`，重启 `npm start`，并检查变量名。
- `quota_exceeded`：免费额度或速率已用完，稍后重试，或在 AI Studio 检查配额与结算状态。
- 地区不可用：这是 Google 账号或地区限制；项目会保留本地起卦，不能通过代码合法绕过。
- 麦克风按钮不出现：浏览器不支持录音，或当前没有连接 Gemini；使用 `127.0.0.1`/HTTPS 并允许麦克风。
- 能转写但没有声音：浏览器可能拦截自动播放；先手动点击页面按钮，再重试语音回答。
- 模型下线：只修改 `.env` 中的模型 ID，不需要改源码；先到官方模型页核对替代型号。

## 7. 上线前的密钥原则

这个示例服务默认只监听 `127.0.0.1`，适合本机学习。公开部署时必须额外加入用户认证、按用户配额、持久化限流、HTTPS、日志脱敏和账单告警；不要把你个人的 Gemini 密钥直接提供给匿名公网访问者。

## 官方资料

- [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API 定价与免费层](https://ai.google.dev/gemini-api/docs/pricing)
- [音频转写](https://ai.google.dev/gemini-api/docs/transcribe)
- [文本转语音](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Files API](https://ai.google.dev/gemini-api/docs/files)
- [Interactions API 文本生成](https://ai.google.dev/gemini-api/docs/text-generation)
