# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/backend

# Install dependencies first (layer caching)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -S zedearn && adduser -S zedearn -G zedearn

WORKDIR /app

COPY --from=builder /app/backend ./

# Ensure the non-root user owns the app files
RUN chown -R zedearn:zedearn /app

USER zedearn

# Port exposed by the Express server (matches PORT env var)
EXPOSE 5001

# Health check: verify the /health endpoint is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5001/health || exit 1

ENV NODE_ENV=production

CMD ["node", "server.js"]
