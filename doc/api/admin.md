# 管理端接口 (Admin API)

> 适用范围：StreamVIP (mTube) 后台管理系统（admin-web 前端所对接的全部后端接口，即 `/api/v1/admin/*`）。
> 除登录外，所有管理端接口均需携带管理员会话 Token，鉴权失败返回 `401`。
> 统一响应结构：`{ "code": 200, "message": "success", "data": ... }`。

## 认证

所有请求需携带请求头：

```
Authorization: Bearer <adminToken>
```

- 管理员 Token 通过 `POST /api/v1/admin/auth/login`（或 `POST /api/v1/admin/login`）获取，为 48 位随机 hex 字符串。
- Token 存于服务端内存，服务重启后失效，需重新登录。
- 前端封装见 `packages/admin/src/utils/api.js`（`apiFetch` 自动附加 Token，收到 401 自动跳转登录页）。
- 登录账号密码来自环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（默认 admin / admin123，生产必须修改）。

### 管理员登录

```
POST /api/v1/admin/auth/login
```

请求 Body：

```json
{ "username": "admin", "password": "***" }
```

成功响应（HTTP 200）：

```json
{
  "code": 200,
  "message": "登录成功",
  "data": { "token": "48位hex", "user": { "username": "admin", "role": "SUPER_ADMIN" } }
}
```

> 另有兼容入口 `POST /api/v1/admin/login`，返回结构为 `{ username, isLoggedIn: true, token }`。

---

## 订单管理

### 获取订单列表

```
GET /api/v1/admin/orders
```

响应 `data` 为订单数组（按创建时间倒序）。每个订单附带设备当前 VIP 状态字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 订单 ID |
| `orderNo` | string | 订单号（如存在） |
| `deviceId` | string \| null | 支付设备指纹 ID，可为空（匿名支付） |
| `planId` / `plan` | string | VIP 套餐标识（month / season / year / lifetime 等） |
| `planName` | string | 套餐显示名（如「月度 VIP」） |
| `amount` | number | 支付金额（元） |
| `cryptoAmount` | string \| null | USDT 支付数量（TRC20 渠道），支付宝订单为 null/0 |
| `payType` | string | 支付渠道（后端真实字段）：`alipay` / `ruyizf`（如意支付，实为支付宝扫码）/ `crypto_usdt` |
| `status` | string | 订单状态：`PENDING`（待支付）/ `PAID`（已支付） |
| `isVip` | boolean | **该设备当前是否处于 VIP 有效期内** |
| `vipExpireAt` | string \| null | 该设备当前 VIP 到期时间（ISO 8601），无 VIP 时为 null |

> 注意：`isVip` / `vipExpireAt` 是**实时查询**设备 VIP 表得到的，不是订单历史快照；
> 同一设备多笔订单时，每笔订单行展示的都是该设备当前的最新状态。

### 删除订单记录

```
DELETE /api/v1/admin/orders/:id
```

- 成功：`200` `{ "code": 200, "message": "订单记录已成功删除", "data": { "success": true } }`
- 订单不存在：`404` `{ "code": 404, "message": "订单不存在或已被删除", "data": null }`

### 确认加密货币订单（手动/Webhook 确认充值）

```
POST /api/v1/admin/orders/:id/confirm-crypto
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | path | string | 是 | 订单 ID |
| `tradeNo` | body | string | 否 | 链上交易号；缺省自动生成 `USDT-TX-<时间戳>` |

成功响应（HTTP 200）：订单对象（status 已置为 PAID 并开通 VIP）。

---

## 设备 VIP 管理

### 撤销设备 VIP（移除某个设备的 VIP 权限）

**用途**：管理员手动移除指定设备的 VIP 权限，立即生效（删除 `vip_devices` 表中的记录），
该设备随后将无法播放 VIP 视频。常用于：用户要求退款、设备滥用、误开通等场景。

**支持两种调用形式**（同一处理逻辑）：

#### 形式 A：路径参数

```
POST /api/v1/admin/devices/:deviceId/revoke-vip
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `deviceId` | path | string | 是 | 设备指纹 ID，需 URL 编码 |

#### 形式 B：query 或 body 传参

```
POST /api/v1/admin/devices/revoke-vip?deviceId=xxx
POST /api/v1/admin/devices/revoke-vip
Content-Type: application/json

{ "deviceId": "xxx" }
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `deviceId` | query / body | string | 是 | 设备指纹 ID |

> 该接口使用 `app.all` 注册，GET / POST 均可；业务上建议使用 POST。
> 参数优先级：路径参数 > body > query。`deviceId` 会先 `trim()` 再执行撤销。

**成功响应**（HTTP 200）：

```json
{
  "code": 200,
  "message": "手动取消设备 VIP 成功",
  "data": { "success": true, "deviceId": "abc123device" }
}
```

**失败响应**（HTTP 400，缺少 deviceId）：

```json
{ "code": 400, "message": "缺失 deviceId 参数", "data": null }
```

**幂等性**：设备无 VIP 时调用同样返回 `200` 成功（删除不存在记录不报错），可安全重试。

**cURL 示例**：

```bash
# 形式 A
curl -X POST 'https://admin.example.com/api/v1/admin/devices/abc123device/revoke-vip' \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 形式 B
curl -X POST 'https://admin.example.com/api/v1/admin/devices/revoke-vip' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"abc123device"}'
```

---

### 手动授予 / 恢复设备 VIP

#### 按订单授予（恢复订单对应设备的 VIP）

```
POST /api/v1/admin/orders/:id/grant-vip
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | path | string | 是 | 订单 ID |
| `deviceId` | body | string | 否 | 指定设备 ID；缺省时使用订单自身绑定的 `deviceId` |

套餐时长取自订单的 `planId`。若设备已有未过期 VIP，则在原到期时间上**顺延叠加**。

成功响应（HTTP 200）：

```json
{
  "code": 200,
  "message": "手动充值/恢复 VIP 权限成功",
  "data": {
    "deviceId": "abc123device",
    "vipExpireAt": "2026-09-08T00:00:00.000Z",
    "isVip": true
  }
}
```

#### 按设备 ID 直接授予（赠送 / 手动开通）

```
POST /api/v1/admin/devices/:deviceId/grant-vip
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `deviceId` | path | string | 是 | 目标设备指纹 ID |
| `planId` | body | string | 否 | 套餐标识，缺省 `month` |

支持的 `planId` 与时长映射（不区分大小写，包含匹配）：

| planId 关键字 | 时长 |
| --- | --- |
| 含 `day` | 1 天 |
| 含 `month` 或 `plan-1` | 30 天 |
| 含 `season` 或 `plan-2` | 90 天 |
| 含 `year` 或 `plan-3` | 365 天 |
| 含 `lifetime` 或 `plan-4` | 36500 天 |

已有未过期 VIP 时同样顺延叠加。成功响应结构同「按订单授予」。

---

## 视频管理

### 获取视频列表

```
GET /api/v1/admin/videos
```

响应 `data` 为视频数组（含 id、title、poster、videoUrl、isVip、status、tags 等）。管理端返回**全部视频**（含 `status=SCHEDULED` 的定时发布队列，带 `publishAt` 字段），与 C 端只返回已发布不同。

### 创建视频

```
POST /api/v1/admin/videos
```

请求 Body：视频对象（title、description、author、videoUrl、poster、isVip、previewDuration、tags 等）。

**定时发布字段**：`status` (`PUBLISHED`/`SCHEDULED`，可选，默认 `PUBLISHED`)；`publishAt` (ISO 8601 字符串，可选)。`status=SCHEDULED` 时必须带 `publishAt`（否则回退为 `PUBLISHED`），到点后服务端自动转为 `PUBLISHED` 并在 C 端可见。
成功响应：`201`，`data` 为新建视频对象。

### 更新视频

```
PUT /api/v1/admin/videos/:id
```

成功：`200` `data` 为更新后的视频；视频不存在：`404`。

**定时发布字段**：支持 `status` (`PUBLISHED`/`SCHEDULED`) 与 `publishAt` (ISO 8601，可传 `null` 清除)。传 `{ status: 'PUBLISHED', publishAt: null }` 即立即发布。

### 删除视频

```
DELETE /api/v1/admin/videos/:id
```

成功：`200` `{ "code": 200, "message": "视频已删除", "data": { "success": true } }`；不存在：`404`。

### 代理上传视频至存储节点

```
POST /api/v1/admin/videos/upload
```

`multipart/form-data`：`video` (File, 必填)，`nodeId` (string, 可选，缺省用默认节点)。
成功：`200`，`data` 含 `{ storageNodeId, storageNodeName, videoUrl, posterUrl }`（第 50 帧封面已生成）。

### 生成直传凭证（Direct Upload Ticket）

```
POST /api/v1/admin/videos/upload-ticket
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `nodeId` | body / query | string | 否 | 目标节点 ID，缺省用默认节点 |

成功响应 `data`：

```json
{
  "enableDirectUpload": true,
  "storageNodeId": "node-hk-02",
  "storageNodeName": "香港 8TB 存储节点 02",
  "baseUrl": "http://***REMOVED***:3001",
  "uploadUrl": "http://***REMOVED***:3001/api/v1/storage/upload",
  "chunkUploadUrl": "http://***REMOVED***:3001/api/v1/storage/upload-chunk",
  "mergeUrl": "http://***REMOVED***:3001/api/v1/storage/merge-chunks",
  "headers": { "X-Cluster-Timestamp": "...", "X-Cluster-Nonce": "...", "X-Cluster-Signature": "..." }
}
```

---

## 套餐管理

### 获取套餐列表

```
GET /api/v1/admin/paywall/plans
```

### 批量更新套餐

```
PUT /api/v1/admin/paywall/plans
```

请求 Body：`{ "plans": [...] }`（套餐数组，含 id/key/name/price/originalPrice/isHot 等）。
成功：`200`，`data` 为更新后的套餐数组。

---

## 存储节点管理

### 存储节点列表与实时连通监控

```
GET /api/v1/admin/storage-nodes
```

响应 `data` 为节点数组，含实时探测结果：

```json
[
  {
    "id": "node-01",
    "name": "存储节点 01",
    "baseUrl": "http://localhost:3001",
    "isDefault": true,
    "status": "HEALTHY",
    "isOnline": true,
    "videoCount": 42
  }
]
```

### 新增存储节点

```
POST /api/v1/admin/storage-nodes
```

Body：`{ "id", "name", "baseUrl", "isDefault" }`（id/name/baseUrl 均必填）。成功：`200`。

### 更新存储节点

```
PUT /api/v1/admin/storage-nodes/:id
```

Body：`{ "name", "baseUrl", "status", "isDefault" }`。不存在：`404`。

### 删除存储节点

```
DELETE /api/v1/admin/storage-nodes/:id
```

成功：`200` `{ "success": true }`。

### 设为默认上传节点

```
POST /api/v1/admin/storage-nodes/:id/set-default
```

成功：`200`，`data` 为更新后的节点对象。

### 默认节点健康状态

```
GET /api/v1/admin/storage/status
```

成功：`200`，`data` 为默认节点实时状态（status: ONLINE/OFFLINE 等）。

---

## 系统设置与统计

### 获取系统设置

```
GET /api/v1/admin/settings
```

返回全部设置项（siteTitle、noticeContent、alipay 配置、crypto 配置、paywall 配置等）。

**`paywallEnabled` (boolean)**：收费模式全局开关。`false` = 全站免费（C 端不展示 VIP/付费墙，支付接口除回调外返回 403）；`true` = 恢复收费。默认 `false`。

### 更新系统设置

```
PUT /api/v1/admin/settings
```

Body：设置项键值对（部分更新）。成功：`200`。

### 创建/新增设置项（兼容）

```
POST /api/v1/admin/settings
```

### Dashboard 统计（严格 PAID 口径）

```
GET /api/v1/admin/dashboard/stats
```

响应 `data`：`{ totalVideos, totalOrders, totalRevenue, todayPv, todayUv, chartData }` 等（详见 C 端/全局分析）。

### 简易营收统计

```
GET /api/v1/admin/stats
```

响应 `data`（**只统计 status === 'PAID' 的订单**，防水单/待支付混入）：

```json
{
  "totalRevenue": 3840.5,
  "paidOrderCount": 128,
  "totalOrderCount": 135
}
```

---

## 数据分析 (Analytics)

> 分析系统详细设计见 `docs/analytics-system-v1.md`。

### 分析概览（PV/UV/IP/点击量）

```
GET /api/v1/admin/analytics/overview
```

### 访问趋势

```
GET /api/v1/admin/analytics/trend?days=7
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `days` | query | number | 否 | 天数，缺省 7 |

### 热门视频 Top N

```
GET /api/v1/admin/analytics/top-videos?limit=10
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | query | number | 否 | 条数，缺省 10 |

### 访问日志列表（GeoIP）

```
GET /api/v1/admin/analytics/logs?page=&pageSize=&ip=&action=
```

查询参数：`page` / `pageSize` / `ip`（按 IP 过滤）/ `action`（按行为过滤）。

### 清理访问日志

```
DELETE /api/v1/admin/analytics/logs
```

Body/query：`{ "beforeDate": "ISO时间", "clearAll": true }`。
- `beforeDate`：删除该时间之前的日志；
- `clearAll: true`：清空全部（不传则默认不删除，仅返回统计）。

### Analytics V1 概览 / 报表 / CSV 导出 / 重建

```
GET  /api/v1/admin/analytics/v1/overview
GET  /api/v1/admin/analytics/v1/report?days=N
GET  /api/v1/admin/analytics/v1/export.csv?type=daily|videos|paths|countries&days=N
POST /api/v1/admin/analytics/v1/rebuild
```

- `export.csv`：返回 CSV 附件（`Content-Type: text/csv`，带 UTF-8 BOM 与 `Content-Disposition` 下载头）。
- `rebuild`：清空聚合表并按原始事件回放重算（初始化或口径修复后使用）。

---

## 翻译管理 (i18n)

### 查询译文

```
GET /api/v1/admin/translations?entityType=&entityId=&locale=
```

### 批量保存译文

```
PUT /api/v1/admin/translations
```

Body：

```json
{
  "entityType": "video",
  "entityId": "vid-xxx",
  "locale": "en",
  "fields": { "title": "...", "description": "..." }
}
```

- `entityType` 支持：`video` / `plan` / `site`（`db.TRANSLATABLE_FIELDS` 定义可翻译字段）。
- 重复调用为更新（UNIQUE 约束），无副作用；字段不在白名单内返回 `400`。

### 翻译状态概览

```
GET /api/v1/admin/translations/overview?entityType=video
```

响应每个实体的译文摘要 `{ locale: [field...] }`。

---

## 运维与调试

### 上传模式配置

```
GET /api/v1/admin/upload-config
```

响应：`{ "enableDirectUpload": true }`（由环境变量 `ENABLE_DIRECT_UPLOAD` 控制，非 'false' 即启用）。

### 系统调试诊断

```
GET /api/v1/admin/debug
```

响应 `data`：服务器信息（uptime、node 版本、内存、日志级别）、代理检测（是否在 Cloudflare 后）、各存储节点连通性探测。**仅调试用，生产慎开。**

### 运行时日志级别

```
GET/POST /api/v1/admin/loglevel?level=debug
```

- GET 不带参：返回当前日志级别 `{ "level": "info" }`；
- 设置：`?level=debug` 或 body `{ "level": "debug" }`（level 取值见 logger 实现）。

---

## 常见错误码

| HTTP code | 场景 |
| --- | --- |
| `400` | 缺少必填参数（如 deviceId）、字段不在白名单 |
| `401` | 未登录 / Token 缺失或无效 |
| `404` | 资源不存在（如订单、视频、存储节点不存在） |
| `429` | 分析接口限流（events/batch） |
| `500` | 服务器内部错误 |

---

## 接口文档维护规范

- 本文件由 `scripts/check-api-docs.mjs` 自动校验：扫描 `packages/server/src` 全部路由，未写入文档的接口会导致检查失败（pre-commit 拦截）。
- **任何接口变更必须同步更新本文档与 `doc/api_specification.md`,与代码同一 commit 提交。**
- 校验命令：`node scripts/check-api-docs.mjs`（增量，配合 git staged）/ `node scripts/check-api-docs.mjs --full`（全量）。
