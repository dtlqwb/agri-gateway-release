# 农机定位聚合平台 - 快速部署指南

**版本**: v3.0.0  
**打包时间**: 2026-04-18  
**文件大小**: ~160KB（解压后约5MB）

---

## 📦 压缩包内容

```
agri-gateway-release/
├── config/              # 数据库配置
├── middleware/          # 中间件（认证、CORS等）
├── routes/              # API路由（9个模块）
├── services/            # 业务逻辑（6个服务）
├── utils/               # 工具函数
├── public/              # 前端页面（6个HTML）
├── templates/           # Excel模板
├── scripts/             # 实用脚本（仅保留必要的）
├── index.js             # 应用入口
├── package.json         # 依赖配置
├── package-lock.json    # 依赖锁定文件
├── .env.example         # 环境变量示例
├── README.md            # 项目说明
├── PROJECT_DOCUMENTATION.md  # 完整项目文档
├── DEPLOYMENT_GUIDE.md       # 详细部署指南
├── AGRI_BUREAU_ACCOUNT_SETUP.md  # 农业局账号配置
└── setup-agri-admin.js        # 农业局账号配置脚本
```

---

## 🚀 快速部署（5步完成）

### 步骤1: 解压文件
```bash
# Windows
# 右键点击 agri-gateway-release.zip -> 解压到当前文件夹

# Linux/Mac
unzip agri-gateway-release.zip
cd agri-gateway-release
```

### 步骤2: 安装Node.js依赖
```bash
npm install
```

这会安装所有必需的依赖包（约50MB）。

### 步骤3: 配置环境变量
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux/Mac
cp .env.example .env

# 编辑 .env 文件
```

**必须修改的配置**:
```env
# 数据库配置
DB_HOST=localhost          # MySQL服务器地址
DB_PORT=3306              # MySQL端口
DB_USER=root              # MySQL用户名
DB_PASSWORD=your_password # ⚠️ 修改为你的MySQL密码
DB_NAME=agri_gateway      # 数据库名称

# Token密钥（重要！）
TOKEN_SECRET=your_random_secret_key_here  # ⚠️ 改为随机字符串

# 管理员密码
ADMIN_PASSWORD=admin123   # ⚠️ 建议修改为强密码
```

**生成随机TOKEN_SECRET**:
```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Linux
openssl rand -hex 32
```

### 步骤4: 初始化数据库

确保MySQL服务已运行，然后创建数据库：

```sql
-- 登录MySQL
mysql -u root -p

-- 创建数据库
CREATE DATABASE agri_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 退出
exit;
```

首次运行应用时会自动创建表结构和初始数据。

### 步骤5: 启动服务
```bash
node index.js
```

看到以下输出表示成功：
```
[DB] 数据库连接成功
[DB] 表结构检查完成
[DB] 数据库就绪
🚀 聚合平台已启动: http://localhost:3001
```

访问 http://localhost:3001 即可使用。

---

## 🔧 生产环境部署

### 方案1: 使用PM2（推荐）

#### 安装PM2
```bash
npm install -g pm2
```

#### 启动服务
```bash
pm2 start index.js --name agri-gateway
pm2 save
pm2 startup
```

#### 常用命令
```bash
pm2 status              # 查看状态
pm2 logs agri-gateway   # 查看日志
pm2 restart agri-gateway # 重启
pm2 stop agri-gateway   # 停止
```

### 方案2: 使用Docker

创建 `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

构建和运行:
```bash
docker build -t agri-gateway .
docker run -d -p 3001:3001 --env-file .env agri-gateway
```

### 方案3: 使用Nginx反向代理

配置Nginx:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📊 默认账号

### 超级管理员
- **用户名**: admin
- **密码**: admin123（在.env中配置）
- **权限**: 全部权限

### 农业局管理员
- **用户名**: nongyeju
- **密码**: nongye123
- **角色**: 只读（viewer）
- **权限**: 仅查看和导出

⚠️ **首次登录后请立即修改默认密码！**

---

## 🛠️ 常见问题

### Q1: 提示找不到模块？
```bash
# 重新安装依赖
rm -rf node_modules
npm install
```

### Q2: 数据库连接失败？
1. 检查MySQL服务是否运行
2. 确认 `.env` 中的数据库配置正确
3. 测试连接: `mysql -u root -p agri_gateway`

### Q3: 端口被占用？
修改 `.env` 文件:
```env
PORT=3002  # 改为其他端口
```

### Q4: 定时任务未执行？
检查PM2日志:
```bash
pm2 logs agri-gateway --lines 50
```

### Q5: Playwright浏览器缺失？
```bash
npx playwright install
```

---

## 📚 详细文档

压缩包中包含以下文档：

1. **README.md** - 项目简介
2. **PROJECT_DOCUMENTATION.md** - 完整项目文档（API、数据库设计等）
3. **DEPLOYMENT_GUIDE.md** - 详细部署指南（多种方案）
4. **AGRI_BUREAU_ACCOUNT_SETUP.md** - 农业局账号配置指南

---

## 🔐 安全建议

1. **修改默认密码** - 所有默认账号的密码
2. **设置强TOKEN_SECRET** - 使用随机生成的字符串
3. **不要提交.env文件** - 添加到.gitignore
4. **定期更新依赖** - `npm audit fix`
5. **配置防火墙** - 只开放必要端口
6. **启用HTTPS** - 使用Let's Encrypt证书
7. **定期备份数据库** - 每天自动备份

---

## 📞 技术支持

如遇到问题：
1. 查看详细文档
2. 检查日志文件
3. 搜索常见问题
4. 联系开发团队

---

**祝部署顺利！** 🎉
