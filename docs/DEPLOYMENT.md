# 生产部署指南

这份指南把守简放在单实例 Node 容器后，由 Caddy 自动申请和续期 HTTPS 证书。仓库提供的是可复现配置，不代表你的域名、云主机、Gemini 或 Google Cloud 已经审核或上线。

## 一、准备条件

1. 一台有公网 IPv4 的 Linux 云主机，开放 TCP 80、443 和 UDP 443；
2. 一个你能修改 DNS 的正式域名，例如 `oracle.example.com`；
3. 域名 A 记录指向云主机公网 IP；使用 IPv6 时再配置正确的 AAAA 记录；
4. 已安装 Docker Engine 与 Docker Compose 插件；
5. 服务端 Gemini Key。浏览器、GitHub 和 Caddyfile 中都不能出现 Key。

先确认 DNS 已生效，再启动 Caddy；否则证书签发会失败。

## 二、生成生产配置

在仓库根目录执行：

```bash
cp .env.production.example .env.production
cp deploy/compose.env.example deploy/compose.env
```

编辑 `.env.production`：

- 填写 `GEMINI_API_KEY`；
- 保留 `HOST=0.0.0.0`，只让容器网络访问 8000 端口；
- 保留 `TRUST_PROXY=true`，因为公开流量只经过同一 Compose 内的 Caddy；
- 保留 `STRUCTURED_LOGS=true`；
- 用随机值替换 `LOG_HASH_SALT`。可执行：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

编辑 `deploy/compose.env`，把 `DOMAIN` 改为正式域名。两个生产配置文件均被 Git 忽略，不要提交或发送给他人。

## 三、启动与验证

```bash
docker compose --env-file deploy/compose.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/compose.env -f deploy/compose.yml ps
curl -fsS https://你的域名/healthz
```

健康响应应类似：

```json
{"status":"ok","cloud":true,"knowledge":{"schema":"shoujian.oracle-rag.v1","version":"1.0.0"}}
```

`cloud:false` 表示页面能运行本地有限模式，但生产 Gemini 未配置成功。健康接口不返回密钥、模型、用户问题或原始 IP，也不占用聊天限流额度。

再人工验证：普通聊天、经传 RAG、起卦访谈、停止回答、TTS 失败后的文字降级。具备真实麦克风权限时，再测连续三轮、打断、环境噪声和扬声器回声。

## 四、HTTPS 与代理边界

Caddy 负责 80 → 443、证书申请、续期、HSTS、压缩和 SSE 透传；Node 容器不向公网映射端口。`flush_interval -1` 避免代理缓冲逐字流。

只有当 Node 确实位于你控制的反向代理后时才设置 `TRUST_PROXY=true`。代理必须覆盖外部传入的 `X-Forwarded-For`，不能把客户端自带值原样信任。若直接暴露 Node 端口，设为 `false`，否则攻击者可伪造限流身份。

## 五、日志与隐私

`STRUCTURED_LOGS=true` 时每个完成请求只记录：时间、请求 ID、方法、路径、状态码、耗时，以及可选的客户端指纹。不会记录请求正文、提示词、对话、录音、Cookie、Authorization 或 API Key。

只有配置 `LOG_HASH_SALT` 才记录不可逆短指纹；盐值不同，结果也不同。盐值仍属于生产秘密。查看日志：

```bash
docker compose --env-file deploy/compose.env -f deploy/compose.yml logs -f --tail=200 app
```

应用响应带 `X-Request-Id`，排障时可用它对应日志，不需要索取用户问题全文。

## 六、限流与多实例

默认 `SlidingWindowRateLimiter` 是单进程内存实现，当前 Compose 因此固定单个 `app` 实例。`createApp({ rateLimiter })` 已提供共享限流注入边界；自定义适配器只需实现：

```js
const rateLimiter = {
  asyncOrSyncSetup: "在进程外完成",
  allow(clientKey, nowMs) {
    return true; // 必须同步返回 boolean
  },
};
```

在增加多个应用副本、公开匿名访问或收费前，必须把它替换为 Redis / 托管网关中的原子滑动窗口，并加入按账户与按成本配额。不要直接横向扩容当前内存限流器，否则每个副本会各算一份额度。

## 七、升级、回滚与备份

升级前记录当前提交并拉取代码：

```bash
git rev-parse HEAD
git pull --ff-only
docker compose --env-file deploy/compose.env -f deploy/compose.yml up -d --build
curl -fsS https://你的域名/healthz
```

出现回归时，切回刚才记录的已验证提交再重新构建。不要删除 `caddy_data` 卷；它包含证书状态。用户对话默认只在各自浏览器，本服务没有需要备份的用户档案数据库。

## 八、上线前仍需人工完成

- 用你的真实域名验证证书链、HTTP 自动跳转和 SSE 首字；
- 在云主机出口验证 Gemini / 可选 TTS 的区域可用性、配额和账单告警；
- 配置云防火墙，只开放 80 / 443 与必要管理入口；
- 决定账号、共享限流、成本上限、滥用防护和隐私政策；
- 若实行收费，支付回调必须使用另一套具备验签、幂等和订单审计的后端，不能复用本示例聊天接口。
