# StreamVIP 管理系统架构重构与优化实施计划文档

本文档制定了 StreamVIP 管理控制台（`packages/admin`）及对应后端 API（`packages/server`）的系统优化与架构升级实施路线图。

---

## 阶段一：前端模块化重构与 JWT 安全鉴权增强 (Phase 1)

### 1.1 目标与痛点解决
- **解决单文件代码过大**：将 `App.vue`（~1600 行）拆分为模块化 View 组件与 Layout 路由结构。
- **引入路由管理**：安装并配置 `vue-router`，支持导航联动、刷新状态保持及路由守卫。
- **增强后端接口安全**：引入 JWT (JSON Web Token) 鉴权中间件，彻底解决 API 无鉴权裸奔隐患。

### 1.2 实施步骤与新增/修改文件

#### 1. 前端（`packages/admin`）
- **安装依赖**：安装 `vue-router@4`
- **[NEW] `src/router/index.js`**：定义路由与路由守卫（未登录重定向至 `/login`）
- **[NEW] `src/layouts/AdminLayout.vue`**：抽出侧边栏、顶部 Header、时间同步与退出登录逻辑
- **[NEW] `src/views/LoginView.vue`**：抽出登录页面组件
- **[NEW] `src/views/DashboardView.vue`**：数据概览卡片与最新视频列表
- **[NEW] `src/views/AnalyticsView.vue`**：浏览数据趋势、热门榜单与 GeoIP 访问日志
- **[NEW] `src/views/VideosView.vue`**：视频流列表管理、状态切换、删除与过滤
- **[NEW] `src/components/VideoModal.vue`**：发布/编辑视频统一弹窗组件
- **[NEW] `src/views/PaywallView.vue`**：VIP 套餐定价设置
- **[NEW] `src/views/OrdersView.vue`**：订单流水与设备 VIP 手动控制
- **[NEW] `src/views/SettingsView.vue`**：系统公告、Hero 封面、支付与播放器全局配置
- **[NEW] `src/utils/api.js`**：统一 `fetch` 请求封装，自动携带 JWT Token，处理 401 自动跳转登录
- **[MODIFY] `src/App.vue`**：精简为顶层 `<router-view />` 挂载点
- **[MODIFY] `src/main.js`**：引入并注册 router

#### 2. 后端（`packages/server`）
- **[NEW] `src/middleware/auth.js`**：JWT 校验与管理员身份认证中间件
- **[MODIFY] `src/index.js`**：
  - 增加 `/api/v1/admin/auth/login` 生成 JWT Token
  - 在所有 `/api/v1/admin/*` 受保护接口挂载 Auth 中间件

---

## 阶段二：数据分析与 ECharts 可视化升级 (Phase 2 - 规划)
- 引入 ECharts 替换 CSS Flex 简易柱状图。
- 增加 PV/UV 多维度（营收、设备类型、转化率）对比分析。
- 增加订单 CSV 导出功能。

---

## 阶段三：视频管理与运维体验增强 (Phase 3 - 规划)
- 增加管理员视频在线播放/试播弹窗（验证防盗链 Referer/User-Agent）。
- 视频与订单支持后端分页与批量操作。
