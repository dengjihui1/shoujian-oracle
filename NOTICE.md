# Extraction notice

本项目 0.6.0 不是完整“巡宅”的复制品，而是经明确边界筛选后的独立教学组件。

抽取参考的主项目文件：

- `src/components/MohengGuide.tsx`
- `src/domain/mohengPosture.ts`
- `src/domain/mohengConsultation.ts`
- `src/domain/oracleQuestionBoundary.ts`
- `src/domain/iching.ts`

为形成零依赖 Web Component，相关逻辑已从 React/TypeScript 改写为原生 JavaScript，并删除住宅案据、问契签名、纳甲时证、档案、支付及其他商业核心。界面、本地降级意图路由、RAG 检索器和教学文档为本仓库新增实现。

此前新增的 Gemini Files/Interactions API 适配器、录音、语音播放和云端人格提示词均为本仓库的独立实现，不复制主项目知识库或商业语音系统。

0.4.0 新增的冻结经传知识包来自中文维基文库公开来源，包含《周易》卦辞、爻辞、《彖》《象》与《说卦》八卦取象；它按独立 schema 重新筛选和组织，不包含主项目住宅知识或商业数据。古籍原作为公有领域，维基文库转录／编辑层及适用的数据改编按 CC BY-SA 4.0，详细来源、修订和改动说明见 `knowledge/README.md` 与数据记录。

0.5.0 把云端入口扩展为普通闲聊、身份与能力问答、一般基础问题和经传 RAG；只有用户明确选择时才进入起卦，并为聊天模型增加高负载自动回退。

0.6.0 新增可信上海服务器时钟、Gemini SSE 真流式回答、字符级显示，以及仅存浏览器本机的最近对话记忆；实现思路参考 Cactus 的流式分片、近期对话与同气泡更新方式，但没有复制其后端、提示词或其他业务模块。
