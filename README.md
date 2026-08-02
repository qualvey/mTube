# StreamVIP (mTube) - 独家超清视频流与付费墙系统

[![Vue 3](https://img.shields.io/badge/Vue-3.x-4fc08d.svg?style=flat-square&logo=vuedotjs)](https://vuejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3.x-003b57.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8.svg?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed.svg?style=flat-square&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

StreamVIP（内部代号 `mTube`）是一套采用 **Monorepo 单仓库架构** 与 **控制面与存储面解耦多节点集群架构** 构建的高性能移动端视频流平台及变现付费墙系统。

系统专为自建视频资源与高并发变现场景设计，支持主流 MP4/HLS(.m3u8) 视频流畅播放、自适应横竖屏、第 50 帧封面自动提取、雪碧图预览、支付宝 RSA2 网页支付、USDT 链上支付以及分布式多存储节点扩展。

---

## ✨ 核心特性

### 🎬 C 端极速播放体验 (`packages/client`)
- **横竖屏动态自适应**：自动监听视频元数据（`loadedmetadata`），按真实宽高比（16:9 / 9:16）自动调整画面，彻底解决竖屏短视频裁剪截断问题。
- **内存流式缓冲播放**：支持通过后端代理安全拉取视频流，注入自定义 Referer / User-Agent 请求头并写入 ArrayBuffer / Blob。
- **拖拽进度条雪碧图预览**：支持 Surrit 动态 Seek Hover 帧预览（10x10 网格切片计算）。
- **VIP 试看与付费墙倒计时**：支持针对 VIP 独家视频设定试看限制（如 120 秒），试看超时自动暂停并弹窗锁屏引导开通。

### ⚙️ B 端管理控制台 (`packages/admin`)
- **多存储节点集群管理**：可视化管理所有分布式存储节点（查看节点 ID、Base URL、连通性状态 `🟢 在线` / `🔴 离线` 及已存视频数）。
- **一键节点配置**：支持 **【+ 注册新存储节点】**、**【设为默认上传节点】**、**【刷新连通性】** 及 **【注销节点】**。
- **发布与上传透传**：发布/编辑视频时可下拉选择目标归属存储节点，上传视频时自动推送至指定服务器。
- **可视化日志与设备管理**：支持全站 PV/UV 访问日志追踪、设备 VIP 手动开通/赠送/取消，以及支付宝 RSA2 / USDT 钱包配置。

### 🛡️ 主站后端控制面 (`packages/server`)
- **控制面与存储面彻底解耦**：主站仅保存数据库与业务逻辑，大容量视频文件全量存放于分布式存储节点，主站本地物理磁盘零开销。
- **第 50 帧封面自动抽取**：未提供封面时，自动通过 FFmpeg 捕获视频的第 50 帧（`select=eq(n\,49)`）作为高质 Poster 图片。
- **双引擎变现支付系统**：
  - 支付宝 WAP 网页支付（内置 Node.js 原生 RSA2 签名与回调验签算法）。
  - USDT 链上支付（独创微毫小数自动偏移碰撞校验算法）。

### 📦 分布式存储节点 (`packages/storage-node`)
- **独立运行与极轻量**：独立运行于异地存储服务器（`3001` 或自定义端口），提供 HTTP Range 断点续传与拖拽 Seeking。
- **Docker 极速部署**：提供 Dockerfile 与独立的 Docker Compose 编排，2 分钟即可在新服务器完成节点上线。

---

## 🏗️ Monorepo 目录结构

系统基于 `pnpm workspace` 统一管理：

```text
mobile-paywall/
├── .github/
│   └── workflows/
│       └── deploy.yml            # CI/CD 路径感知增量打包与 GHCR 镜像推送
├── doc/
│   ├── storage_expansion_phase1_plan.md  # 存储架构扩展第一阶段计划
│   └── admin_optimization_plan.md         # 后台优化实施方案
├── packages/
│   ├── client/                   # [C端] Vue 3 移动端极速视频流主站 (Port 5173 / Nginx)
│   ├── admin/                    # [B端] Vue 3 Element Plus 管理控制台 (Port 5174 / Nginx)
│   ├── server/                   # [主站 API] Express 控制面与 SQLite 数据库 (Port 3000)
│   └── storage-node/             # [存储节点] 独立媒体文件存储与 50 帧抽帧服务 (Port 3001+)
├── docker-compose.yml            # 主站 (Server, Client, Admin) 一键编排
├── pnpm-workspace.yaml           # Monorepo 工作区定义
└── package.json                  # 全局依赖与脚本
```

---

## 🛠️ 技术栈

| 模块 | 核心技术/框架 |
| :--- | :--- |
| **前端 C端/B端** | Vue 3 (Composition API, `<script setup>`), Vite, Tailwind CSS, Element Plus, Plyr |
| **主站 API 服务** | Node.js (ES Module), Express, Better-SQLite3, FFmpeg, Ytdl-Core |
| **存储节点服务** | Node.js, Express, Multer, FFmpeg |
| **包管理 & 部署** | pnpm Workspaces, Docker, Docker Compose, GitHub Actions, GHCR |

---

## 🚀 本地开发快速开始

### 1. 环境准备
- Node.js >= 18.0.0
- pnpm >= 9.0.0
- 本地系统需安装 [FFmpeg](https://ffmpeg.org/)（用于第 50 帧封面生成）

### 2. 安装依赖
在项目根目录运行：
```bash
pnpm install
```

### 3. 一键启动全量服务 (Parallel Run)
```bash
pnpm dev
```
此命令将并行启动所有服务：
- 📱 **C 端主站**：`http://localhost:5173`
- ⚙️ **B 端管理后台**：`http://localhost:5174`
- 🚀 **主站 API**：`http://localhost:3000`
- 📦 **存储节点 01**：`http://localhost:3001`

也可以单独启动指定模块：
```bash
pnpm dev:client   # 仅启动 C端
pnpm dev:admin    # 仅启动 B端
pnpm dev:server   # 仅启动主站 API
```

---

## 🐳 生产环境部署最佳实践

按照生产环境最佳实践，**代码统一在 Monorepo 管理**，镜像通过 CI/CD 打包发布至 GHCR，主站与存储节点按需拉取。

### 1. 主站服务器部署 (Server + Client + Admin)

使用根目录的 [docker-compose.yml](file:///c:/Users/Ryu/Documents/mobile-paywall/mobile-paywall/docker-compose.yml)：

```bash
# 启动主站控制面服务
docker compose up -d
```

### 2. 异地存储节点部署 (Storage Node 01, Node 02...)

在任何新的独立存储服务器（VPS/物理机）上，使用 [packages/storage-node/docker-compose.yml](file:///c:/Users/Ryu/Documents/mobile-paywall/mobile-paywall/packages/storage-node/docker-compose.yml) 部署：

```bash
# 下载存储节点编排文件
curl -fsSL https://raw.githubusercontent.com/qualvey/mTube/main/packages/storage-node/docker-compose.yml -o docker-compose.yml

# 启动存储节点 (通过环境变量指定节点信息与硬盘挂载目录)
PORT=3002 \
NODE_ID=node-02 \
NODE_NAME="香港存储节点 02" \
STORAGE_DATA_PATH=/var/storage/uploads \
docker compose up -d
```

启动完成后，在 **B 端管理后台 -> ⚙️ 系统设置 -> 多存储节点管理** 中点击 **【+ 注册新存储节点】**，输入 `node-02` 及 `http://<服务器IP>:3002` 即可上线！

### 3. GitHub Actions CI/CD 增量部署
项目内置 `.github/workflows/deploy.yml`，每次提交到 `main` 分支时：
- 精准识别改动路径（Path Filter），**仅构建修改过的模块镜像**并推送到 GHCR。
- 主站服务器自动拉取最新的 `server` / `client` / `admin` 镜像完成无缝更新。

---

## 📝 常用管理命令

```bash
# 全局代码打包检查
pnpm build

# 单独打包管理后台
pnpm build:admin

# 单独打包 C 端
pnpm build:client
```

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 许可证。
