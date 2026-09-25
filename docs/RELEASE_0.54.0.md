# 0.54.0：可选 Google Cloud 流式语音识别

用户目前没有 Google Cloud 项目。本轮先完成可配置的技术链路：浏览器 AudioWorklet 收集真实采样率的 PCM16，经同源 WebSocket 送往 Node 服务，再由官方 `@google-cloud/speech` v1 客户端请求 `streamingRecognize`。临时与定稿文字接入原自动语音对话状态机。Cloud 流断开后尝试浏览器增量识别，浏览器网络也失败时保留 Gemini 停顿识别。Cloud 默认关闭，凭证不会发到浏览器；WebSocket 检查同源、请求频率、并发、消息大小、录音总量和时长。

本地测试：259 项单测通过；Chromium、WebKit 及两组移动仿真的既有 76 项浏览器流程通过；新增 Chromium 真实 AudioWorklet → WebSocket → 假 Google 流回环通过；项目检查与生产依赖审计通过。Firefox 在本机启动时报 `spawn UNKNOWN`，未完成本机浏览器验收，需看 GitHub CI。**没有真实 Cloud 项目、ADC、结算及真人麦克风验收，不能称 Google Cloud STT 实际调用或生产体验已通过。**

创建项目、启用 API 和本机认证步骤见 [实时转写启用指南](GOOGLE_CLOUD_STT_SETUP.md)。
