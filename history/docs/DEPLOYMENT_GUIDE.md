# 快速启动与部署指南

**适用于**: 农机定位聚合平台 v3.0.0  
**更新时间**: 2026-04-18

---

## 🚀 快速启动（5分钟）

### 前置条件
- ✅ Node.js 16+ 已安装
- ✅ MySQL 8.0+ 已安装并运行
- ✅ 已创建数据库 `agri_gateway`

### 步骤1: 克隆项目
```bash
cd agri-gateway-release
```

### 步骤2: 安装依赖
```bash
npm install
```

### 步骤3: 配置环境变量
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env

# 编辑 .env 文件，修改以下配置：
# - DB_PASSWORD: 你的MySQL密码
# - TOKEN_SECRET: 生成随机字符串
# - ADMIN_PASSWORD: 管理员密码
```

### 步骤4: 初始化数据库
```bash
# 首次运行会自动创建表和初始数据
node index.js
```

看到以下输出表示成功：
```
[DB] 数据库连接成功
[DB] 表结构检查完成
[DB] 数据库就绪
🚀 聚合平台已启动: http://localhost:3001
```

### 步骤5: 访问应用
- 管理后台: http://localhost:3001
- 农户端: http://localhost:3001/farmer
- 默认账号: admin / admin123（在.env中配置）

---

## 📦 生产环境部署

### 方案一: PM2进程管理（推荐）

#### 1. 安装PM2
```bash
npm install -g pm2
```

#### 2. 创建PM2配置文件 `ecosystem.config.js`
```javascript
module.exports = {
  apps: [{
    name: 'agri-gateway',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

#### 3. 启动服务
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 4. 常用PM2命令
```bash
pm2 status              # 查看状态
pm2 logs agri-gateway   # 查看日志
pm2 restart agri-gateway # 重启
pm2 stop agri-gateway   # 停止
pm2 delete agri-gateway # 删除
```

---

### 方案二: Docker容器化部署

#### 1. 创建 `Dockerfile`
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
```

#### 2. 创建 `docker-compose.yml`
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DB_HOST=db
      - DB_PORT=3306
      - DB_USER=root
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=agri_gateway
      - TOKEN_SECRET=${TOKEN_SECRET}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    depends_on:
      - db
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: agri_gateway
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"
    restart: unless-stopped

volumes:
  mysql_data:
```

#### 3. 启动服务
```bash
docker-compose up -d
```

---

### 方案三: Nginx反向代理

#### 1. 安装Nginx
```bash
# Ubuntu/Debian
sudo apt-get install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### 2. 配置Nginx
创建 `/etc/nginx/sites-available/agri-gateway`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 日志
    access_log /var/log/nginx/agri-gateway-access.log;
    error_log /var/log/nginx/agri-gateway-error.log;

    # 静态文件
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传文件大小限制
    client_max_body_size 50M;
}
```

#### 3. 启用配置
```bash
sudo ln -s /etc/nginx/sites-available/agri-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 4. 配置HTTPS（Let's Encrypt）
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔧 数据库配置

### MySQL优化建议

编辑 `my.cnf` 或 `my.ini`:
```ini
[mysqld]
# 连接数
max_connections = 200

# 字符集
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# 缓存
innodb_buffer_pool_size = 1G
query_cache_size = 64M

# 日志
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
```

### 创建数据库和用户
```sql
-- 创建数据库
CREATE DATABASE agri_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户
CREATE USER 'agri_user'@'localhost' IDENTIFIED BY 'your_password';

-- 授权
GRANT ALL PRIVILEGES ON agri_gateway.* TO 'agri_user'@'localhost';
FLUSH PRIVILEGES;
```

---

## 📊 监控与维护

### 1. 健康检查
```bash
# API健康检查
curl http://localhost:3001/api/health

# 预期响应
{"code":0,"msg":"ok","time":"2026-04-18T00:00:00.000Z"}
```

### 2. 日志查看
```bash
# PM2日志
pm2 logs agri-gateway --lines 100

# 系统日志
tail -f /var/log/syslog | grep agri

# Nginx日志
tail -f /var/log/nginx/agri-gateway-access.log
```

### 3. 数据库备份
```bash
#!/bin/bash
# backup.sh - 每日自动备份脚本

BACKUP_DIR="/backup/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="agri_gateway"
DB_USER="root"
DB_PASS="your_password"

mkdir -p $BACKUP_DIR

mysqldump -u $DB_USER -p$DB_PASS \
  --single-transaction \
  --routines \
  --triggers \
  $DB_NAME > $BACKUP_DIR/${DB_NAME}_${DATE}.sql

# 压缩备份
gzip $BACKUP_DIR/${DB_NAME}_${DATE}.sql

# 删除7天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${DB_NAME}_${DATE}.sql.gz"
```

设置定时任务（crontab -e）:
```cron
0 1 * * * /path/to/backup.sh >> /var/log/mysql-backup.log 2>&1
```

### 4. 性能监控
```bash
# 查看CPU和内存使用
top -p $(pgrep -f "node index.js")

# 查看数据库连接数
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# 查看慢查询
mysql -u root -p -e "SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;"
```

---

## 🔐 安全加固

### 1. 防火墙配置
```bash
# Ubuntu (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

### 2. 禁用不必要的端口
```bash
# 只开放必要端口
# 80 (HTTP), 443 (HTTPS), 22 (SSH)
# 关闭3001端口的直接访问，通过Nginx代理
```

### 3. 定期更新
```bash
# 更新Node.js依赖
npm audit fix
npm update

# 更新系统包
sudo apt-get update && sudo apt-get upgrade
```

### 4. SSL证书自动续期
```bash
# 添加定时任务
sudo crontab -e

# 每月1号凌晨3点检查并续期
0 3 1 * * certbot renew --quiet
```

---

## 🆘 故障排查

### 问题1: 服务无法启动
```bash
# 检查端口占用
netstat -tlnp | grep 3001

# 查看详细错误
node index.js 2>&1 | tee error.log

# 检查数据库连接
mysql -u root -p -e "SELECT 1;"

# 检查.env配置
cat .env | grep -v "^#" | grep -v "^$"
```

### 问题2: 数据库连接失败
```bash
# 测试数据库连接
mysql -h localhost -u root -p agri_gateway

# 检查MySQL服务状态
systemctl status mysql

# 查看MySQL日志
tail -f /var/log/mysql/error.log
```

### 问题3: 内存不足
```bash
# 查看内存使用
free -h

# 查看Node.js进程内存
ps aux | grep node

# 调整PM2内存限制
pm2 set agri-gateway max_memory_restart 2G
```

### 问题4: Playwright浏览器缺失
```bash
# 安装浏览器
npx playwright install

# 安装系统依赖（Ubuntu）
npx playwright install-deps
```

### 问题5: 定时任务未执行
```bash
# 检查PM2进程
pm2 list

# 查看定时任务日志
pm2 logs agri-gateway --grep "定时"

# 手动触发同步测试
curl -X POST http://localhost:3001/api/sync/yuntinan
```

---

## 📞 技术支持

### 常用资源
- **项目文档**: [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)
- **测试报告**: [TEST_AND_BUG_REPORT.md](./TEST_AND_BUG_REPORT.md)
- **API文档**: 见项目文档中的API接口章节

### 获取帮助
1. 查看日志文件
2. 检查项目文档
3. 搜索历史Issue
4. 联系开发团队

---

## 📝 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v3.0.0 | 2026-04-18 | 当前版本，MySQL迁移完成，功能完整 |
| v2.x.x | 2026-03 | SQLite版本，功能迭代中 |
| v1.x.x | 2026-02 | 初始版本 |

---

**祝部署顺利！** 🎉

如有问题，请参考项目文档或联系技术支持。
