# 守简 0.52.0 浏览器录音与异常恢复

上一轮的录音兜底仅用假录音器检查了界面。本轮改用独立 Chromium 的 Web Audio 合成麦克风与真实 `MediaRecorder`，验证浏览器识别报告网络错误后，录音能产生有效音频、上传转写并释放音轨。Windows Playwright WebKit 构建没有 `MediaRecorder`、`mediaDevices` 和 `AudioContext`，因此该项目检查无录音能力时的文字降级；不能由此推断真实 Safari 的媒体能力。

进一步的故障注入先复现新问题：录音器自行停止时，页面一直停留在“停止并转文字”，输入框被禁用。现在监听本轮录音结果，自动停止时转写，报错时解除占用并显示错误。每轮录音有独立代数，旧实时识别的迟到临时文字和完成结果都不能污染新录音。新增页面回归覆盖自动停止、设备错误与迟到结果。

本机真实服务回环使用 `npm run smoke:voice-browser`：云端 TTS 生成“你好，今天我们聊聊周易。”（约 4.1 秒），合成麦克风在 Chromium 中录制约 3.4 秒，真实 `/api/transcribe` 约 4.5 秒返回同一句，媒体轨已释放。脚本不使用电脑麦克风或输出密钥，但会消耗语音 API 额度。单次回环不证明真人麦克风、噪声、回声、准确率或低延迟达标。

本地门禁：`npm test` 246/246，桌面及移动 Chromium/WebKit 页面回归 76/76，`npm run check`、`npm run eval:rag` 与 `npm audit --omit=dev --audit-level=low` 通过。后者发现 0 项生产依赖漏洞。Windows Playwright Firefox 的浏览器进程仍无法启动；Linux Firefox、容器、Redis 与 Caddy 检查由远端 CI 执行。真实麦克风、噪声和扬声器回声仍不在自动化结论内。
