FROM node:22-alpine AS base

# Build version metadata (injected by CI): docker build --build-arg GIT_SHA=<sha>
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev curl

WORKDIR /app

# Enable Corepack & pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate


# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/

# Install server dependencies
RUN pnpm install --frozen-lockfile --filter server...

# Copy server source code
COPY packages/server ./packages/server

WORKDIR /app/packages/server

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
