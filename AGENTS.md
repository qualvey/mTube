# AGENTS.md - mobile-paywall (StreamVIP/mTube) 项目规范

> 本文件是项目级指令,任何 agent / 开发者在本仓库内工作前必须阅读并遵守。

## 接口变更 → 文档同步(强制)

**任何对后端接口的增删改(新增路由、改路径、改方法、改请求/响应结构、改状态码、改字段),必须同步更新文档,与代码同一 commit 提交。这是硬性要求,不是建议。**

### 文档位置

| 文档 | 覆盖范围 | 必须同步的场景 |
| --- | --- | --- |
| `doc/api_specification.md` | 全站接口总规范(C 端 + 付费墙 + 存储集群 + B 端) | 任何接口变更 |
| `doc/api/admin.md` | 管理端(admin-web 对接的接口) | 任何 `/api/v1/admin/*` 变更 |

### 强制检查

- 仓库内置检查脚本 `scripts/check-api-docs.mjs`:
  自动扫描 `packages/server/src` 下所有路由注册(`app.*` / `router.*`),
  提取完整路径,与两份文档比对;发现接口未写入文档即退出码 1。
- 已配置 **pre-commit hook**(`.githooks/pre-commit`,经 `git config core.hooksPath .githooks` 启用):
  每次 `git commit` 自动运行该脚本,漏写文档会被拦截,commit 失败。
- hook 未生效时(如新 clone 未配置),提交前手动运行:
  ```bash
  node scripts/check-api-docs.mjs
  ```

### 文档更新要点

1. 新增/变更接口:在对应文档的合适章节补全——路径、方法、参数(位置/类型/必填)、响应示例、错误码。
2. 删除接口:从文档中移除对应条目。
3. 响应结构变化(加字段/改字段名):更新响应示例与字段说明表。
4. 路径含 `:param` 的,文档保留 `:param` 写法(与代码一致)。
5. 接口文档描述必须与真实代码一致(字段名、枚举值、大小写),禁止凭印象写。
   - 例:支付渠道字段是 `payType`(值 `alipay`/`ruyizf`/`crypto_usdt`),不是 `paymentMethod`。

## 开发约定

- **所有 Python 项目一律用 `uv` 运行**;本仓库为 Node/pnpm monorepo,用 `pnpm`。
- 构建验证:`cd packages/admin && pnpm build`(admin 前端)、server 改动用 `node --check` 或单测。
- commit 遵循 Conventional Commits:`feat(scope): 描述` / `fix(scope): 描述`,正文列改动点。
- 只提交本次任务相关文件,不混入无关改动(遗留文件如 `plan.md`、`err.txt`、`test/` 保持不动)。
- 生产部署:push 触发 GitHub Actions;部署前确认本地已验证构建。

## 已知要点

- 订单状态:`PENDING`(待支付)/ `PAID`(已支付);历史兼容 `SUCCESS`/`paid=true` 视为已支付。
- 管理端鉴权:admin session token(Bearer),`/api/v1/admin/*` 全锁(除 login)。
- 存储集群:HMAC 签名头 `X-Cluster-*`,`CLUSTER_SECRET` 需强密钥。
