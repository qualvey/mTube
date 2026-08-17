# StreamVIP (mTube) 开放接口规范文档 (API Specification)

本文档提供 **StreamVIP (mTube)** 视频流与变现付费墙系统的完整 API 接口规范，包含 C 端视频播放、支付变现引擎、集群存储节点通信（HMAC-SHA256 签名）以及 B 端管理控制面接口。

---

## 目录
1. [通用说明与响应格式](#一-通用说明与响应格式)
2. [C 端公开视频与播放接口](#二-c-端公开视频与播放接口)
3. [付费墙、VIP 与支付引擎接口](#三-付费墙vip-与支付引擎接口)
4. [集群存储节点通信接口 (HMAC-SHA256)](#四-集群存储节点通信接口-hmac-sha256)
5. [B 端后台管理接口](#五-b-端后台管理接口)

---

## 一、 通用说明与响应格式

### 1.1 统一 JSON 响应结构

全站 RESTful API 统一采用 JSON 响应结构：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

#### 常见状态码定义：
| HTTP / code | 说明 |
| :--- | :--- |
| `200` | 请求成功 |
| `400` | 请求参数无效或缺少必填字段 |
| `401` | 未授权 / 签名校验失败 / Token 过期 |
| `403` | 权限不足 / 防盗链校验拦截 |
| `404` | 资源或路由不存在 |
| `500` | 服务器内部处理错误 |

### 1.2 HMAC-SHA256 集群安全请求头规范
集群内部节点通信（如存储节点自动注册与心跳保活）必须携带以下动态签名 Header：
- `X-Cluster-Timestamp`: Unix 时间戳 (毫秒)
- `X-Cluster-Nonce`: 16 字节随机串
- `X-Cluster-Signature`: HMAC-SHA256 动态签名：
  $$\text{Signature} = \text{HMAC-SHA256}(\text{JSON.stringify(body)} + "." + \text{Timestamp} + "." + \text{Nonce}, \text{CLUSTER\_SECRET})$$

**scope 化直传凭证（浏览器直传专用）**：主控签发直传凭证时，额外携带 `X-Cluster-Scope`（值为 uploadId），且签名串改为 `JSON.stringify({ nodeId, timestamp, scope })`。存储节点收到带 scope 的请求时：
- 签名必须匹配带 scope 的串；
- 路径仅限直传接口（`/api/v1/storage/upload` / `upload-chunk` / `check-chunks` / `merge-chunks` / `status`），其余（如 `delete` / `cleanup`）一律拒绝；
- `upload-chunk` / `check-chunks` / `merge-chunks` 请求中的 uploadId 必须等于 scope。

不带 `X-Cluster-Scope` 的请求走原签名逻辑（server-to-server 专用），向后兼容。

---

## 二、 C 端公开视频与播放接口

### 2.1 获取公开视频列表
- **请求方式**：`GET /api/v1/videos`
- **请求参数**：
  - `tag` (string, 可选): 按分类标签过滤（如 `新增`, `VIP独家`）
  - `search` (string, 可选): 按关键词搜索标题或创作者
  - `page` / `limit` (number, 可选): 分页（默认 page=1, limit=10）
- **可见性规则**：只返回已发布视频（`status=PUBLISHED`，或 `status=SCHEDULED` 且已到 `publishAt` 的自动转已发布）。未到发布时间的定时队列对 C 端不可见。
- **响应示例**（分页结构）：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "vid_1722589200",
        "title": "【4K原画】独家高能短视频",
        "description": "精彩剪辑视频描述",
        "author": "官方创作者",
        "authorAvatar": "https://...",
        "videoUrl": "https://storage.domain.com/uploads/videos/vid_xxx.mp4",
        "poster": "https://storage.domain.com/uploads/posters/poster_xxx.jpg",
        "duration": "05:20",
        "isVip": true,
        "previewDuration": 120,
        "likes": 128,
        "views": 3520,
        "tags": ["新增", "4K画质"],
        "storageNodeId": "node-01"
      }
    ],
    "total": 56,
    "page": 1,
    "limit": 10,
    "totalPages": 6
  }
}
```
> 兼容旧格式：`data` 为纯数组时视为单页全部数据。

### 2.2 获取单个视频详情
- **请求方式**：`GET /api/v1/videos/:id`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "vid_1722589200",
    "title": "【4K原画】独家高能短视频",
    "isVip": true,
    "previewDuration": 120,
    ...
  }
}
```

### 2.3 视频点赞
- **请求方式**：`POST /api/v1/videos/:id/like`
- **响应示例**：
```json
{
  "code": 200,
  "message": "点赞成功！",
  "data": { "likes": 129 }
}
```

### 2.4 后端流式防盗链代理播放 (Ranged Video Proxy Stream)
- **请求方式**：`GET /api/v1/proxy/video`
- **请求参数**：
  - `url` (string, 必填): 目标视频公网 URL
  - `id` (string, 可选): 视频 ID（用于 VIP 校验与单设备流控）
  - `deviceId` (string, 可选): 设备指纹 ID，可通过 query 或 `X-Device-Id` 头传入；VIP 视频要求携带且设备处于 VIP 有效期内
  - `headers` (string, 可选): JSON 序列化的自定义请求头（如 `{"Referer":"...","User-Agent":"..."}`）
- **支持标头**：`Range: bytes=0-` (支持 HTTP Range 断点续传拖拽)
- **VIP 安全**：`video.isVip && !isVipUnlocked && previewLimit <= 0` 时返回 `403` 拒绝流（后端核心 VIP 安全校验）；非 VIP 设备播放 VIP 视频仅允许 previewDuration 试看
- **单设备单流**：同一 deviceId 同时拉流时，新请求会终止旧流（Single-Stream-Per-Device Guard）
- **响应**：二进制视频数据流 (`Content-Type: video/mp4`)

### 2.5 动态第 50 帧封面截取生成代理
- **请求方式**：`GET /api/v1/proxy/poster`
- **请求参数**：
  - `id` (string, 必填): 视频 ID
- **响应**：JPEG 封面图片二进制流 (`Content-Type: image/jpeg`)

### 2.6 获取分类标签列表
- **请求方式**：`GET /api/v1/tags`
- **响应**：`data` 为标签数组（按视频数降序）：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    { "name": "新增", "count": 42 },
    { "name": "VIP独家", "count": 18 },
    { "name": "4K画质", "count": 9 }
  ]
}
```

### 2.7 按标签获取视频列表
- **请求方式**：`GET /api/v1/videos/tag/:tag`
- **路径参数**：`tag` (string, 必填) — 分类标签
- **响应**：视频数组，结构同 2.1

### 2.8 搜索实时建议（联想词）
- **请求**:`GET /api/v1/videos/suggest`
- **参数**:
  - `q` (string, 必填) - 搜索关键词/前缀（截断至 50 字符）
  - `lang` (string, 可选) - 语言（`zh`/`en`）；联想词基于翻译后标题与标签
  - `limit` (number, 可选, 默认 8, 上限 20) - 返回建议词数量
- **响应**:`data` 为建议词字符串数组（匹配标题+标签，按热度 `validViews` 降序、去重）:
```json
{
  "code": 200,
  "message": "success",
  "data": ["阿萨大厦", "阿萨大厦（副本 1）"]
}
```
- **说明**:匹配在应用语言翻译之后进行；`q` 为空返回空数组；纯内存过滤（当前数据规模下无索引需求）

### 2.9 获取广告（信息流/前贴片/中插）
- **请求方式**：`GET /api/v1/ads`
- **请求参数**：
  - `placement` (string, 可选，默认 `feed`) — 广告位：`feed`(信息流原生) / `preroll`(前贴片) / `midroll`(中插)
  - `vip` (`0`/`1`, 可选，默认 `0`) — 请求方是否 VIP；VIP 会跳过标记为「仅免费用户」的广告
- **响应**：`data` 为广告数组，仅返回已启用且处于投放窗口内的广告：
```json
[
  {
    "id": "ad-1722589200000",
    "title": "618 推广",
    "type": "feed",
    "imageUrl": "https://.../ad.jpg",
    "videoUrl": "",
    "linkUrl": "https://...",
    "isVip": true,
    "enabled": true,
    "startAt": null,
    "endAt": null,
    "sortOrder": 0
  }
]
```

### 2.10 站点配置（公告/活动/Hero 等）
- **请求方式**：`GET /api/v1/settings`（兼容别名 `/api/v1/site-config`、`/api/v1/paywall/config`）
- **请求参数**：`lang` (string, 可选)
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "paywallEnabled": false,
    "adsEnabled": false,
    "adsFeedInterval": 6,
    "siteTitle": "StreamVIP - 独家超清视频流与VIP特权",
    "heroImageUrl": "...",
    "enableNotice": true,
    "noticeTitle": "📢 官方重要公告",
    "noticeContent": "...",
    "defaultTheme": "dark",   // C 端默认主题：dark=夜间(默认) | light=日间 | system=跟随系统
    "enableSeekPreview": true,
    "paywallNotice": "...",
    "userAgreement": "...",
    "customerServiceText": "..."
  }
}
```

### 2.11 获取公告
- **请求方式**：`GET /api/v1/notice?lang=zh`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "noticeHash": "nh_ab12cd",
    "title": "📢 官方重要公告",
    "content": "..."
  }
}
```

### 2.12 全站导航菜单（管理侧配置）
- **请求方式**：`GET /api/v1/menus`
- **说明**：返回启用中的导航菜单树（管理侧在 `/api/v1/admin/menus` 配置）。未配置任何菜单时自动返回默认菜单（全部视频 + 最热 8 个 tag）。
- **菜单类型 `type`**：`category`(视频分类，`target.tags` 为绑定 tag 数组，空数组 = 全部) | `link`(路由跳转，`target.url`) | `page`(内置页，`target.pageKey`，预留) | `group`(纯分组，预留)
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "menu-xxx",
      "parentId": null,
      "name": "全部视频",
      "type": "category",
      "target": { "tags": [] },
      "icon": "▶",
      "sortOrder": 0,
      "enabled": true,
      "children": []
    },
    {
      "id": "menu-yyy",
      "parentId": null,
      "name": "热门",
      "type": "category",
      "target": { "tags": ["热门"] },
      "icon": "",
      "sortOrder": 1,
      "enabled": true,
      "children": []
    }
  ]
}
```

### 2.13 通用文件上传（管理员鉴权）
- **请求方式**：`POST /api/v1/upload`
- **鉴权**：需管理员 Bearer Token（同 `/api/v1/admin/*` 体系）
- **格式**（两种，推荐 multipart）：
  - `multipart/form-data`：字段 `file`（File），浏览器自动带 boundary；主控存本地 `uploads/` 目录，返回相对路径（封面等小图场景）
  - `application/json`（向后兼容）：`{ filename, fileData }`（base64）或 `{ filename, contentBase64 }`
- **响应**：`{ code: 200, data: { url: "/uploads/xxx.jpg", originalName, size } }`；单文件限 20MB

### 2.14 埋点上报（Legacy C 端统计）
- **请求方式**：`POST /api/v1/analytics/track`
- **请求 Body**：
```json
{
  "path": "/videos/vid_xxx",
  "videoId": "vid_xxx",
  "action": "PV",
  "deviceId": "dev_xxx",
  "userAgent": "...",
  "referer": "..."
}
```
- **说明**：`action` 缺省为 `PV`；`videoId` 可选。兼容旧版采集，新采集统一走 `POST /api/v1/events/batch`（见 2.14）。
- **响应**：`200`，`data` 为采集结果

### 2.20 事件批量上报（新版埋点）
- **请求方式**：`POST /api/v1/events/batch`
- **请求 Body**：
```json
{
  "events": [
    { "event": "VIDEO_2S", "videoId": "vid_xxx", "receivedAt": "2026-08-14T12:00:00.000Z" },
    { "event": "WATCH_TIME", "videoId": "vid_xxx", "watchSeconds": 30, "receivedAt": "2026-08-14T12:00:05.000Z" }
  ]
}
```
- **事件类型**：`VIDEO_2S`（有效播放）/ `WATCH_TIME`（观看时长，带 `watchSeconds`）/ `VIDEO_COMPLETE`（完整播放）/ `PAGE_VIEW`（页面 PV）等，数据落库供 Analytics 聚合。
- **说明**：带限流（429）；分析系统设计详见 `docs/analytics-system-v1.md`。
- **响应**：`200`，`data` 为写入统计结果

### 2.15 用户注册（邮箱验证，两步）
- **开关**:`EMAIL_VERIFICATION_ENABLED`（默认 `true`）；`false` = 关闭邮箱验证，注册即登录（一步）
- **第一步 发送验证码**:`POST /api/v1/auth/register`
- **请求体**（JSON）:
  - `email` (string, 必填) - 邮箱（唯一，自动小写）
  - `password` (string, 必填) - 密码，至少 8 位
  - `nickname` (string, 可选, ≤24 字符) - 昵称；缺省用邮箱前缀
- **响应**（验证开启）:
```json
{
  "code": 200,
  "message": "验证码已发送，请查收邮箱",
  "data": { "requiresVerification": true, "email": "a@b.com" }
}
```
- **说明**:
  - 验证码 6 位数字，5 分钟有效；同 IP 限流 5 次/分钟
  - 未配置 `RESEND_API_KEY` 时进入开发模式，`data.devCode` 直接返回验证码（仅开发环境）
  - 邮件服务:Resend（`RESEND_API_KEY` / `RESEND_FROM`，默认 `onboarding@resend.dev`）
  - 关闭开关时响应为 `201` + `{ user, token, expiresAt }`（同登录）

### 2.16 验证码确认（创建用户并登录）
- **请求**:`POST /api/v1/auth/verify`
- **请求体**（JSON）: `{ "email": "...", "code": "123456" }`
- **响应**:`201`，`{ user, token, expiresAt }`（注册成功即登录）
- **错误**:验证码错误 `400`（错误 5 次后需重新获取）；过期 `400`；限流同 IP+邮箱 10 次/分钟

### 2.17 用户登录
- **请求**:`POST /api/v1/auth/login`
- **请求体**（JSON）: `email` + `password`
- **响应**:`200`，结构同注册（token 有效期默认 7 天，可 `AUTH_TOKEN_TTL_DAYS` 覆盖）
- **说明**:邮箱或密码错误统一返回 `401 邮箱或密码错误`（防账号枚举）；限流同 IP+邮箱 10 次/分钟

### 2.18 登出 / 当前用户
- **登出**:`POST /api/v1/auth/logout`（Bearer token，吊销当前会话）
- **当前用户**:`GET /api/v1/auth/me`（Bearer token，返回 `data` 为用户信息）
- **认证方式**:所有需登录接口带 `Authorization: Bearer <token>`

### 2.19 评论
- **列表（公开）**:`GET /api/v1/videos/:id/comments?page=&limit=`（limit ≤50，默认 20；按时间倒序，分页结构与视频列表一致）
- **发表（需登录）**:`POST /api/v1/videos/:id/comments`，请求体 `{ "content": "..." }`（1~500 字）
  - 限流：每用户 10 条/分钟（防滥评）
  - 响应 `201`，`data` 为评论对象（含 `nickname`/`avatar`）
- **删除（仅本人）**:`DELETE /api/v1/comments/:id`（需登录；他人评论返回 404）
- **状态**:`status` 字段预留审核流（`PUBLISHED`/`PENDING`/`HIDDEN`），当前默认直接发布，管理端审核后置


### 2.21 版本信息（前端自动升级检测）
- **接口**:`GET /api/v1/version`（无需登录）
- **用途**:前端轮询此接口，对比本地构建版本（vite define 注入的 GIT_SHA），不一致时弹出「发现新版本」提示条，点击一键刷新，无需用户手动清缓存
- **返回 data**：
```json
{
  "gitSha": "a267f14...",   // CI 构建时注入（Dockerfile ARG GIT_SHA），本地 dev 为 "dev"
  "version": "1.5.0",       // server package.json version
  "buildTime": "2026-08-16T20:30:00Z"  // CI 注入，可为 null
}
```
- **轮询策略**：client/admin 每 5 分钟 + 切回页面时即时检查；仅生产构建（GIT_SHA != dev）才触发提示

---

## 三、 付费墙、VIP 与支付引擎接口

### 3.1 创建支付宝 RSA2 WAP 支付订单
- **请求方式**：`POST /api/v1/paywall/alipay/create`
- **请求 Body**：
```json
{
  "planId": "vip_monthly",
  "amount": 29.9,
  "deviceId": "dev_mac_c81f66"
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "支付宝支付订单创建成功",
  "data": {
    "tradeNo": "VIP_1722589200_8f2a",
    "payUrl": "https://openapi.alipay.com/gateway.do?app_id=...&sign=..."
  }
}
```

### 3.2 创建 USDT 链上支付订单（微毫小数防碰撞）
- **请求方式**：`POST /api/v1/paywall/crypto/create`
- **请求 Body**：
```json
{
  "planId": "vip_yearly",
  "amount": 199,
  "deviceId": "dev_mac_c81f66"
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "USDT 校验订单创建成功",
  "data": {
    "tradeNo": "USDT_1722589200_c9a1",
    "usdtAmount": 27.6391,
    "walletAddress": "TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V",
    "expireSeconds": 1800
  }
}
```

### 3.3 查询设备 VIP 状态
- **请求方式**：`GET /api/v1/paywall/vip-status?deviceId=xxx`
- **请求参数**：`deviceId` (string, 必填)
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "isVip": true,
    "vipExpireAt": "2026-09-08T00:00:00.000Z"
  }
}
```
无 VIP / 已过期 / deviceId 为空时：`{ "isVip": false, "vipExpireAt": null }`

### 3.4 设备自助取消 VIP
- **请求方式**：`POST /api/v1/paywall/vip/cancel`（兼容别名 `/api/v1/paywall/vip-cancel`）
- **请求参数**：`deviceId` (body / query, 必填)
- **响应示例**：
```json
{
  "code": 200,
  "message": "设备 VIP 权限已成功取消",
  "data": { "success": true, "deviceId": "abc123device" }
}
```

### 3.5 凭订单号恢复设备 VIP 特权
- **请求方式**：`POST /api/v1/paywall/restore`
- **请求 Body**：
```json
{
  "orderId": "ORD-1722589200000",
  "deviceId": "dev_mac_new_99"
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "VIP 权限已成功恢复并绑定至当前设备！",
  "data": {
    "success": true,
    "message": "VIP 权限已成功恢复并绑定至当前设备！",
    "vipExpireAt": "2026-09-08T00:00:00.000Z"
  }
}
```
> 限制：订单必须已支付（PAID）；每个订单仅可恢复 1 次（restoredCount 上限）。

### 3.6 获取套餐配置
- **请求方式**：`GET /api/v1/paywall/config`（兼容别名 `/api/v1/site-config`、`/api/v1/settings`）
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": { "plans": [{ "id": "plan-1", "key": "monthly", "name": "月度 VIP", "price": 39 }] }
}
```

### 3.7 创建本地订单（兼容旧接口）
- **请求方式**：`POST /api/v1/paywall/order`
- **请求 Body**：`{ "planId": "plan-1", "deviceId": "dev_xxx", "payType": "alipay", "status": "PENDING" }`
- **响应**：新建订单对象

### 3.8 订单状态查询（前端支付完成后轮询）
- **请求方式**：`GET /api/v1/paywall/order/:id`
- **路径参数**：`id` (string, 必填) — 订单 ID
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "ORD-1722589200000",
    "status": "PAID",
    "payStatus": "PAID"
  }
}
```

### 3.9 ruyizf 订单状态主动查询
- **请求方式**：`GET /api/v1/paywall/ruyizf/query/:id`
- **路径参数**：`id` (string, 必填) — 订单 ID
- **响应**：ruyizf 平台查询结果

### 3.10 ruyizf 支付回调（异步通知）
- **请求方式**：`POST /api/v1/paywall/notify`
- **说明**：ruyizf 平台异步通知，验签后激活 VIP。响应体：`SUCCESS` / `FAIL`（非 JSON）

### 3.11 支付宝回调（异步通知）
- **请求方式**：`POST /api/v1/paywall/alipay/notify`
- **说明**：支付宝 RSA2 异步通知，验签 + 金额校验后完成订单。响应体：`success` / `fail`（非 JSON）

---

## 四、 集群存储节点通信接口 (HMAC-SHA256)

### 4.1 存储节点开机自报家门自动注册
- **请求方式**：`POST /api/v1/storage-nodes/register`
- **安全请求头**：需携带 `X-Cluster-Timestamp`, `X-Cluster-Nonce`, `X-Cluster-Signature`
- **请求 Body**：
```json
{
  "id": "node-hk-02",
  "name": "香港 8TB 存储节点 02",
  "baseUrl": "http://***REMOVED***:3001",
  "isDefault": false
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "存储节点 [香港 8TB 存储节点 02] 已通过 HMAC-SHA256 安全校验成功注册上线！",
  "data": {
    "id": "node-hk-02",
    "name": "香港 8TB 存储节点 02",
    "baseUrl": "http://***REMOVED***:3001",
    "status": "ONLINE",
    "isDefault": false
  }
}
```

### 4.2 存储节点 30 秒保活心跳
- **请求方式**：`POST /api/v1/storage-nodes/heartbeat`
- **安全请求头**：需携带 `X-Cluster-Timestamp`, `X-Cluster-Nonce`, `X-Cluster-Signature`
- **请求 Body**：
```json
{
  "id": "node-hk-02",
  "status": "ONLINE",
  "videoCount": 128
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "心跳接收成功",
  "data": { "status": "ACK", "nodeId": "node-hk-02" }
}
```

### 4.3 存储节点健康与状态查询 (运行于各 Storage Node 端口 3001)
- **请求方式**：`GET /api/v1/storage/status`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "nodeId": "node-hk-02",
    "nodeName": "香港 8TB 存储节点 02",
    "status": "ONLINE",
    "port": 3001,
    "videoCount": 128,
    "posterCount": 128,
    "uptimeSeconds": 86400
  }
}
```

### 4.4 存储节点视频上传与第 50 帧自动提取 (运行于各 Storage Node 端口 3001)
- **请求方式**：`POST /api/v1/storage/upload`
- **请求类型**：`multipart/form-data`
- **表单字段**：`video` (File, 支持 MP4/M3U8/MOV)
- **响应示例**：
```json
{
  "code": 200,
  "message": "Upload to storage node successful",
  "data": {
    "nodeId": "node-hk-02",
    "filename": "vid_1722589200_a8f3.mp4",
    "sizeBytes": 104857600,
    "videoPath": "/uploads/videos/vid_1722589200_a8f3.mp4",
    "posterPath": "/uploads/posters/poster_frame50_vid_1722589200_a8f3.jpg",
    "videoUrl": "http://***REMOVED***:3001/uploads/videos/vid_1722589200_a8f3.mp4",
    "posterUrl": "http://***REMOVED***:3001/uploads/posters/poster_frame50_vid_1722589200_a8f3.jpg"
  }
}
```

---

## 五、 B 端后台管理接口

### 5.1 管理员登录
- **请求方式**：`POST /api/v1/admin/auth/login`
- **请求 Body**：
```json
{
  "username": "admin",
  "password": "admin123"
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

### 5.2 多存储节点列表与实时连通监控
- **请求方式**：`GET /api/v1/admin/storage-nodes`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "node-01",
      "name": "存储节点 01",
      "baseUrl": "http://localhost:3001",
      "isDefault": true,
      "status": "ONLINE",
      "videoCount": 42
    },
    {
      "id": "node-hk-02",
      "name": "香港 8TB 存储节点 02",
      "baseUrl": "http://***REMOVED***:3001",
      "isDefault": false,
      "status": "ONLINE",
      "videoCount": 128
    }
  ]
}
```

### 5.3 设为默认上传节点
- **请求方式**：`POST /api/v1/admin/storage-nodes/:id/set-default`
- **响应示例**：
```json
{
  "code": 200,
  "message": "存储节点 [香港 8TB 存储节点 02] 已成功设为默认上传节点"
}
```

### 5.4 代理视频文件透传上传至指定节点
- **请求方式**：`POST /api/v1/admin/videos/upload`
- **请求 Body**：`multipart/form-data` (`video`: File, `nodeId`: "node-hk-02")
- **响应示例**：
```json
{
  "code": 200,
  "message": "视频已成功透传上传至存储节点 [香港 8TB 存储节点 02]，第50帧封面已生成！",
  "data": {
    "storageNodeId": "node-hk-02",
    "videoUrl": "http://***REMOVED***:3001/uploads/videos/vid_xxx.mp4",
    "posterUrl": "http://***REMOVED***:3001/uploads/posters/poster_frame50_vid_xxx.jpg"
  }
}
```

### 5.5 提交发布新视频
- **请求方式**：`POST /api/v1/admin/videos`
- **请求 Body**：
```json
{
  "title": "【4K原画】最新发布独家视频",
  "description": "详细描述信息",
  "author": "官方创作者",
  "storageNodeId": "node-hk-02",
  "videoUrl": "http://***REMOVED***:3001/uploads/videos/vid_xxx.mp4",
  "poster": "http://***REMOVED***:3001/uploads/posters/poster_frame50_vid_xxx.jpg",
  "referer": "",
  "userAgent": "",
  "isVip": true,
  "previewDuration": 120,
  "tags": ["新增", "VIP独家"]
}
```
- **响应示例**（`201`，完整视频对象）：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "vid_1722589300",
    "title": "【4K原画】最新发布独家视频",
    "status": "PUBLISHED",
    "isVip": true,
    "tags": ["新增", "VIP独家"],
    "publishAt": null
  }
}
```
> `status=SCHEDULED` 未带 `publishAt` 时默认下个 UTC+8 00:00 发布（详见 `doc/api/admin.md`）。

### 5.6 获取系统全局数据分析
- **请求方式**：`GET /api/v1/admin/analytics`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "totalVideos": 56,
    "totalOrders": 128,
    "totalRevenue": 3840.5,
    "todayPv": 1420,
    "todayUv": 580,
    "chartData": {
      "dates": ["07-27", "07-28", "07-29", "07-30", "07-31", "08-01", "08-02"],
      "pv": [800, 950, 1100, 1300, 1250, 1500, 1420],
      "uv": [300, 400, 480, 520, 500, 610, 580]
    }
  }
}
```

### 5.7 撤销设备 VIP（移除指定设备的 VIP 权限）

管理员手动移除某个设备的 VIP 权限，立即生效（删除 `vip_devices` 记录），该设备随即无法播放 VIP 内容。

#### 形式 A：路径参数
- **请求方式**：`POST /api/v1/admin/devices/:deviceId/revoke-vip`
- **路径参数**：`deviceId` (string, 必填) — 设备指纹 ID

#### 形式 B：query / body 传参
- **请求方式**：`POST /api/v1/admin/devices/revoke-vip`
- **请求参数**：`deviceId` (string, 必填) — 可放 query 或 JSON body
```json
{ "deviceId": "abc123device" }
```

> 参数优先级：路径参数 > body > query；`deviceId` 自动 trim。
> 幂等：设备无 VIP 时调用同样返回 200，可安全重试。

- **成功响应**：
```json
{
  "code": 200,
  "message": "手动取消设备 VIP 成功",
  "data": { "success": true, "deviceId": "abc123device" }
}
```

- **失败响应（缺参）**：`400` `{ "code": 400, "message": "缺失 deviceId 参数", "data": null }`

### 5.8 手动授予 / 恢复设备 VIP

#### 按订单授予（恢复订单设备的 VIP）
- **请求方式**：`POST /api/v1/admin/orders/:id/grant-vip`
- **请求 Body**（`deviceId` 可选，缺省用订单自身绑定设备）：
```json
{ "deviceId": "abc123device" }
```
- **成功响应**：
```json
{
  "code": 200,
  "message": "手动充值/恢复 VIP 权限成功",
  "data": { "deviceId": "abc123device", "vipExpireAt": "2026-09-08T00:00:00.000Z", "isVip": true }
}
```

#### 按设备 ID 直接授予（赠送 / 手动开通）
- **请求方式**：`POST /api/v1/admin/devices/:deviceId/grant-vip`
- **请求 Body**（`planId` 可选，缺省 `month`）：
```json
{ "planId": "season" }
```
- **planId 时长映射**：`day`→1天、`month`/`plan-1`→30天、`season`/`plan-2`→90天、`year`/`plan-3`→365天、`lifetime`/`plan-4`→36500天；已有未过期 VIP 时顺延叠加。
- **成功响应**：结构同「按订单授予」。

### 5.9 菜单管理（全站导航菜单）
- **请求方式**：`GET /api/v1/admin/menus`（全部菜单，含停用）/ `POST /api/v1/admin/menus`（新建）/ `PUT /api/v1/admin/menus/:id`（更新）/ `DELETE /api/v1/admin/menus/:id`（删除，子级自动挂顶级）
- **说明**：菜单类型 `category`(绑定 tag 过滤视频) / `link`(路由跳转) / `page` / `group`；C 端消费见 2.11。详见 `doc/api/admin.md`「菜单管理（CRUD）」。

### 5.10 系统设置 / 套餐 / 统计（详见 doc/api/admin.md）
- **请求方式**：`GET|PUT|POST /api/v1/admin/settings`（系统设置）
- **请求方式**：`GET /api/v1/admin/paywall/plans` / `PUT /api/v1/admin/paywall/plans`（套餐管理）
- **请求方式**：`GET /api/v1/admin/stats`（严格 PAID 口径营收）/ `GET /api/v1/admin/dashboard/stats`（控制台统计）

### 5.11 订单管理（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/orders`（订单列表，含设备实时 VIP 状态）/ `DELETE /api/v1/admin/orders/:id`（删除记录）/ `POST /api/v1/admin/orders/:id/confirm-crypto`（确认 USDT 订单）
- **请求方式**：`POST /api/v1/admin/orders/:id/grant-vip`（按订单授予 VIP）/ `POST /api/v1/admin/devices/:deviceId/grant-vip`（按设备授予）/ `POST /api/v1/admin/devices/:deviceId/revoke-vip`（撤销，兼容 `POST /api/v1/admin/devices/revoke-vip`）

### 5.12 存储节点管理（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/storage-nodes`（列表+连通监控）/ `POST /api/v1/admin/storage-nodes`（新增）/ `PUT /api/v1/admin/storage-nodes/:id`（更新）/ `DELETE /api/v1/admin/storage-nodes/:id`（删除）/ `POST /api/v1/admin/storage-nodes/:id/set-default`（设默认）/ `GET /api/v1/admin/storage/status`（默认节点健康状态）

### 5.13 数据分析（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/analytics/overview`（PV/UV 概览）/ `GET /api/v1/admin/analytics/trend?days=7`（趋势）/ `GET /api/v1/admin/analytics/top-videos?limit=10`（热门 Top N）/ `GET /api/v1/admin/analytics/logs` + `DELETE /api/v1/admin/analytics/logs`（访问日志与清理）
- **请求方式**：`GET /api/v1/admin/analytics/v1/overview` / `GET /api/v1/admin/analytics/v1/report?days=N` / `GET /api/v1/admin/analytics/v1/export.csv?type=daily|videos|paths|countries`（CSV 导出）/ `POST /api/v1/admin/analytics/v1/rebuild`（重算聚合）

### 5.14 运维与调试 / 翻译管理（详见 doc/api/admin.md）
- **运维**：`GET /api/v1/admin/upload-config`（上传模式）/ `GET /api/v1/admin/debug`（诊断）/ `GET|POST /api/v1/admin/loglevel`（日志级别）/ `POST /api/v1/admin/videos/upload-ticket`（直传凭证）
- **翻译**：`GET /api/v1/admin/translations` / `PUT /api/v1/admin/translations` / `GET /api/v1/admin/translations/overview`
