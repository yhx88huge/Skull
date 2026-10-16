# Skull 游戏部署指南

## 华为云 ECS 部署方案

### 1. 环境准备

#### 1.1 ECS 规格建议

- **实例类型**: 通用型 s6 或计算型 c6
- **CPU**: 2 核以上
- **内存**: 4 GB 以上
- **系统**: Ubuntu 20.04/22.04 或 CentOS 7+
- **带宽**: 按需选择(建议 5Mbps 以上)

#### 1.2 安全组配置

开放以下端口:

- **8080**: 对外服务端口 (nginx,默认)
- **22**: SSH (管理)

> **中国大陆节点请注意**: 80 / 443 端口需要域名已完成 ICP 备案才能对外访问,
> 所以默认使用 **8080**。若你的域名已备案并解析到该 ECS,把对外端口改成 80 即可
> (`WEB_PORT=80 docker compose up -d`),此时安全组需放行 80。
>
> 服务端的 3000 端口只在容器网络内部 + 宿主机回环上监听,**不需要**在安全组放行。

### 2. 部署方式

#### 方式一: Docker Compose (推荐)

代码上传到 ECS(二选一):

```bash
# A. 从仓库克隆(需 ECS 能访问 GitHub)
ssh root@<ECS公网IP> 'git clone https://github.com/yhx88huge/Skull.git /opt/skull'

# B. 从本机打包上传(推荐,不受 GitHub 连通性影响)
#    在本机项目根目录执行(node_modules 与 .git 不打包)
tar --exclude=node_modules --exclude=.git --exclude=.workbuddy \
    -czf skull.tar.gz apps packages tools scripts \
    package.json package-lock.json .npmrc tsconfig.json \
    Dockerfile nginx.conf docker-compose.yml .dockerignore
scp skull.tar.gz root@<ECS公网IP>:/opt/
ssh root@<ECS公网IP> 'mkdir -p /opt/skull && tar -xzf /opt/skull.tar.gz -C /opt/skull'
```

在 ECS 上一键构建并启动(脚本会自动装 Docker 与 compose 插件、构建镜像、启动并自检):

```bash
ssh root@<ECS公网IP>
cd /opt/skull
bash scripts/ecs-bootstrap.sh 8080
```

也可以手动执行等价步骤:

```bash
# 1. 可选: 配置数据库,不配则用文件存储
cat > .env << EOF
# DATABASE_URL=postgresql://user:password@<RDS内网地址>:5432/skull
TURN_TIMER_SECONDS=60
CORS_ORIGIN=*
EOF

# 2. 构建两个镜像(首次约 3-8 分钟)
WEB_PORT=8080 docker compose build

# 3. 启动(两个容器: server=WebSocket 服务, web=前端静态站 + 反向代理)
WEB_PORT=8080 docker compose up -d

# 4. 查看日志
WEB_PORT=8080 docker compose logs -f
```

> 后续所有 `docker compose` 命令都要带上相同的 `WEB_PORT`,否则会重建容器并换端口。

镜像说明:

- `server`: 由 `Dockerfile` 的 `server` 阶段构建,直接以 `tsx` 运行 TypeScript 源码。
- `web`: 由 `web` 阶段构建,把 `apps/client/dist` 放进 nginx 容器,80 端口提供页面,并把    
  `/socket.io/` 与 `/healthz` 反向代理到 `server:3000`。
- 未配置 `DATABASE_URL` 时使用文件存储,数据落在 `skull-data` 卷的 `/app/data`。

#### 方式二: 直接运行

```bash
# 1. 安装 Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# 2. 安装 PostgreSQL (可选)
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createdb skull

# 3. 安装 PM2 (进程管理)
sudo npm install -g pm2

# 4. 配置环境变量
export DATABASE_URL=postgresql://user:password@localhost:5432/skull
export PORT=3000

# 5. 构建并启动(仓库使用 npm workspaces,不是 pnpm)
npm install
npm run build          # 构建前端到 apps/client/dist
npm run start          # 以 tsx 运行服务端

# 6. 使用 PM2 守护进程
pm2 start npx --name skull-server -- tsx apps/server/src/index.ts
pm2 save
```

### 3. 域名配置

#### 3.1 申请域名

在华为云域名服务注册域名,例如 `skull.example.com`

#### 3.2 DNS 解析

在华为云 DNS 控制台添加:

- 类型: A 记录
- 主机记录: @
- 值: ECS 公网 IP

#### 3.3 配置 HTTPS (可选)

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d skull.example.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 4. 监控与运维

#### 4.1 健康检查

```bash
# 从 ECS 宿主机(走 nginx 反代)
curl http://127.0.0.1:8080/healthz
# 返回: {"ok":true,"ts":...}

# 也可在容器网络内直连服务端
docker compose exec server wget -qO- http://127.0.0.1:3000/healthz
```

#### 4.2 日志查看

```bash
# Docker
docker-compose logs -f server

# PM2
pm2 logs skull-server
```

#### 4.3 备份策略

```bash
# PostgreSQL 备份
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### 5. 性能调优

#### 5.1 连接数限制

在 nginx.conf 中调整:

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
  worker_connections 4096;
  use epoll;
}
```

#### 5.2 内存优化

```bash
# 调整 swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 6. 故障排查

| 问题                        | 解决方案                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| 服务无法启动                    | 检查 `docker compose logs` 或 `pm2 logs`                                                          |
| 端口不通                      | 检查安全组是否放行对外端口(默认 8080);中国大陆节点用 80 还需域名已备案                                                |
| 数据库连接失败                   | 检查 DATABASE_URL 环境变量                                                                          |
| WebSocket 连接失败             | 检查 nginx 对 `/socket.io/` 的代理与 `Upgrade` 头配置                                                  |
| 构建时报 esbuild / rollup 原生模块错误 | 本机 `node_modules` 被复制进镜像覆盖了 Linux 版本 —— 确认 `.dockerignore` 存在且包含 `node_modules`               |
| 构建很慢或拉包失败                 | `package-lock.json` 与 `.npmrc` 都指向 npmmirror,国内 ECS 正常;若仍慢可临时改用官方源                            |
| 容器反复重启                    | `docker compose logs server`,常见原因是 `DATABASE_URL` 指向了不可达的 Postgres(置空即回落文件存储)                  |

### 7. 扩展建议

- **多实例部署**: 使用 Kubernetes 或 Docker Swarm
- **负载均衡**: 使用华为云 ELB
- **数据库托管**: 使用华为云 RDS
- **监控告警**: 使用华为云 APM
