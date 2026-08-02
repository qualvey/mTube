FROM node:22-alpine AS base

# Install FFmpeg for 50th frame poster extraction
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Enable Corepack & pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/storage-node/package.json ./packages/storage-node/

# Install storage-node dependencies
RUN pnpm install --filter storage-node...

# Copy storage-node source code
COPY packages/storage-node ./packages/storage-node

WORKDIR /app/packages/storage-node

# Create uploads directory for persistent storage
RUN mkdir -p public/uploads/videos public/uploads/posters

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV NODE_ID=node-02
ENV NODE_NAME="Storage Node 02"

CMD ["node", "src/index.js"]
