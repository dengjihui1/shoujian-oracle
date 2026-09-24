# 守简 0.49.0 第二十二轮自检

逐模块复核 S05 时发现，Redis 共享限流虽然原子计数，但窗口分数来自各 Node 实例时钟。实例时钟有偏差时，靠前实例写入的请求可能被靠后实例提前清理。改为在同一段 Lua 脚本内读取 Redis `TIME`，并以该时间清理、计数和写入；拒绝请求不再延长键的过期时间。

回归先在旧实现失败，再在新实现通过。CI 的真实 Redis 冒烟加入故意错开的调用方时间，验证两个实例视角仍共用窗口。依据：[Redis TIME 命令](https://redis.io/docs/latest/commands/time/)与[Redis 脚本执行](https://redis.io/docs/latest/develop/programmability/eval-intro/)。

本地验证：`npm test` 245/245、`npm run check`、`npm run eval:rag`、`npm audit --omit=dev --audit-level=low` 均通过。本机 Playwright 单 worker 运行 55 项，其中 Chromium、WebKit 的 44 项通过；Firefox 的 11 项均因浏览器进程 `spawn UNKNOWN` 未能启动，直接执行该 Firefox 程序显示 Windows 并行配置错误，未运行到页面断言。本机 Docker 服务未启动，真实 Redis 与完整跨浏览器门禁由 GitHub CI 执行；生产多实例时钟漂移与流量峰值仍需部署环境验收。
