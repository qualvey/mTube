# Stage 1: Build Vue 3 Client Application
FROM node:22-alpine AS builder


WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate


# Copy monorepo configurations & client files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/client/package.json ./packages/client/

# Install client build dependencies
RUN pnpm install --frozen-lockfile --filter client...

COPY packages/client ./packages/client

# Build version metadata (injected by CI): docker build --build-arg GIT_SHA=<sha> --build-arg BUILD_TIME=<iso>
# vite define 在构建时将其编译进产物，供 versionService 对比 /api/v1/version
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
ARG BUILD_TIME=
ENV BUILD_TIME=$BUILD_TIME

# Build client production bundle
RUN pnpm --filter client build

# Stage 2: Production Nginx Server
FROM nginx:alpine

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
