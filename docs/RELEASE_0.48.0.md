# 守简 0.48.0 第二十一轮自检

逐模块复核 S03 Gemini 和 S06 OpenAI-compatible 适配器时发现，流解析异常只释放读取锁，未主动取消仍在传输的供应商响应体。现在格式错误、过大事件或调用方提前结束迭代时都会取消读取器；正常读完仍保留原行为。

定向回归使用持续开放的异常流，确认两个适配器都调用了取消路径。真实供应商链路的连接回收与计费仍需在部署环境观察。

本地验证：`npm test` 245/245、`npm run eval:rag`、`npm run check`、`npm audit --omit=dev --audit-level=low`、`git diff --check` 均通过。
