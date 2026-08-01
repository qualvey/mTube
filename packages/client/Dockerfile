# Stage 1: Build Vue 3 Client Application
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configurations & client files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/client/package.json ./packages/client/

# Install client build dependencies
RUN pnpm install --filter client...

COPY packages/client ./packages/client
COPY src ./src
COPY index.html vite.config.js ./

# Build client production bundle
RUN pnpm --filter client build

# Stage 2: Production Nginx Server
FROM nginx:alpine

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
