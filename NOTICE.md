# Extraction notice

本项目 0.3.0 不是完整“巡宅”的复制品，而是经明确边界筛选后的独立教学组件。

抽取参考的主项目文件：

- `src/components/MohengGuide.tsx`
- `src/domain/mohengPosture.ts`
- `src/domain/mohengConsultation.ts`
- `src/domain/oracleQuestionBoundary.ts`
- `src/domain/iching.ts`

为形成零依赖 Web Component，相关逻辑已从 React/TypeScript 改写为原生 JavaScript，并删除住宅案据、问契签名、古籍正文、纳甲时证、档案、支付及其他商业核心。界面、有限意图路由和教学文档为本仓库新增实现。

0.3.0 新增的 Gemini Files/Interactions API 适配器、录音、语音播放和云端人格提示词均为本仓库的独立实现，不复制主项目知识库或商业语音系统。
