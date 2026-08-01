# Stage 1: Build Vue 3 Admin Application
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configurations & admin files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/admin/package.json ./packages/admin/

# Install admin build dependencies
RUN pnpm install --filter admin...

COPY packages/admin ./packages/admin

# Build admin production bundle
RUN pnpm --filter admin build

# Stage 2: Production Nginx Server
FROM nginx:alpine

COPY --from=builder /app/packages/admin/dist /usr/share/nginx/html
COPY packages/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
