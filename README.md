# 墨衡小卦 · 守简版

从“巡宅”中有选择地抽出的轻量虚拟卦师组件。它保留虚拟人主持、问题边界、三钱六爻、64 卦确定性映射和有限追问；明确不包含住宅分析、完整古籍、纳甲时证、档案、支付与追验等主项目核心。

![版本](https://img.shields.io/badge/version-0.2.0-8e332a)
![许可](https://img.shields.io/badge/license-MIT-d3b27f)

## 现在能完成什么

1. 墨衡以虚拟人身份迎客，引导用户把问题缩成一件具体的小事；
2. 公开字符规则拦截医疗、投资、法律、人身安全等高风险问题；
3. 问题通过后，浏览器本机模拟三钱六掷并机械排出本卦、动爻和之卦；
4. 用户可以继续问“什么意思”“动爻怎么看”“怎么算的”“边界是什么”；
5. 受限对话引擎只回答已经实现的意图，不会伪装成无所不知的聊天 AI。

问题文字不会改变卦象。页面不联网、不保存输入、没有账号、遥测或支付。

## 抽取了什么、没有抽取什么

| 主项目来源 | 本项目保留 | 明确排除 |
| --- | --- | --- |
| `MohengGuide` / `mohengPosture` | 人物主持、阶段仪态、边界语气 | 主项目八步宅案状态与本机语音系统 |
| `mohengConsultation` | 为什么、来源、边界式追问 | 宅盘结构化案据和完整案门 |
| `oracleQuestionBoundary` | 7 类公开字规 | 问契签名、验期、准绳与追验 |
| `iching` | 6/7/8/9、八卦、文王序 64 卦映射 | 古籍全文、爻辞、纳甲、六亲、旬空、六神 |

完整映射见 [组件抽取与流程图](docs/COMPONENT_MAP.md)，学习顺序见 [代码学习指南](docs/LEARNING_GUIDE.md)。

## 本地运行

```bash
python -m http.server 8000
```

访问 `http://127.0.0.1:8000/`。也可以使用任意静态服务器。

## 嵌入自己的网页

```html
<script type="module" src="./src/shoujian-oracle.js"></script>
<shoujian-oracle></shoujian-oracle>
```

组件使用 Shadow DOM，不污染宿主页面样式。

## 文件入口

- `src/shoujian-oracle.js`：Web Component、会话状态和界面；
- `src/dialogue-engine.js`：有限意图识别与墨衡回答；
- `src/question-boundary.js`：起卦前问题边界；
- `src/oracle-engine.js`：三钱六爻与 64 卦纯计算；
- `test/`：上述三层的确定性测试。

## 验证

```bash
npm test
npm run check
```

需要 Node.js 20 或更高版本，无需安装第三方依赖。

## 内容边界

这是传统文化与娱乐体验，不提供医疗、法律、投资或其他专业建议，不输出生死、灾祸、疾病、收益、应期或保证性预测。请勿据此作高风险现实决定。

## License

[MIT](LICENSE)。抽取来源与改动说明见 [NOTICE.md](NOTICE.md)。

