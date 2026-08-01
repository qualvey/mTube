FROM node:20-alpine AS base

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Enable Corepack & pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/

# Install server dependencies
RUN pnpm install --filter server...

# Copy server source code
COPY packages/server ./packages/server

WORKDIR /app/packages/server

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
