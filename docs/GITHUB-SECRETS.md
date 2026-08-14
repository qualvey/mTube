# GitHub Secrets 配置清单

本项目 CI/CD（`.github/workflows/release.yml` / `rollback.yml`）通过 **GitHub Actions Secrets** 注入部署配置。所有 Secret 在 **Settings → Secrets and variables → Actions** 中配置（推荐直接新建为 Actions secret，不要写入仓库任何文件）。

> ⚠️ Secret 一旦泄露即失效原则：任何密钥都不要提交进仓库（含 git 历史）。

## 一、必填（没有则部署失败）

| Secret | 用途 | 示例 |
|---|---|---|
| `VPS_HOST` | 主服务器 IP/域名 | `***REMOVED***` |
| `VPS_USER` | 主服务器 SSH 用户 | `root` |
| `VPS_SSH_KEY` | 主服务器 SSH 私钥（完整内容） | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `STORAGE_VPS_HOST` | 存储节点服务器 IP/域名 | `192.168.1.10` |
| `STORAGE_VPS_USER` | 存储节点 SSH 用户 | `root` |
| `STORAGE_VPS_SSH_KEY` | 存储节点 SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `CLUSTER_SECRET` | 集群 HMAC 密钥（主服务器与存储节点**必须相同**，任意长随机串） | `openssl rand -hex 32` |

## 二、建议配置（生产安全）

| Secret | 用途 | 默认值（不配则用） | 示例 |
|---|---|---|---|
| `ADMIN_USERNAME` | 管理后台用户名 | `admin` | `ops` |
| `ADMIN_PASSWORD` | 管理后台密码 | `admin123`（**务必覆盖**） | 强随机串 |
| `RUIZIF_MCH` | 如艺支付商户号 | 代码默认（开源后为空） | `***REMOVED***` |
| `RUIZIF_SECRET` | 如艺支付密钥 | 空（禁用支付） | 商户后台获取 |
| `RUIZIF_CHANNEL` | 如艺支付渠道码 | `4444` | `4444` |
| `RUIZIF_NOTIFY_URL` | 支付回调 URL | `https://<域名>/api/v1/paywall/notify` | 你的正式域名 |
| `RUIZIF_NOTIFY_IPS` | 回调来源 IP 白名单 | `***REMOVED***` | 逗号分隔 |
| `RESEND_API_KEY` | 注册验证码邮件（Resend） | 空 = 开发模式（验证码随响应返回，**生产必须配置**） | `re_xxx` |
| `RESEND_FROM` | 发件人地址 | `onboarding@resend.dev` | `noreply@你的域名` |

## 三、可选（按需调整）

| Secret | 用途 | 默认值 |
|---|---|---|
| `VPS_PORT` / `STORAGE_VPS_PORT` | SSH 端口 | `22` |
| `STORAGE_VPS_TARGET` | 存储节点部署目录 | `/opt/storage_node` |
| `STORAGE_NODE_ID` | 存储节点 ID | `node-01` |
| `STORAGE_NODE_LABEL` | 存储节点显示名 | `Storage Node 01` |
| `STORAGE_PORT` | 存储节点服务端口 | `3001` |
| `STORAGE_ROOT` | 视频存储根目录 | `/data/videos` |
| `MAX_STORAGE_GB` | 存储上限（GB） | `500` |
| `ENABLE_DIRECT_UPLOAD` | 直传模式开关 | `true` |
| `MAIN_SERVER_URL` | 主服务器地址（存储节点回调） | `http://localhost:3000` |

## 四、部署后仍需在管理后台/环境配置的项目

- `EMAIL_VERIFICATION_ENABLED`：注册邮箱验证开关（默认开启，`false` 关闭）
- `LOG_LEVEL`：日志级别（默认 `info`，运行时可在管理后台切换）
- `AUTH_TOKEN_TTL_DAYS`：用户登录 token 有效期天数（默认 7）
- 站点文案/品牌：管理后台「文案定制」「系统设置」（DB 存储，无需重新部署）

## 五、开源前检查（重要）

1. 删除代码中所有默认密钥：`config.js` 的 `RUIZIF_MCH` / `RUIZIF_SECRET` 默认值、`integrations/ruyizf.test.js` 明文密钥、`test/pay.sh`、`pay-API.md`
2. 用 `git filter-repo` 重写历史清除已提交的敏感信息
3. 换发支付商户密钥（历史泄露后旧密钥已不安全）
