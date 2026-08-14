# C 端播放器 Overlay 横屏比例问题 — 排查与修复笔记

> 日期：2026-08-05
> 提出人：老板（PM）｜ 修复：锐（高级程序员）
> 涉及模块：`packages/client`（C 端播放器）、部署缓存链路（nginx + Cloudflare）

---

## 1. 问题现象（需求原文）

老板在 `plan.md` 末尾追加（工作区未提交，接手人注意保留该文件改动）：

> 非预期行为。
> 在封面已加载 -> 触发激活 -> 拉流成功并渲染。
> 这个过程中，中间的 overlay 展示的时候会恢复横屏比例。
> 请让 overlay 跟随容器的大小。

同时追加了三条相关需求（已确认均已实现，勿重复开发）：
1. 容器适配封面比例（竖屏视频 card 拉长）
2. 优化封面加载速度（页面加载完所有 card 封面准备好，至少视口下 10 个预渲染）
3. 分页 + 前端按需拉取（后端 video 接口分页）

---

## 2. 排查思路与过程

### 2.1 入口定位
- `git status` 发现 `plan.md` 为 **M 状态（老板本地改动，未提交）**，`git diff plan.md` 拿到需求原文——**这是第一线索，先看文档改动再动代码**。
- 现象属于 C 端播放器 UI，锁定组件：
  - `packages/client/src/components/VideoCard.vue` —— 卡片容器（视频区 `min-h-[220px]`）
  - `packages/client/src/components/MemoryVideoPlayer.vue` —— 播放器核心
  - `packages/client/src/components/VideoFeed.vue` —— 列表/分页/封面预加载

### 2.2 根因定位（代码层）
`MemoryVideoPlayer.vue` 的容器：

```html
<div class="relative w-full h-full ... max-h-[75vh]"
     :style="{ aspectRatio: videoAspectRatio }">
```

- `videoAspectRatio` 默认 `'16 / 9'`；三个写入点：
  1. `handlePosterLoad()` —— 封面加载完，按封面宽高比设置（**有 `if (hasStarted.value) return` guard**）
  2. `loadVideoToMemory()` —— 激活拉流时**强制重置 `'16 / 9'` + `isPortrait=false`** ← **主根因**
  3. `handleLoadedMetadata()` —— 视频元数据到达，设为真实比例

**完整错误链路**（竖屏视频）：
```
封面加载 → 容器按 9:16 竖屏拉长
  → 点击激活 → loadVideoToMemory() 把容器重置为 16:9 横屏
  → loading overlay（absolute inset-0）显示在横屏容器里 →「overlay 恢复横屏比例」
  → loadedmetadata 到达 → 容器又跳回竖屏
```
overlay 本身都是 `inset-0`（跟随容器），**「overlay 横屏」的本质是「容器横屏」**。

**首视频特例**：`onMounted` 时首视频立即 `active=true → loadVideoToMemory()`，此时 poster 可能尚未加载完；等 poster 加载完时 `hasStarted=true`，被 guard 拦截 → 首视频封面比例永远不生效。

### 2.3 修复后老板二次报告 → 第二层根因（缓存层）
代码修复已部署（client 容器已重启），但老板仍看到旧行为。

排查发现：
- `packages/client/nginx.conf`（admin 同款）的 `location /`（SPA 入口 index.html）**没有任何 Cache-Control 头**
- 静态资源（带 hash 的 JS/CSS）配了 `expires 30d`，安全
- **index.html 被 Cloudflare/浏览器缓存 → 用户一直加载旧版 JS → 修复看不见**

验证手段：
- `curl -I https://91cso.com/` → 部署前无 `Cache-Control` 头
- `cf-cache-status: HIT`（缓存命中）说明 CF 缓存了 HTML

---

## 3. 根因总结

| 层 | 根因 | 后果 |
|---|---|---|
| 代码 | `loadVideoToMemory()` 激活时强制重置 `aspectRatio='16 / 9'` | overlay/容器跳回横屏 |
| 代码 | `handlePosterLoad` 的 `hasStarted` guard | 首视频封面比例丢失 |
| 缓存 | SPA index.html 无 no-cache 头 | CDN/浏览器缓存旧 JS，修复不生效 |

---

## 4. 修复方案（commit 清单）

| commit | 内容 |
|---|---|
| `2b67e57` | `MemoryVideoPlayer.vue`：激活时**不再重置 aspectRatio**（保留封面比例直到视频元数据）；`handlePosterLoad` **删除 hasStarted guard**（poster 比例始终生效，loadedmetadata 再覆盖为真实比例） |
| `151206a` | `client/nginx.conf` + `admin/nginx.conf`：`location /` 加 `Cache-Control: no-cache, no-store, must-revalidate`（带 hash 静态资源 30d 缓存保留） |

同轮附带修复（非本问题，但同批部署）：
- `4fe02cb`：公开接口 `/api/v1/settings` 白名单过滤（原来返回全量 settings，**泄露支付宝私钥等敏感配置**）；直传失败降级时提示原因；并发数保存前 clamp 2-8

---

## 5. 验证方法

- 构建：`pnpm build:client` / `pnpm build:admin`（EXIT=0）
- 缓存头（生产）：`curl -sI https://91cso.com/`
  - 期望：`Cache-Control: no-cache, no-store, must-revalidate` + `cf-cache-status: DYNAMIC`
- 新产物：`curl -s https://91cso.com/ | grep assets/index-`（hash 每次构建变化）
- 容器状态：`ssh 91 "docker ps"`（client/admin 重启时间应为最近一次部署）
- 实测：浏览器打开竖屏视频 → 点击播放 → loading 遮罩期间容器高度不应变化；播放后 9:16 全屏渲染

---

## 6. 部署链路（接手人必读）

- **代码推送即部署**：`git push origin main` → GitHub Actions `.github/workflows/deploy.yml`（push 触发、路径感知）构建 GHCR 镜像 → 自动 SSH 部署主站 91（server/client/admin）
- **存储节点 vultr 不自动部署**：`deploy-storage-node.yml` 是手动 dispatch（需 gh CLI/token），当前做法是手动 SSH：
  ```
  ssh vultr 'sudo bash -c "cd /opt/storage_node && docker compose pull && docker compose up -d"'
  ```
- SSH 别名（`~/.ssh/config`）：`91` = 203.0.113.1 (root) 主站；`vultr` = 203.0.113.2 (linuxuser) 存储节点
- 环境坑（都踩过）：
  - **91 SSH 不稳定**（banner exchange 超时/被 kill）→ 重试或稍等；命令复杂时用「本地写脚本 → scp → ssh 执行」方式，避免 PowerShell→ssh→zsh 多层引号地狱
  - **vultr 默认 shell 是 zsh**、目录 `/opt/storage_node` 权限 0711（`ls` 看不到内容但可 cd）、`sudo` 会重置 cwd → 一律 `sudo bash -c "cd /opt/storage_node && ..."` 或脚本文件
  - 生产 CLUSTER_SECRET 未配置（两端都用默认值 `<CLUSTER_SECRET>`）——**建议尽快配置强密钥**（主站 .env 与节点 .env 同步，两端同时重启）
  - 域名：`91cso.com` / `www.91cso.com` 走 Cloudflare；`node01.91cso.com` 直连 vultr
  - admin 生产登录账号：`heiha`（密码在 91 的 `/root/mobile-paywall/.env`）

---

## 7. 遗留事项

- `plan.md` 老板追加的需求/非预期行为描述**仍在工作区未提交**（M 状态）——等老板确认后提交，接手人勿丢
- 无 poster 的视频：容器保持默认 16:9 直到 loadedmetadata（设计如此）
- `max-h-[75vh]` 会打破极竖屏的精确比例（防超出屏幕，可接受）
- 需求 1-3 已确认实现：poster 比例适配（`aspectRatio`）、封面预加载（`VideoFeed.preloadPosters`，每页 10 个）、分页+无限滚动（`/api/v1/videos?page&limit` + IntersectionObserver，rootMargin 300px 预取）
