# 统计系统 V1 设计与开发计划

## 1. 目标

建立一套可用于产品运营和早期广告招商的统计系统，统一页面、视频和广告事件口径。V1 先交付真实 PV/UV、2 秒有效播放、观看时长和播放进度事件，并为后续广告曝光、点击、结算和反作弊预留扩展能力。

旧系统中的 `access_logs` 和 `videos.views` 继续保留用于兼容，但不再作为新统计的唯一事实来源。

## 2. 核心口径

### 页面

- `PAGE_VIEW`：每次完整页面加载生成一次，使用 `pageViewId` 去重。
- `UV`：按 `visitorId + 自然日` 去重。
- `SESSION`：30 分钟无活动后生成新的 `sessionId`。

### 视频

- `VIDEO_START`：播放器实际触发 `play`。
- `VIDEO_2S`：页面可见、视频处于播放状态且累计观看满 2 秒。该事件定义为 V1 的有效播放量。
- `VIDEO_25`、`VIDEO_50`、`VIDEO_75`：实际播放进度首次达到对应比例。
- `VIDEO_COMPLETE`：正常播放完成，或播放位置达到总时长的 95%。
- `WATCH_TIME`：分段上报实际观看秒数；页面隐藏、暂停和播放器非活跃时不累计。
- `PAYWALL_OPEN`：用户点击 VIP 解锁或试看结束触发付费墙，不计入播放量。

### 广告预留

- `AD_REQUEST`：请求广告。
- `AD_FILLED`：成功返回素材。
- `AD_RENDERED`：素材完成渲染。
- `AD_VIEWABLE`：展示广告至少 50% 连续可见 1 秒，视频广告至少 50% 连续可见 2 秒。
- `AD_CLICK`：有效点击。
- `AD_COMPLETE`：视频广告播放完成。

## 3. V1 架构

```text
Vue Client
  -> 本地事件队列（最多 20 条或每 5 秒批量发送）
  -> POST /api/v1/events/batch
  -> Node.js 参数校验、事件白名单、IP 哈希
  -> SQLite analytics_events（追加写、eventId 唯一去重）
  -> 同一事务内累加 daily_* 日聚合表 + sessions 会话表
  -> 报表/导出只读聚合表，原始表仅用于审计与重建
```

V1 沿用 SQLite 以降低当前项目的部署成本。进入正式广告结算或事件量持续超过约 1000 条/秒后，将原始事件迁移到 ClickHouse，广告合同和活动配置迁移到 PostgreSQL；客户端事件协议保持不变。

## 4. 数据模型

`analytics_events` 是不可变原始事件表：

- 身份：`eventId`、`visitorId`、`sessionId`、`pageViewId`、`playbackId`。
- 业务：`eventName`、`videoId`、`path`、`watchSeconds`、`positionSeconds`、`durationSeconds`。
- 环境：`userAgent`、`referer`、`ipHash`。
- 审计：`occurredAt`、`receivedAt`、`isValid`、`invalidReason`、`properties`。

`video_stats` 保存可快速查询的累计值（供视频列表/详情 API 读取）：

- `validViews`：`VIDEO_2S` 事件数。
- `watchSeconds`：有效 `WATCH_TIME` 秒数总和。
- `completes`：`VIDEO_COMPLETE` 事件数。
- `updatedAt`：最后更新时间。

### 聚合层（报表唯一数据源）

事件入库的同一事务内按日累加，报表永不扫描原始事件表：

| 表 | 粒度 | 用途 |
| --- | --- | --- |
| `daily_overview` | 日期 | 全站 PV/UV/开始/2秒/进度/完播/时长/事件有效数 |
| `daily_video` | 日期+视频 | 视频消费排行与导出 |
| `daily_path` | 日期+路径 | 页面访问排行 |
| `daily_device` | 日期+设备 | 设备构成（desktop/mobile/tablet/unknown） |
| `daily_country` | 日期+国家码 | 地理画像（国家/地区构成） |
| `daily_visitor` / `daily_path_visitor` / `daily_device_visitor` / `daily_country_visitor` | 去重集合 | UV 精确计数 |
| `sessions` | 会话 | 会话数、跳出率、人均页数、平均会话时长 |

聚合规则：

- 日期按 `receivedAt`（UTC）自然日归属；当日行持续更新，T+1 后不再变动（冻结）。
- 无效事件（`isValid=0`）只计入 `totalEvents`，不进入任何业务指标。
- `AD_*` / `PAYWALL_OPEN` 当前仅入原始事件表；广告漏斗聚合表在广告系统接入时按同一模式扩展。
- 累计表 `video_stats` 与日聚合同事务维护，重建时一并重建。

### 地理画像（国家/地区）

- 事件入库时通过 GeoIP 解析请求 IP 得到 ISO 国家码（`countryCode`，如 US/CN/HK），只存码、不存原始 IP。
- 解析器见 `packages/server/src/geoip.js`：ip-api.com 在线查询 + 24h 内存缓存 + 并发去重；私有/本机 IP 直接返回空。解析失败不影响事件入库（国家码为空，不计入地区维度）。
- 生产建议切换 MaxMind GeoLite2 本地 mmdb（离线、无限量），接口不变，仅替换 geoip.js 内部实现。
- 对外仅提供国家/地区级聚合（PV/UV/占比），不提供任何可定位到个人的地理明细。

### 报表接口

- `GET /api/v1/admin/analytics/v1/report?days=7|30|90`：汇总（当前/上期）、会话指标、每日趋势、播放漏斗、设备构成、Top 视频、Top 页面。
- `GET /api/v1/admin/analytics/v1/export.csv?type=daily|videos|paths&days=7|30|90`：CSV 导出（UTF-8 BOM，Excel 直接打开）。
- `POST /api/v1/admin/analytics/v1/rebuild`：清空聚合表并按原始事件回放重建（初始化或口径修复后使用）。
- 全部接口受管理员鉴权保护。

## 5. 数据质量和隐私

- `eventId` 作为唯一键，客户端重试不会重复计数。
- 单批最多 50 个事件，拒绝未知事件和超长字段。
- 服务端时间作为入库和报表主时间；客户端时间只用于排查延迟。
- 不长期保存完整 IP，服务端使用带盐 SHA-256 哈希。
- 不采集观看标签、性取向推断或其他敏感画像。
- 原始事件不物理删除作弊数据，后续通过 `isValid` 和 `invalidReason` 标记。

## 6. 开发阶段

### V1：基础统计（本次实施）

- [x] 统一事件口径和开发文档。
- [x] 批量事件采集接口与事件去重。
- [x] 页面 visitor/session/page-view 标识。
- [x] 2 秒有效播放、观看时长、进度和完成事件。
- [x] 旧 `trackAnalytics` 调用兼容。
- [x] 构建和接口验证。

### V1.1：管理后台报表

- [x] 统计总览：PV、UV、有效播放、观看时长和完成率。
- [x] 独立数据分析页：指标卡（含会话/跳出率）、趋势、漏斗、设备、排行。
- [x] 日聚合层：报表只读聚合表，不扫原始事件。
- [x] CSV 导出与聚合重建接口。
- [x] 地理画像：国家/地区构成（GeoIP 只存国家码，不存 IP）。
- 报表中明确区分“旧口径”和“V1 新口径”。

### V2：广告投放与招商报表

- 广告主、活动、素材、广告位和投放规则。
- 广告请求、填充、渲染、可见曝光和点击链路。
- 频控、预算、地区/设备定向和点击跳转服务。
- 广告主只读账户、日报和结算报表。

### V3：反作弊和结算

- 机器人、代理、异常速率和重复点击识别。
- T+1 数据冻结、无效流量复核和审计日志。
- PostgreSQL + ClickHouse + Redis 架构迁移。

## 7. 验收标准

- 重复发送相同 `eventId`，数据库只保留一条。
- 点击播放后不足 2 秒不计有效播放。
- 暂停、切换后台或卡片离开活跃区域时不累计观看时长。
- 拖动到结尾不直接产生完整播放。
- `PAYWALL_OPEN` 不增加有效播放量。
- 页面关闭时使用 `sendBeacon` 尽量发送剩余事件。
- 客户端和服务端构建通过，批量接口能够返回接受、重复和拒绝数量。

## 8. 招商报表口径

对外可提供月 PV、月 UV、国家/设备占比、有效播放量、总观看时长、视频完成率，以及后续广告请求、填充率、可见率、点击率和视频广告完成率。正式报价和结算应使用有效可见曝光，不能使用 HTTP 请求数、素材返回数或旧版 `videos.views`。
