# ---------- Build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# OpenSSL is required by Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# openssl for Prisma; curl for the container HEALTHCHECK; postgresql-client for backups.
RUN apt-get update && apt-get install -y --no-install-recommends       openssl ca-certificates curl postgresql-client     && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY scripts ./scripts

# Run as the unprivileged node user.
USER node

EXPOSE 4000

# Container-level health check hits the readiness probe (DB + Redis).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD curl -fsS http://localhost:4000/health/ready || exit 1

# Apply migrations on boot, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
