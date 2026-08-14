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

---

## 二、 C 端公开视频与播放接口

### 2.1 获取公开视频列表
- **请求方式**：`GET /api/v1/videos`
- **请求参数**：
  - `tag` (string, 可选): 按分类标签过滤（如 `新增`, `VIP独家`）
  - `search` (string, 可选): 按关键词搜索标题或创作者
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
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
  ]
}
```

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
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": ["新增", "VIP独家", "4K画质"]
}
```

### 2.7 按标签获取视频列表
- **请求方式**：`GET /api/v1/videos/tag/:tag`
- **路径参数**：`tag` (string, 必填) — 分类标签
- **响应**：视频数组，结构同 2.1

### 2.8 站点配置（公告/活动/Hero 等）
- **请求方式**：`GET /api/v1/settings`（兼容别名 `/api/v1/site-config`、`/api/v1/paywall/config`）
- **请求参数**：`lang` (string, 可选)
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "paywallEnabled": false,
    "siteTitle": "StreamVIP - 独家超清视频流与VIP特权",
    "heroImageUrl": "...",
    "enableNotice": true,
    "noticeTitle": "📢 官方重要公告",
    "noticeContent": "...",
    "enableSeekPreview": true,
    "paywallNotice": "...",
    "userAgreement": "...",
    "customerServiceText": "..."
  }
}
```

### 2.9 获取公告
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

### 2.10 直接上传视频（主站入口）
- **请求方式**：`POST /api/v1/upload`
- **说明**：需管理员鉴权（同 `/api/v1/admin/*` 的 Bearer Token 体系）。用于浏览器直传场景的入口，内部会代理到存储节点或生成直传凭证。

### 2.11 埋点上报（Legacy C 端统计）
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
- **说明**：`action` 缺省为 `PV`；`videoId` 可选。兼容旧版采集，新采集统一走 `POST /api/v1/events/batch`。
- **响应**：`200`，`data` 为采集结果

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
- **响应示例**：
```json
{
  "code": 200,
  "message": "视频发布成功！",
  "data": { "id": "vid_1722589300" }
}
```

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

### 5.9 系统设置与统计（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/settings` / `PUT /api/v1/admin/settings` / `POST /api/v1/admin/settings`
- **请求方式**：`GET /api/v1/admin/stats`（严格 PAID 口径营收统计）
- **请求方式**：`GET /api/v1/admin/dashboard/stats`

### 5.10 运维与调试（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/upload-config` / `GET /api/v1/admin/debug` / `GET|POST /api/v1/admin/loglevel`
- **请求方式**：`POST /api/v1/admin/videos/upload-ticket`

### 5.11 翻译管理（详见 doc/api/admin.md）
- **请求方式**：`GET /api/v1/admin/translations` / `PUT /api/v1/admin/translations` / `GET /api/v1/admin/translations/overview`
