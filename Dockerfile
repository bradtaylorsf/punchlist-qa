# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Install build tools, build better-sqlite3 native addon, then remove tools in one layer
COPY package.json pnpm-lock.yaml ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && pnpm install --frozen-lockfile --prod \
  && apk del .build-deps

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/skills ./skills

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Non-root user
RUN addgroup -g 1001 punchlist && adduser -u 1001 -G punchlist -s /bin/sh -D punchlist
RUN mkdir -p /data/.punchlist && chown -R punchlist:punchlist /data
USER punchlist

ENV NODE_ENV=production
ENV PUNCHLIST_DATA_DIR=/data/.punchlist
ENV HOST=0.0.0.0
ENV PORT=4747

VOLUME /data/.punchlist
EXPOSE 4747

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider --quiet http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "bin/punchlist.mjs", "serve"]
