# ==============================================================================
# StreamVIP (mTube) Server — 多阶段构建瘦身版
#
# 背景：原单阶段镜像 900MB（为编译 better-sqlite3 装了 python3/make/g++/sqlite-dev，
#       且该依赖在 src 中 0 引用，已移除）。
# 现在：server 仅用 Node 22 内置 node:sqlite + 纯 JS 依赖（ytdl-core 等），
#       运行镜像只需 node_modules + 源码，目标 ~120-150MB。
# ==============================================================================

# ---------- Stage 1: Builder（安装依赖，含编译工具仅构建期需要） ----------
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# 仅复制依赖清单，充分利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/

# 安装生产依赖（--prod 排除 devDependencies）
RUN pnpm install --frozen-lockfile --filter server --prod

# ---------- Stage 2: Runtime（精简运行镜像） ----------
FROM node:22-alpine

# Build version metadata (injected by CI): docker build --build-arg GIT_SHA=<sha>
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

# 从 builder 复制 node_modules（pnpm 结构：根 .pnpm + 各包软链）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

# 复制 server 源码（排除测试与数据）
COPY packages/server/package.json ./packages/server/
COPY packages/server/src ./packages/server/src

WORKDIR /app/packages/server

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
