FROM oven/bun:1.2.15 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.2.15 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.2.15-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
RUN mkdir -p /data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src ./src
COPY package.json index.html ./
EXPOSE 3000
VOLUME ["/data"]
CMD ["bun", "src/server/index.ts"]
