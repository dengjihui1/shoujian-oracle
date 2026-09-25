# 从零启用 Google Cloud 实时转写

当前 Google Cloud Speech-to-Text v1 接入使用浏览器 AudioWorklet 将单声道 PCM 经同源 WebSocket 送至本机 Node 服务；Node 使用 Google 官方客户端的 `streamingRecognize` 返回临时与定稿文字。凭证只保存在服务端。`GEMINI_API_KEY` 不能代替 Cloud STT 凭证。启用可能产生云服务费用，额度与价格以 [官方价格页](https://cloud.google.com/speech-to-text/pricing)为准。

## 1. 创建项目

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，登录后在顶部项目选择器创建新项目，记下**项目 ID**。
2. 在该项目中关联结算账号；在“API 和服务 → 库”启用 **Cloud Speech-to-Text API**。
3. 为本机安装 [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)。在 PowerShell 中执行：

   ```powershell
   gcloud auth application-default login
   gcloud auth application-default set-quota-project 你的项目ID
   ```

   浏览器会打开 Google 登录授权页。凭证保留在你本机，不要发到聊天或提交到仓库。若组织政策限制用户 ADC，可改用放在仓库外的服务账号 JSON，并在 `.env` 用 `GOOGLE_APPLICATION_CREDENTIALS=绝对路径` 指向该文件。服务账号只授予所需 Speech-to-Text 调用权限。

4. 在项目 `.env` 中设置：

   ```dotenv
   GOOGLE_CLOUD_PROJECT=你的项目ID
   GOOGLE_CLOUD_STT_ENABLED=true
   ```

   若已有 `GEMINI_API_KEY`，保留它用于文字对话和 Gemini 整句兜底。`GOOGLE_CLOUD_TTS_ENABLED` 是语音合成的独立开关，无需为实时转写而开启。若本机需要 HTTP 代理，沿用 `.env` 的 `HTTPS_PROXY=http://127.0.0.1:端口`；STT 服务启动时会将其传给 gRPC 客户端。

5. 重启 `npm start`，刷新页面。在 PowerShell 中执行：

   ```powershell
   (Invoke-RestMethod http://127.0.0.1:8000/api/status).streamingStt
   ```

   应返回 `True`。这仅表示服务端已配置流式识别，**不能证明 Cloud 认证、结算和真实转写已经成功**。

## 2. 真人验收

在页面点击“开始语音对话（自动发送）”，授权麦克风，说一句“我想问搬家是否合适”，观察说话时文字逐步出现、停顿后自动送问，再尝试打断和下一轮。按 [设备验收](DEVICE_ACCEPTANCE.md)检查至少 10 轮、噪声和回声、权限拒绝与网络故障。若未出现逐字稿，先看页面是否出现回退提示，再检查 Cloud API 是否已启用、结算、ADC 项目与当前网络。不要把凭证或原始录音贴到 Issue。

参考：[官方流式识别](https://cloud.google.com/speech-to-text/docs/streaming-recognize) · [应用默认凭证](https://cloud.google.com/docs/authentication/provide-credentials-adc)。
