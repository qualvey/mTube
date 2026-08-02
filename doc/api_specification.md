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

### 2.4 增加播放播放量
- **请求方式**：`POST /api/v1/videos/:id/view`
- **响应示例**：
```json
{
  "code": 200,
  "message": "播放量+1",
  "data": { "views": 3521 }
}
```

### 2.5 后端流式防盗链代理播放 (Ranged Video Proxy Stream)
- **请求方式**：`GET /api/v1/proxy/stream`
- **请求参数**：
  - `url` (string, 必填): 目标视频公网 URL
  - `referer` (string, 可选): 自定义 Referer 请求头
  - `ua` (string, 可选): 自定义 User-Agent 签名
- **支持标头**：`Range: bytes=0-` (支持 HTTP Range 断点续传拖拽)
- **响应**：二进制视频数据流 (`Content-Type: video/mp4`)

### 2.6 动态第 50 帧封面截取生成代理
- **请求方式**：`GET /api/v1/proxy/poster`
- **请求参数**：
  - `id` (string, 必填): 视频 ID
- **响应**：JPEG 封面图片二进制流 (`Content-Type: image/jpeg`)

---

## 三、 付费墙、VIP 与支付引擎接口

### 3.1 获取付费墙系统全局设置与公告
- **请求方式**：`GET /api/v1/paywall/settings`
- **响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "enableNotice": true,
    "siteTitle": "StreamVIP - 独家超清视频流",
    "noticeTitle": "📢 官方重要公告",
    "noticeContent": "欢迎来到 StreamVIP 独家流媒体平台...",
    "heroTitle": "极致诱惑",
    "heroSubtitle": "滑动探索更多内容",
    "cryptoUsdtAddress": "TY7x9N2m8Qk4Pz1v6W3s5R7u9Y2X4B6C8V",
    "cryptoExchangeRate": 7.2
  }
}
```

### 3.2 创建支付宝 RSA2 WAP 支付订单
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

### 3.3 创建 USDT 链上支付订单（微毫小数防碰撞）
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

### 3.4 校验设备 VIP 状态与试看时长
- **请求方式**：`POST /api/v1/paywall/device/check`
- **请求 Body**：
```json
{ "deviceId": "dev_mac_c81f66" }
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "设备状态正常",
  "data": {
    "isVip": true,
    "expireDate": "2026-09-01T00:00:00.000Z",
    "deviceId": "dev_mac_c81f66"
  }
}
```

### 3.5 凭订单号恢复设备 VIP 特权
- **请求方式**：`POST /api/v1/paywall/device/restore`
- **请求 Body**：
```json
{
  "tradeNo": "VIP_1722589200_8f2a",
  "deviceId": "dev_mac_new_99"
}
```
- **响应示例**：
```json
{
  "code": 200,
  "message": "VIP 权益成功迁移恢复至当前新设备！"
}
```

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
