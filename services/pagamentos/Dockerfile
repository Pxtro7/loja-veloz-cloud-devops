# ============================================
# Stage 1: Build dependencies
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install --production && \
    npm cache clean --force

# ============================================
# Stage 2: Production image
# ============================================
FROM node:18-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

ENV NODE_ENV=production
ENV PORT=3002

USER nodejs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["node", "src/index.js"]
