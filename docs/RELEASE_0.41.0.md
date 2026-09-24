# 守简 0.41.0 第十四轮自检

依据当前 [Node.js 24 HTTP 文档](https://nodejs.org/dist/latest-v24.x/docs/api/http.html#serverrequesttimeout)复核服务器启动入口：此前沿用 Node 默认的请求头和请求体接收期限。现在显式设置请求头 10 秒、整个请求 60 秒、空闲 keep-alive 5 秒，并限制请求头数量为 100。配置在监听前完成；SSE 回答依旧使用原有心跳与供应商超时。

定向测试核对实际 HTTP Server 对象上的配置值。真实公网代理下慢连接、移动网络 6 MB 录音上传与大并发仍要压测，不能仅由属性测试判定达标。

本地 `npm test` 231 / 231、Chromium / WebKit 及两组移动仿真 44 / 44 通过；固定 RAG 集 recall@4 与域外负例精度均为 100%，项目检查、空白符检查和生产依赖审计通过。
