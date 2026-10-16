#!/usr/bin/env bash
# 在华为云 ECS（Linux）上构建并启动 Skull。
#
# 前提：代码已放到服务器上（git clone 或 scp 上传均可）。
# 用法：以 root 执行   bash scripts/ecs-bootstrap.sh [对外端口]
#   例：bash scripts/ecs-bootstrap.sh 8080
set -euo pipefail

PORT="${1:-8080}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

log() { printf '\n==> %s\n' "$*"; }

# ---------- 1. Docker 引擎 ----------
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 Docker，开始安装"
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y dnf-plugins-core curl ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    yum install -y yum-utils curl ca-certificates
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y curl ca-certificates
  else
    echo "无法识别的包管理器，请手动安装 Docker 后重试" >&2; exit 1
  fi
  # 走阿里云镜像源，国内 ECS 下载更快
  curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
  systemctl enable --now docker
fi
docker --version

# ---------- 2. Compose 插件 ----------
if ! docker compose version >/dev/null 2>&1; then
  log "安装 docker compose 插件"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y docker-compose-plugin
  else
    (dnf install -y docker-compose-plugin 2>/dev/null || yum install -y docker-compose-plugin)
  fi
fi
docker compose version

# ---------- 3. 构建 ----------
log "构建镜像（首次约 3-8 分钟）"
WEB_PORT="$PORT" docker compose build

# ---------- 4. 启动 ----------
log "启动服务（对外端口 ${PORT}）"
WEB_PORT="$PORT" docker compose up -d

# ---------- 5. 自检 ----------
log "等待服务就绪"
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo
echo "--- 健康检查 ---"
curl -fsS "http://127.0.0.1:${PORT}/healthz" && echo "  <- 服务端 OK"
echo "--- 前端首页 ---"
printf 'HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/")"
echo "--- WebSocket 握手 ---"
curl -fsS "http://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=polling" | head -c 80
echo

echo
log "完成"
echo "容器内地址： http://127.0.0.1:${PORT}"
echo "外网访问：   http://<ECS 公网 IP>:${PORT}"
echo "内网 IP：    $(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "【必做】到华为云控制台 -> 安全组，放行 TCP ${PORT} 端口，否则外网连不上。"
echo "【注意】中国大陆节点的 80/443 需要已备案域名才能对外访问，所以默认用 ${PORT}。"
echo
echo "常用命令（需在同一目录执行）："
echo "  WEB_PORT=${PORT} docker compose logs -f        # 看日志"
echo "  WEB_PORT=${PORT} docker compose ps             # 看状态"
echo "  WEB_PORT=${PORT} docker compose restart        # 重启"
echo "  WEB_PORT=${PORT} docker compose down           # 停止"
