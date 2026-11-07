# Multi-stage Dockerfile for Zalo Bot-as-a-Service (BaaS)
FROM node:22-alpine AS base

# Install pnpm
RUN npm install -g pnpm@12.18.0

WORKDIR /app

# Copy dependency definitions
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json ./apps/portal/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/agent/package.json ./apps/agent/
COPY apps/control-api/package.json ./apps/control-api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/zalo-bot-sdk/package.json ./packages/zalo-bot-sdk/
COPY packages/llm/package.json ./packages/llm/
COPY packages/rag/package.json ./packages/rag/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build Control API and Portal
RUN cd apps/control-api && npx tsc
RUN cd apps/portal && npx next build

# Expose port (defaults to 3000, compatible with $PORT)
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 3000

# Docker Healthcheck
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start unified server
CMD ["node", "server.js"]

