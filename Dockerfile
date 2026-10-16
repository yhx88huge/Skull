# ---------- build stage (npm workspaces) ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci

COPY . .
# builds the browser bundle into apps/client/dist
RUN npm run build

# ---------- server (runs from TypeScript sources via tsx) ----------
FROM node:24-alpine AS server
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/healthz || exit 1
CMD ["npx", "tsx", "apps/server/src/index.ts"]

# ---------- web (static frontend + websocket proxy) ----------
FROM nginx:alpine AS web
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
