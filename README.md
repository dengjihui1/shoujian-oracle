# 墨衡小卦 · 守简版

从“巡宅”中有选择地抽出的轻量虚拟卦师组件。它保留虚拟人主持、问题边界、三钱六爻、64 卦确定性映射和有限追问；明确不包含住宅分析、完整古籍、纳甲时证、档案、支付与追验等主项目核心。

![版本](https://img.shields.io/badge/version-0.3.0-8e332a)
![许可](https://img.shields.io/badge/license-MIT-d3b27f)

## 现在能完成什么

1. 墨衡以虚拟人身份迎客，引导用户把问题缩成一件具体的小事；
2. 公开字符规则拦截医疗、投资、法律、人身安全等高风险问题；
3. 问题通过后，浏览器本机模拟三钱六掷并机械排出本卦、动爻和之卦；
4. 配置 Gemini 后，可以用麦克风说话、自由追问卦象，并让墨衡以语音回答；
5. 没有 API 密钥时自动退回本地有限对话，起卦和基础功能仍然可用。

问题文字不会改变卦象。项目没有账号、遥测或支付；本地模式不上传内容，Gemini 云端模式会把用户主动提交的文字、录音和必要卦象上下文发送给 Google。

## 抽取了什么、没有抽取什么

| 主项目来源 | 本项目保留 | 明确排除 |
| --- | --- | --- |
| `MohengGuide` / `mohengPosture` | 人物主持、阶段仪态、边界语气 | 主项目八步宅案状态与本机语音系统 |
| `mohengConsultation` | 为什么、来源、边界式追问 | 宅盘结构化案据和完整案门 |
| `oracleQuestionBoundary` | 7 类公开字规 | 问契签名、验期、准绳与追验 |
| `iching` | 6/7/8/9、八卦、文王序 64 卦映射 | 古籍全文、爻辞、纳甲、六亲、旬空、六神 |

完整映射见 [组件抽取与流程图](docs/COMPONENT_MAP.md)，学习顺序见 [代码学习指南](docs/LEARNING_GUIDE.md)。

## 本地运行（无需 API）

```bash
npm start
```

访问 `http://127.0.0.1:8000/`。此时可以完整起卦，但对话仅支持固定意图。

## 启用真正的语音虚拟人

1. 在 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建 Gemini API 密钥；
2. 复制 `.env.example` 为 `.env`；
3. 只在本机 `.env` 的 `GEMINI_API_KEY` 后填写密钥；
4. 再运行 `npm start`，页面状态应显示“Gemini 自由对话已连接”。

不要把真实密钥写进前端、提交到 GitHub，或发送到聊天中。完整配置、模型选择、免费层限制和故障排查见 [API 配置指南](docs/API_SETUP.md)。

云端链路为：

```text
麦克风 → 后端 → Gemini 3.5 Transcribe → 文字
文字 + 本地卦象 → Gemini 3.8 Flash → 墨衡回答
墨衡回答 → Gemini 3.1 Flash TTS Preview → 浏览器播放
```

## 嵌入自己的网页

```html
<script type="module" src="./src/shoujian-oracle.js"></script>
<shoujian-oracle></shoujian-oracle>
```

组件使用 Shadow DOM，不污染宿主页面样式。

## 文件入口

- `src/shoujian-oracle.js`：Web Component、会话状态和界面；
- `src/dialogue-engine.js`：有限意图识别与墨衡回答；
- `src/api-client.js`：浏览器与本机 API 的通信；
- `src/audio-recorder.js` / `audio-player.js`：录音和 PCM/WAV 播放；
- `src/question-boundary.js`：起卦前问题边界；
- `src/oracle-engine.js`：三钱六爻与 64 卦纯计算；
- `server/`：密钥隔离、Gemini Files/Interactions API 和静态服务；
- `test/`：上述三层的确定性测试。

## 验证

```bash
npm test
npm run check
```

需要 Node.js 20 或更高版本，无需安装第三方依赖。测试不会调用真实 Gemini，也不会消耗额度。

## 内容边界

这是传统文化与娱乐体验，不提供医疗、法律、投资或其他专业建议，不输出生死、灾祸、疾病、收益、应期或保证性预测。请勿据此作高风险现实决定。

## License

[MIT](LICENSE)。抽取来源与改动说明见 [NOTICE.md](NOTICE.md)。
