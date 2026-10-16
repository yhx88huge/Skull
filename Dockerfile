# 多阶段构建（npm workspaces）。
# 说明：server 直接用 tsx 运行 TypeScript 源码，没有 tsc 编译产物这一步。

# ---------- build stage：安装依赖并产出前端静态包 ----------
# 用 Debian(glibc) 而非 alpine：vite/rollup/esbuild 的原生二进制在 musl 上容易出问题。
FROM node:24-bookworm AS build
WORKDIR /app

# .dockerignore 已排除 node_modules，这里拿到的是纯源码
COPY . .
RUN npm ci
# 产出 apps/client/dist
RUN npm run build

# ---------- server：运行服务端（tsx 跑源码） ----------
FROM node:24-bookworm-slim AS server
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

COPY --from=build /app ./
RUN mkdir -p /app/data

EXPOSE 3000

# 用 node 自带能力做健康检查，不依赖 wget/curl（slim 镜像里没有）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

# 不用 npx：容器里若解析不到会尝试联网下载，直接用本地二进制
CMD ["./node_modules/.bin/tsx", "apps/server/src/index.ts"]

# ---------- web：静态前端 + WebSocket 反代 ----------
FROM nginx:alpine AS web
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
