# 墨衡小卦 · 守简版

![Jihui](assets/brand/jihui-wordmark.png)

独立的轻量虚拟卦师与经传 RAG 组件。它保留虚拟人主持、问题边界、三钱六爻和 64 卦确定性映射，并加入可追溯的《周易》《彖》《象》《说卦》冻结知识检索；明确不包含住宅分析、纳甲时证、档案、支付与追验等主项目核心。

![版本](https://img.shields.io/badge/version-0.6.0-8e332a)
![许可](https://img.shields.io/badge/license-MIT-d3b27f)

## 现在能完成什么

1. 墨衡以虚拟人身份迎客，支持普通闲聊、基础问答和连续上下文；
2. 起卦路径用公开字符规则拦截医疗、投资、法律、人身安全等高风险决定；普通聊天仍可解释低风险基础概念；
3. 问题通过后，浏览器本机模拟三钱六掷并机械排出本卦、动爻和之卦；
4. 配置 Gemini 后，可以直接闲聊、询问墨衡的身份与能力、问一般基础问题，也可以不先起卦自由问经传知识；
5. 只有点击“以此问起卦”才会固定原问并进入排卦；起卦后仍可对本卦、动爻和之卦自由追问；
6. 涉及经传或当前卦象时，服务端从 456 条冻结片段中检索最多 8 条证据，回答下方可展开原文、层次、源号和维基文库页面；
7. Gemini 回答通过 SSE 真流式传输，再以字符级动画持续写进同一条气泡，不必等待整段完成；
8. 每轮注入 `Asia/Shanghai` 服务器时钟，日期与时间问题不再交给模型猜测；
9. 最近 24 条对话保存在当前浏览器本机，刷新后可继续；每次最多把最近 16 条作为 Gemini 上下文，并提供“清除本机记忆”；
10. 支持麦克风转写和可选语音回答；没有 API 密钥时自动退回本地有限对话，起卦仍然可用。

问题文字不会改变卦象。项目没有账号、遥测或支付；本地模式不上传内容，Gemini 云端模式会把用户主动提交的文字、录音、最近上下文和必要卦象证据发送给 Google。对话记忆只存当前浏览器的 `localStorage`，服务端不建立用户档案。

## 抽取了什么、没有抽取什么

| 主项目来源 | 本项目保留 | 明确排除 |
| --- | --- | --- |
| `MohengGuide` / `mohengPosture` | 人物主持、阶段仪态、边界语气 | 主项目八步宅案状态与本机语音系统 |
| `mohengConsultation` | 主持方式与本地降级思想 | 宅盘结构化案据和完整案门 |
| `oracleQuestionBoundary` | 7 类公开字规 | 问契签名、验期、准绳与追验 |
| `iching` | 6/7/8/9、八卦、文王序 64 卦映射 | 古籍全文、爻辞、纳甲、六亲、旬空、六神 |

经传数据另从中文维基文库公开来源建立独立知识包，不复制主项目住宅知识。完整映射见 [组件抽取与流程图](docs/COMPONENT_MAP.md)，学习顺序见 [代码学习指南](docs/LEARNING_GUIDE.md)。

## 本地运行（无需 API）

```bash
npm start
```

访问 `http://127.0.0.1:8000/`。此时可以完整起卦，但对话仅支持固定意图。

## 启用真正的语音虚拟人

1. 在 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建 Gemini API 密钥；
2. 复制 `.env.example` 为 `.env`；
3. 只在本机 `.env` 的 `GEMINI_API_KEY` 后填写密钥；
4. 若网络不能直连 Google，在 `.env` 填写 `HTTPS_PROXY=http://127.0.0.1:你的代理端口`；
5. 再运行 `npm start`，页面状态应显示“Gemini + 周易 RAG 已连接”。

不要把真实密钥写进前端、提交到 GitHub，或发送到聊天中。完整配置、模型选择、免费层限制和故障排查见 [API 配置指南](docs/API_SETUP.md)。

云端链路为：

```text
麦克风 → 后端 → Gemini 3.5 Transcribe → 文字
普通文字 → Gemini 3.5 Flash SSE（繁忙时自动尝试备用模型）→ 字符级呈现的墨衡自然回答
经传问题或本地卦象 → 冻结知识检索 → Gemini → 带来源的墨衡回答
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
- `src/api-client.js`：浏览器与本机 API 的 JSON/SSE 通信；
- `src/audio-recorder.js` / `audio-player.js`：录音和 PCM/WAV 播放；
- `src/question-boundary.js`：起卦前问题边界；
- `src/oracle-engine.js`：三钱六爻与 64 卦纯计算；
- `server/`：密钥隔离、Gemini 流式生成、Files/Interactions API 和静态服务；
- `server/knowledge-retriever.mjs`：本卦强绑定与自由问题检索；
- `knowledge/shoujian-rag.v1.json`：64 卦、384 爻与 8 个说卦取象冻结知识；
- `test/`：上述三层的确定性测试。

## 验证

```bash
npm test
npm run check
```

需要 Node.js 24 或更高版本，无需安装第三方依赖。测试不会调用真实 Gemini，也不会消耗额度。

## 内容边界

这是传统文化与娱乐体验，不提供医疗、法律、投资或其他专业建议，不输出生死、灾祸、疾病、收益、应期或保证性预测。请勿据此作高风险现实决定。

## License

代码使用 [MIT](LICENSE)。冻结经传数据的维基文库编辑层及适用改编按 CC BY-SA 4.0；详见[知识包来源与许可](knowledge/README.md)和[抽取说明](NOTICE.md)。
