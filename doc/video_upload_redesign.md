# 视频上传功能分析与重新设计方案

> 范围：`packages/admin`（前端）+ `packages/server`（主控 API）+ `packages/storage-node`（存储节点）
> 状态：v1.1 已部分实施（2026-08-14 两轮）：§3.7 异步后台发布 + 流式中转 + §3.3① 凭证 scope 化/健康探测/能力协商 + 试播预览已落地（admin/server/storage-node）；剩余：队列分页、封面去 base64
> 关联文档：`doc/api/admin.md`、`doc/api_specification.md`、`doc/TODO.md`

---

## 一、现状梳理

### 1.1 三条上传路径

| 路径 | 触发条件 | 数据流 | 主控内存 | 适用场景 |
| --- | --- | --- | --- | --- |
| A. 直传-切片 | `enableDirectUpload && ticket.chunkUploadUrl && file.size ≥ 5MB` | 浏览器 →(N 并发分片, HMAC 头)→ 存储节点 → merge-chunks | 无 | 大文件（绕过 CF 100MB 限制） |
| B. 直传-单文件 | 同上但不满足切片条件 | 浏览器 → 存储节点 `/api/v1/storage/upload` | 无 | 小文件 |
| C. 中转代理 | 直传抛异常后降级 | 浏览器 → 主控(`multer.memoryStorage` 2GB) → 存储节点 | 整文件 buffer | 兜底（实际上对大文件必败） |

封面（poster）另走 D 路径：浏览器 → base64 → 主控 `/api/v1/upload`（存主控本地盘）。

### 1.2 涉及代码

- `admin/src/components/VideoUploadModal.vue`（~600 行，上传编排 + 表单 + 任务登记 + 定时发布全揉在一起）
- `admin/src/utils/uploader.js`（直传引擎：TCP 预热 / 断点检测 / N 并发分片 / merge 幂等重试）
- `admin/src/views/VideosView.vue`（视频列表 + 任务队列 + 弹窗调度）
- `server/src/index.js`：`upload-ticket`（发凭证）、`videos/upload`（中转）、`upload-tasks`（任务队列 CRUD）、`upload-config`
- `storage-node/src/app.js`：`storage/upload`、`upload-chunk`、`check-chunks`、`merge-chunks`、`delete`、`cleanup`
- `storage-node/src/auth.js`：HMAC 集群签名（**不绑定 path/method/uploadId**，窗口 12h）

### 1.3 现有能力（不要推翻的部分）

- 分片直传绕过 CF 100MB 限制 ✔
- 断点续传（check-chunks 自愈校验，0 字节/尺寸不符分片自动丢弃）✔
- merge 幂等 + 文件大小校验 + 流式拼接（不整文件缓冲）✔
- 任务队列（先占位后上传、取消即删文件、上传自动入队）✔
- FFmpeg 第 50 帧自动封面 ✔

---

## 二、问题清单

### P0 — 正确性 Bug（必须修）

**P0-1 `registerTaskIfVideo` 引用未定义变量 `fieldName` → 上传"成功"但报错、任务永不入队**
`VideoUploadModal.vue`：
```js
const registerTaskIfVideo = (file, url) => {
  if (fieldName === 'videoUrl' && url && !props.form.taskId) { // fieldName 未定义！
    registerUploadTask(file?.name || '', url)
  }
}
```
`fieldName` 只存在于 `handleFileUpload` 的参数里，`registerTaskIfVideo` 是独立闭包 → 每次调用都抛 `ReferenceError`，被外层 catch 吞掉 → 用户看到「上传读取异常: fieldName is not defined」，**任务队列永远不登记**，上传成功的文件沦为孤儿（24h 后才被回收）。直传两个分支里该调用还被**复制了两行**（重复执行）。

**P0-2 `VideosView.vue` `resetFormForQueue` 中文字符串乱码**
```js
author: '?????',  tags: ['??']
```
「定时发布 → 继续添加下一个任务」时表单预填乱码（编码损坏）。

### P1 — 架构 / 安全 / 可靠性

**P1-1 中转模式整文件进主控内存，OOM 风险**
`multer.memoryStorage` + 2GB 上限。多管理员并发传大文件直接拖垮 VPS。且 Cloudflare 免费版 POST 100MB 上限下，>100MB 文件走中转**必然 413**——「直传失败降级中转」对这类文件是必败路径，还误导用户以为有兜底。

**P1-2 直传凭证 = 集群 HMAC 头直接发给浏览器，可重放**
签名只覆盖 `{nodeId, timestamp}` + nonce，**不绑定 path/method/uploadId**，窗口 12h（`HMAC_WINDOW_MS`）。浏览器拿到后 12h 内可对存储节点**任意接口**（含 `storage/delete`、`cleanup`）重放。安全边界 = 一个凭证全权。

**P1-3 uploadId 确定性生成 → 并发冲突 + 幂等串档**
`uploadId = up_ + hex(name+size+lastModified)`：
- 两个管理员同时传同名同大小文件 → 同 uploadId → 分片互相覆盖 → 缝合损坏；
- merge 幂等记录永久保留，同 uploadId 二次上传会命中旧记录返回**旧文件**。

**P1-4 上传不可取消**
关闭弹窗/路由跳转后 XHR/fetch 照常跑，完成后仍写表单、弹 toast（弹窗已关）。无 AbortController。

**P1-5 无客户端预检**
不校验类型/大小/扩展名。`file.type === ''` 的 m3u8 文本文件被 `isVideo` 判负，误入图片 base64 分支必失败。无「>100MB 建议直传」「>2GB 必须切片」分级提示（存储节点单文件上限 2GB，超了只有切片能过）。

**P1-6 封面路径分裂 + base64 低效**
封面走主控 `/api/v1/upload` base64（体积 +33%、无真实进度、复用视频进度 UI 文案错位），存主控本地盘；视频存存储节点。两套拓扑，删除/清理逻辑也要维护两处。

**P1-7 凭证下发前无节点健康探测**
节点宕机照样发 ticket → 直传失败 → 降级中转也失败 → 用户只拿到模糊报错。

**P1-8 并发数与 UI 展示脱节**
弹窗内临时 fetch `/api/v1/admin/settings` 且吞错（拿不到就用默认 4）；VideosView 顶栏 tag 硬编码「4通道直传模式」，与实际配置可能不符。

### P2 — 体验 / 工程

- **P2-1** 组件 600+ 行：上传引擎、表单、任务登记、定时发布逻辑全揉一起，不可单测、不可复用。
- **P2-2** 无上传后预览/试播：管理员发布前无法验证视频内容与防盗链 headers 是否生效（Phase 3 计划里的"在线试播"一直没做）。
- **P2-3** 任务队列全量拉取，无分页/搜索/状态筛选，任务多了不可用。
- **P2-4** 封面按钮 loading 与视频共用 `uploadLoading`，封面传输无进度条。
- **P2-5** `uploader.js` 是核心性能逻辑但零测试；admin 包无 test/lint 脚本。
- **P2-6** 表单内手动改 URL + 已上传文件的场景：文件已入队，URL 被手改 → 文件成孤儿（等 24h 清理），无提示。

---

## 三、重新设计

### 3.1 设计目标

1. **正确性优先**：消灭 P0；上传结果与任务队列强一致。
2. **安全收敛**：浏览器只拿"一次性、绑定 uploadId、短 TTL"的凭证，不再接触集群全权 HMAC。
3. **可测可维护**：上传引擎独立成 service（纯逻辑 + 状态机），组件只做编排。
4. **体验闭环**：拖拽上传 → 预检提示 → 真实进度 → 可取消 → 可续传 → 可预览 → 再发布。
5. **兼容**：API 契约向后兼容（新增字段，不破坏现有节点；老节点走能力协商降级）。

### 3.2 前端架构

```
admin/src/
├── services/
│   ├── uploadService.js      # ★ 上传引擎（纯逻辑，可单测）
│   │   ├── validateVideoFile(file)        # 预检：类型/大小/分级提示
│   │   ├── createUploadSession({file,nodeId})  # 拿 ticket + 能力协商
│   │   ├── uploadVideo(session, file, {onProgress, signal})
│   │   │     # 状态机：IDLE→FETCHING_TICKET→PREPARING→UPLOADING→MERGING→DONE
│   │   │     #                          └→ERROR / CANCELED（可恢复）
│   │   ├── resumeCheck(session, file)     # 断点检测（同文件自动续传）
│   │   └── uploadPoster(file, nodeId)     # 封面：走存储节点 multipart（去 base64）
│   └── uploadTaskService.js  # 任务队列 API（登记/完成/取消），与上传解耦
├── components/
│   ├── VideoUploadModal.vue  # 编排层：状态机 + 三区布局，不再碰上传细节
│   ├── UploadZone.vue        # 拖拽/选择 + 预检结果 + 进度/速度 + 取消 + 续传入口
│   ├── VideoMetaForm.vue     # 纯表单（标题/描述/节点/标签/VIP/发布策略）
│   └── PosterField.vue       # 封面：自动帧50 预览 | 自定义上传 | 手动URL
```

**UploadZone 交互**（核心改版点）：
- 拖拽/点击选择 → 立即预检（扩展名白名单、大小分级：`<100MB 任意模式` / `100MB–2GB 建议直传` / `>2GB 仅切片直传`、m3u8 拒绝文件上传仅收 URL）
- 上传中：真实进度 + 速度 + 当前阶段文案（取凭证/预热/传分片 x/y/缝合）
- **取消按钮**：AbortController 中止所有在途请求；已传分片留在节点 temp_chunks（同名同大小文件再选自动续传）
- 完成后：`<video>` 试播 + 封面预览 + 自动回填 `{videoUrl, posterUrl, storageNodeId}` 到表单

**提交语义**：`上传并发布`（完整流程）/ `保存到任务队列`（未上传也能占位，同现状）。

### 3.3 后端契约调整

**① 凭证 scope 化（替代 P1-2 的 HMAC 直发）**

`POST /api/v1/admin/videos/upload-ticket`
- 入参扩展：`{ nodeId?, filename, size, mimeType }`
- 返回扩展：
```jsonc
{
  "data": {
    "uploadId": "up_<hex>",              // 主控签发，不再由前端自造（修 P1-3）
    "storageNodeId": "node-01",
    "storageNodeName": "…",
    "baseUrl": "https://node…",
    "chunkUploadUrl": "…/upload-chunk",
    "mergeUrl": "…/merge-chunks",
    "headers": { "X-Cluster-Timestamp": "", "X-Cluster-Nonce": "", "X-Cluster-Signature": "", "X-Cluster-Scope": "up_<hex>" },
    "expiresIn": 1800,                    // 30min，短 TTL
    "capability": {                       // 能力协商（老节点自动降级）
      "chunk": true,
      "maxSingleSize": 2147483648,
      "chunkSize": 5242880,
      "maxConcurrency": 8
    }
  }
}
```
- 下发前探活：节点 status 探测失败 → 自动换默认节点 / 返回 503「节点不可用」（修 P1-7）

`storage-node/src/auth.js` 升级（向后兼容）：
- 签名串加入 scope：`payloadStr = JSON.stringify({ nodeId, timestamp, scope })`；`X-Cluster-Scope` 存在时校验，且**校验 scope 与请求 uploadId/路径匹配**（upload-chunk/merge/check-chunks 必须携带同名 uploadId；storage/delete 等管理接口拒绝带 scope 的凭证 → 浏览器凭证无法重放到删除/清理接口）
- 无 scope 的旧调用（server-to-server）走原逻辑，老节点不升级也不影响前端（能力协商关闭切片即可）

**② 中转模式改流式（修 P1-1）**

`POST /api/v1/admin/videos/upload`：`multer.memoryStorage` → `diskStorage` 或 `req.pipe` 流式转发（主控不缓冲整文件），返回结构与直传一致（含 storageNodeId/posterUrl）。

**③ 封面统一（修 P1-6）**

新增 `POST /api/v1/storage/upload-poster`（multipart，cluster 鉴权）；主控 `POST /api/v1/admin/upload-poster` 透传或直连。前端 `PosterField` 不再用 base64。老接口 `/api/v1/upload` 保留兼容（不再被新前端调用）。

**④ 上传配置一次性下发（修 P1-8）**

`GET /api/v1/admin/upload-config` 扩展返回：`{ enableDirectUpload, chunkConcurrency, maxSingleSize, chunkSize }`（读 settings + 默认节点能力），前端启动时拉一次，删除弹窗内临时 fetch settings 的逻辑。

**⑤ 任务队列分页筛选（修 P2-3）**

`GET /api/v1/admin/upload-tasks?status=&keyword=&limit=&offset=`（向后兼容：不带参数返回全量）。

### 3.4 状态机与失败恢复

```
IDLE ──select──▶ FETCHING_TICKET ──▶ PREPARING(预热/断点检测) ──▶ UPLOADING
                                                                    │ 用户取消 → CANCELED（分片保留，可续传）
                                                                    │ 分片重试3次失败 → ERROR（已传分片保留，可续传）
                                                                    ▼
                                                              MERGING（幂等重试2次）
                                                                    ▼
                                                                  DONE → 回填表单
```
- 断点续传只对"同一浏览器 + 同文件（name+size+lastModified）"生效，语义与现状一致但通过主控签发的 uploadId 恢复（修 P1-3 冲突：uploadId 每次会话新签，续传由服务端返回历史 uploadId 实现）。

### 3.5 实施路线

| 阶段 | 内容 | 涉及 | 工作量 |
| --- | --- | --- | --- |
| **A. 修 P0** | fieldName bug、重复调用、mojibake、进度文案错位 | admin 2 文件 | ~0.5 天 |
| **B. 引擎重构 + 安全收敛** | uploadService 状态机、组件拆分、预检、取消/续传、ticket scope 化、中转流式化、封面去 base64、能力协商 | admin + server + storage-node | ~2.5 天 |
| **B+. 异步后台发布**（§3.7） | uploadQueue 单例、status 扩展 UPLOADING/FAILED、upload-complete/failed/retry 接口、空 URL 占位去除、队列 UI | admin + server | ~1.5 天 |
| **C. 体验增强** | 上传后试播预览、节点健康探测与自动切换、队列分页筛选、配置一次下发 | admin + server | ~1 天 |

建议顺序：**A 独立先行**（可随下一个 patch 发版）；**B+ 异步后台发布优先于 B/C**（当前需求核心，随下一个 minor 发版，storage-node 双端发版）。

### 3.7 异步后台发布（需求 v1.1 核心变更）

> 诉求：**每个上传视频任务都可以直接发布**——先入队列占位、后台上传，而不是上传完才能点发布。
> 现状矛盾：发布动作强依赖 `form.videoUrl` 已存在（`handleSubmit` 直接拦截空 URL）。

#### 3.7.1 流程反转

```
现状：  选文件 → 上传完(阻塞) → 填信息 → 发布
目标：  建任务(占位) → 填信息+选文件 → 【直接发布】→ video 以 UPLOADING 入库(C端不可见)
        → 后台上传队列逐个上传 → 完成回填 URL → 自动流转 PUBLISHED / SCHEDULED
        → 失败 → FAILED(可重选文件断点续传/取消)
```

#### 3.7.2 状态模型

`videos.status` 扩展为 4 值（C 端查询 `WHERE status='PUBLISHED'`，UPLOADING/FAILED 天然不可见，无需改 C 端）：

| status | 含义 | 可见性 |
| --- | --- | --- |
| `UPLOADING` | 已发布意图，文件后台传输中 | C 端不可见 |
| `PUBLISHED` | 已上线 | C 端可见 |
| `SCHEDULED` | 定时（publishAt 到点自动转 PUBLISHED，现有清扫任务已支持） | C 端不可见 |
| `FAILED` | 上传失败/中断（可重试或取消） | C 端不可见 |

DB 调整：
- `addVideo` 放行 `UPLOADING`/`FAILED`（现逻辑非 SCHEDULED 一律 PUBLISHED）；
- **删除空 URL 兜底占位**（现 `data.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4'`——这个占位会真的流到 C 端，必须去掉）；UPLOADING 记录 `videoUrl=''`（列保持 NOT NULL，不迁移）。

#### 3.7.3 后端新增接口（admin 鉴权）

| 接口 | 说明 |
| --- | --- |
| `POST /admin/videos` | 扩展：`status='UPLOADING'` 且 `videoUrl=''` 时允许创建（现仅 PUBLISHED/SCHEDULED） |
| `POST /admin/videos/:id/upload-complete` | body `{videoUrl, posterUrl, storageNodeId}`；回填并流转：publishAt 未来 → `SCHEDULED`，否则 → `PUBLISHED`；同时把关联 upload_task 置 completed |
| `POST /admin/videos/:id/upload-failed` | body `{message}`；status → `FAILED` |
| `POST /admin/videos/:id/upload-retry` | FAILED → `UPLOADING`（重新选择文件后重试） |
| 定时清扫 | 现有 30s 清扫任务扩展：`UPLOADING` 超过 6h → `FAILED`（防刷新后永久悬挂） |

upload_task 与 video 的关联已具备（`upload_tasks.videoId` 列已存在）。

#### 3.7.4 前端：上传队列管理器（核心）

- 新建 `src/services/uploadQueue.js`：**模块级单例**，生命周期挂在 `AdminLayout`（不随弹窗关闭销毁），刷新后重建。
- 单飞模型：同一时刻只传一个文件，其余排队（避免并发打满节点）；队列项 = `{ taskId, videoId, file, nodeId, session }`。
- 弹窗提交：有文件无 URL → `POST /admin/videos`(UPLOADING) → 入队即关弹窗；有 URL → 走现状直接发布。
- 上传完成 → 调 `upload-complete` → 列表轮询/事件刷新状态；失败 → `upload-failed` + 队列 UI 显示重试/取消。
- 队列 UI 常驻 VideosView 顶部：`上传中 x%（进度/速度/阶段）` / `排队中` / `失败（重选文件续传）`。
- **中断恢复**：刷新/关页后 File 对象丢失 → 服务器 6h 清扫标 FAILED；用户重新选择同一文件 → `check-chunks` 命中已传分片直接续传（现有断点续传能力）。IndexedDB 存大文件双份磁盘不划算，不做。

#### 3.7.5 交互语义

- 弹窗提交按钮：`直接发布`（有文件→UPLOADING 后台上传；有 URL→立即 PUBLISHED/SCHEDULED）；`保存到任务队列`（仅占位，无文件无 URL）。
- 预检（§3.2）在入队前执行，分级提示照旧。

#### 3.7.6 落地记录（2026-08-14，v1.1 已实施部分）

- 后端：`videos.status` 支持 `UPLOADING`/`FAILED`（addVideo/updateVideo 放行，删除空 URL 占位视频兜底）；新增 `upload-complete`/`upload-failed`/`upload-retry`；6h 超时清扫；videos 表补 `updatedAt` 列；孤儿清理引用收集改用 `includeScheduled: true`（顺带修复 SCHEDULED 视频文件 24h 后被误删的存量 bug）
- 后端：`POST /admin/videos/upload` 改为**流式透传**（req.pipe → 存储节点，主控零落盘零内存），nodeId 走 query/`X-Target-Node` 头；移除 multer memoryStorage 2GB 缓冲
- 前端：新增 `src/services/uploadQueue.js`（模块级单例，单飞队列，AbortController 取消，失败/取消上报，断点续传复用）；`VideoUploadModal` 改为选文件暂存（预检：扩展名白名单/大小分级/m3u8 拒绝），发布后入队后台传输，移除组件内联上传与 `fieldName` bug（P0-1 随重构消除）；`VideosView` 新增后台传输队列卡片 + 视频行 `UPLOADING`/`FAILED` 状态、取消任务联动删除未发布视频、修复 `resetFormForQueue` 乱码（P0-2）
- 待办：队列分页筛选、封面上传去 base64（见 `doc/TODO.md`）

### 3.6 API 变更清单（需同步 `doc/api/admin.md` + `doc/api_specification.md`）

- `POST /admin/videos/upload-ticket`：入参 + filename/size/mimeType；出参 + uploadId/expiresIn/capability；新增探活
- `POST /admin/videos/upload`：实现改流式（契约不变，仍是 multipart video + nodeId）
- `POST /admin/upload-poster`：**新增**
- `GET /admin/upload-config`：出参扩展
- `GET /admin/upload-tasks`：新增 status/keyword/limit/offset 查询参数
- `storage-node`：auth.js 支持 `X-Cluster-Scope`；`POST /storage/upload-poster` 新增；其余不动
- 删除（前端不再调用）：`/api/v1/upload`（base64 封面路径，保留服务端兼容）

---

## 四、风险与兼容性说明

- 老 storage-node（未升级）：`capability.chunk=false` → 前端自动走直传单文件或中转；凭证无 scope 字段 → 安全收敛在升级后生效。
- CF 100MB 限制：B 阶段后中转模式仅作为小文件兜底，大文件强制直传（UI 预检阶段直接拦截并引导）。
- uploadId 由主控签发后，storage-node 的 `sanitizeUploadId` 校验无需改动（仍是 `[A-Za-z0-9_-]{1,64}`）。
