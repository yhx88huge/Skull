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
- **80**: HTTP (nginx)
- **443**: HTTPS (nginx,可选)
- **3000**: 服务端端口(仅内网访问)
- **22**: SSH (管理)

### 2. 部署方式

#### 方式一: Docker Compose (推荐)

```bash
# 1. 安装 Docker
sudo apt update
sudo apt install docker.io docker-compose -y

# 2. 启用 Docker 服务
sudo systemctl enable docker
sudo systemctl start docker

# 3. 上传项目文件到 ECS
# 使用 scp 或 git clone
scp -r . user@your-ecs-ip:/app/skull

# 4. 创建环境变量文件
cat > .env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/skull
TURN_TIMER_SECONDS=60
RECONNECT_GRACE_MS=60000
CORS_ORIGIN=*
EOF

# 5. 启动服务
docker-compose up -d

# 6. 查看日志
docker-compose logs -f
```

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

# 5. 构建并启动
npm install
npm run build
npm run start

# 6. 使用 PM2 守护进程
pm2 start apps/server/dist/index.js --name skull-server
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
curl http://localhost:3000/healthz
# 返回: {"ok":true,"ts":...}
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

| 问题 | 解决方案 |
|------|----------|
| 服务无法启动 | 检查 `docker-compose logs` 或 `pm2 logs` |
| 端口不通 | 检查安全组配置 |
| 数据库连接失败 | 检查 DATABASE_URL 环境变量 |
| WebSocket 连接失败 | 检查 nginx 代理配置 |

### 7. 扩展建议

- **多实例部署**: 使用 Kubernetes 或 Docker Swarm
- **负载均衡**: 使用华为云 ELB
- **数据库托管**: 使用华为云 RDS
- **监控告警**: 使用华为云 APM