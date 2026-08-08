# 管理端接口 (Admin API)

> 适用范围：StreamVIP (mTube) 后台管理系统（admin-web 前端所对接的全部后端接口）。
> 除登录外，所有 `/api/v1/admin/*` 接口均需携带管理员会话 Token，鉴权失败返回 `401`。
> 统一响应结构：`{ "code": 200, "message": "success", "data": ... }`。

## 认证

所有请求需携带请求头：

```
Authorization: Bearer <adminToken>
```

- 管理员 Token 通过 `POST /api/v1/admin/auth/login` 获取，为 48 位随机 hex 字符串。
- Token 存于服务端内存，服务重启后失效，需重新登录。
- 前端封装见 `packages/admin/src/utils/api.js`（`apiFetch` 自动附加 Token，收到 401 自动跳转登录页）。

## 订单管理

### 获取订单列表

```
GET /api/v1/admin/orders
```

响应 `data` 为订单数组。每个订单附带设备当前 VIP 状态字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 订单 ID |
| `orderNo` | string | 订单号（如存在） |
| `deviceId` | string \| null | 支付设备指纹 ID，可为空（匿名支付） |
| `planId` / `plan` | string | VIP 套餐标识（month / season / year / lifetime 等） |
| `planName` | string | 套餐显示名（如「月度 VIP」） |
| `amount` | number | 支付金额（元） |
| `cryptoAmount` | string \| null | USDT 支付数量（TRC20 渠道） |
| `paymentMethod` | string | 支付渠道：`ALIPAY` / `USDT` |
| `status` | string | 订单状态：`PAID`（已支付）等 |
| `isVip` | boolean | **该设备当前是否处于 VIP 有效期内** |
| `vipExpireAt` | string \| null | 该设备当前 VIP 到期时间（ISO 8601），无 VIP 时为 null |

> 注意：`isVip` / `vipExpireAt` 是**实时查询**设备 VIP 表得到的，不是订单历史快照；
> 同一设备多笔订单时，每笔订单行展示的都是该设备当前的最新状态。

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
  "data": {
    "success": true,
    "deviceId": "abc123device"
  }
}
```

**失败响应**（HTTP 400，缺少 deviceId）：

```json
{
  "code": 400,
  "message": "缺失 deviceId 参数",
  "data": null
}
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

### 查询设备 VIP 状态（C 端公开接口）

```
GET /api/v1/vip-status?deviceId=xxx
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `deviceId` | query | string | 是 | 设备指纹 ID |

成功响应（HTTP 200）：

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

- 设备有未过期 VIP：`isVip: true`，`vipExpireAt` 为到期时间。
- 设备无 VIP / 已过期 / deviceId 为空：`isVip: false`，`vipExpireAt: null`。

---

### 设备取消自己的 VIP（C 端公开接口）

```
POST /api/v1/vip/cancel        （或 /api/v1/vip-cancel）
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `deviceId` | body / query | string | 是 | 设备指纹 ID |

成功响应（HTTP 200）：

```json
{
  "code": 200,
  "message": "设备 VIP 权限已成功取消",
  "data": { "success": true, "deviceId": "abc123device" }
}
```

---

## 常见错误码

| HTTP code | 场景 |
| --- | --- |
| `400` | 缺少必填参数（如 deviceId） |
| `401` | 未登录 / Token 缺失或无效 |
| `404` | 资源不存在（如订单不存在） |
| `500` | 服务器内部错误 |
