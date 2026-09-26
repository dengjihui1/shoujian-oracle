# 受邀体验部署

本配置为小规模受邀测试增加全站口令入口，覆盖页面、静态资源、HTTP API、SSE 和 WebSocket 升级。它适合将同一体验口令交给少量受邀者；不提供个人账号、单人撤权或防止受邀者转发口令的能力。月度配额仍需开启。

先按 `DEPLOYMENT.md` 配好域名和生产环境文件。在生产主机执行以下命令，交互输入一个独立的体验密码，输出为 bcrypt 哈希：

```sh
docker run --rm -it caddy:2-alpine caddy hash-password
```

把 `deploy/invite.env.example` 的两项追加到已有 `deploy/compose.env`，填写 `INVITE_USER` 和刚生成的 `INVITE_PASSWORD_HASH`。哈希必须放在单引号中，保留其中所有 `$` 字符。示例故意留空；缺少或空值时 Compose 拒绝启动。不要把明文密码、真实哈希或运行环境文件提交到仓库。

检查并启动受邀配置：

```sh
docker compose --env-file deploy/compose.env -f deploy/compose.yml -f deploy/compose.invite.yml config --quiet
docker compose --env-file deploy/compose.env -f deploy/compose.yml -f deploy/compose.invite.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file deploy/compose.env -f deploy/compose.yml -f deploy/compose.invite.yml up -d --build
```

后续更新也要携带两个 `-f` 参数。仅启动基础 `compose.yml` 会恢复公开入口。必须使用 HTTPS；不要直接公开 Node 的 8000 端口或 Redis 的 6379 端口。基础 Compose 已只在容器网络内暴露这两个端口。

浏览器首次打开网站会要求体验用户名和密码。后续同源 SSE/WebSocket 使用已建立的浏览器认证；上线时仍需用目标浏览器验证语音握手。Caddy 在认证后移除发送给 Node 的 `Authorization`，明文口令不进入应用日志。健康检查走容器内部连接，外部 `/healthz` 和 `/readyz` 同样要求认证。

## 真实 Redis 用量保护检查

脚本只读取当前进程的 `REDIS_URL`，不会读取 `.env`，不会输出连接地址或凭证，也不会删除任何 Redis 键。每次使用新的随机测试命名空间，测试计数随 TTL 自动过期；严禁通过删除生产 Redis 数据卷来重置额度。

```sh
# REDIS_URL 应事先通过安全环境注入；命令本身无需包含凭证。
node scripts/smoke-redis-budget.mjs
```

该检查验证两个 Redis 客户端并发请求最多获准 23 次、音频权重、月份时钟偏差关闭、TTL，以及重新连接和新建预算实例后计数继续生效。CI 在独立临时 Redis 中还会真正重启 Redis，再检查 AOF 保存的计数：

```sh
export BUDGET_SMOKE_RUN_ID="$(node -p 'require("node:crypto").randomUUID()')"
node scripts/smoke-redis-budget.mjs
# 仅在专用测试环境重启启用 AOF 的 Redis，再执行：
node scripts/smoke-redis-budget.mjs --verify-restart
```

`--verify-restart` 必须沿用同一个 `BUDGET_SMOKE_RUN_ID`；普通测试必须使用新 UUID。该脚本不会重启生产 Redis。CI 同时验证受邀 Caddy 配置和缺少凭证时拒绝启动；CI 成功并不代表真实域名、证书或目标浏览器已经完成上线验收。
