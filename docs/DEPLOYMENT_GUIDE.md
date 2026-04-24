# 云服务器部署指南

## 🎯 架构说明

```
┌─────────────────────┐
│   本地开发环境       │
│   Windows           │
│   - 代码编辑        │
│   - 功能测试        │
│   - 连接云端数据库   │
└──────────┬──────────┘
           │
           │ 自动部署脚本
           ▼
┌─────────────────────┐
│  云服务器            │
│  82.157.186.237     │
│  - 运行主程序        │
│  - PM2进程管理       │
│  - 定时任务          │
└──────────┬──────────┘
           │
           │ 共享
           ▼
┌─────────────────────┐
│  阿里云MySQL         │
│  8.130.161.244      │
│  (统一数据源)        │
└─────────────────────┘
```

---

## 📋 部署前准备

### 1. SSH访问配置

确保你可以SSH连接到服务器：

```bash
# 测试连接
ssh ubuntu@82.157.186.237

# 如果提示输入密码，说明需要密码认证
# 建议配置SSH密钥实现免密登录
```

### 2. 配置SSH密钥（推荐）

```bash
# 在本地生成SSH密钥（如果还没有）
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 复制公钥到服务器
ssh-copy-id ubuntu@82.157.186.237

# 测试免密登录
ssh ubuntu@82.157.186.237 "echo 'Success!'"
```

### 3. 确认服务器环境

服务器上应该已安装：
- ✅ Node.js
- ✅ npm
- ✅ PM2
- ✅ MySQL客户端
- ✅ rsync (用于Linux部署脚本)

---

## 🚀 部署方法

### 方法1：使用自动部署脚本（推荐）⭐⭐⭐

#### Windows用户

```bash
# 在项目根目录执行
deploy-to-server.bat
```

**脚本会自动完成**：
1. ✅ 打包项目文件（排除node_modules等）
2. ✅ 上传到服务器
3. ✅ 在服务器上创建备份
4. ✅ 解压并部署
5. ✅ 安装依赖
6. ✅ 重启PM2服务
7. ✅ 验证部署成功

#### Linux/Mac用户

```bash
# 添加执行权限
chmod +x deploy-to-server.sh

# 执行部署
./deploy-to-server.sh
```

---

### 方法2：手动部署

#### 步骤1：打包文件

```bash
# Windows PowerShell
tar.exe -czf deploy.tar.gz --exclude=node_modules --exclude=.git --exclude=data --exclude=.env .

# Linux/Mac
tar -czf deploy.tar.gz --exclude=node_modules --exclude=.git --exclude=data --exclude=.env .
```

#### 步骤2：上传到服务器

```bash
scp deploy.tar.gz ubuntu@82.157.186.237:/tmp/
```

#### 步骤3：在服务器上部署

```bash
# SSH连接到服务器
ssh ubuntu@82.157.186.237

# 进入项目目录
cd /home/ubuntu/agri-gateway

# 创建备份
tar -czf ../backup-$(date +%Y%m%d_%H%M%S).tar.gz .

# 解压新代码
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# 安装依赖
npm install --production

# 重启服务
pm2 restart agri-gateway

# 查看状态
pm2 status

# 查看日志
pm2 logs agri-gateway --lines 50
```

---

### 方法3：使用Git部署

#### 在服务器上配置Git仓库

```bash
# SSH到服务器
ssh ubuntu@82.157.186.237

# 进入项目目录
cd /home/ubuntu/agri-gateway

# 初始化Git（如果还没有）
git init

# 添加远程仓库
git remote add origin your-git-repo-url
```

#### 部署流程

```bash
# 1. 在本地提交代码
git add .
git commit -m "更新功能描述"
git push origin main

# 2. 在服务器上拉取最新代码
ssh ubuntu@82.157.186.237 "cd /home/ubuntu/agri-gateway && git pull && npm install --production && pm2 restart agri-gateway"
```

---

## 🔍 验证部署

### 1. 检查服务状态

```bash
# SSH到服务器
ssh ubuntu@82.157.186.237

# 查看PM2状态
pm2 status

# 应该看到类似输出：
# ┌────┬────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
# │ id │ name           │ mode     │ ↺    │ status    │ cpu      │ memory   │
# ├────┼────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
# │ 0  │ agri-gateway   │ fork     │ 0    │ online    │ 0%       │ 85.2mb   │
# └────┴────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

### 2. 测试API

```bash
# 在服务器上测试
curl http://localhost:3000/api/health

# 或在本地测试
curl http://82.157.186.237:3000/api/health
```

### 3. 访问前端页面

打开浏览器访问：
- http://82.157.186.237:3000

---

## 🔄 回滚操作

如果部署后出现问题，可以快速回滚：

### 方法1：使用自动备份回滚

```bash
# SSH到服务器
ssh ubuntu@82.157.186.237

# 查看备份列表
ls -lt /home/ubuntu/agri-gateway-backups/

# 恢复到指定备份
cd /home/ubuntu/agri-gateway
tar -xzf /home/ubuntu/agri-gateway-backups/backup_20260424_120000.tar.gz

# 重启服务
pm2 restart agri-gateway
```

### 方法2：使用Git回滚

```bash
# SSH到服务器
ssh ubuntu@82.157.186.237
cd /home/ubuntu/agri-gateway

# 查看提交历史
git log --oneline

# 回滚到指定版本
git reset --hard <commit-hash>

# 重启服务
pm2 restart agri-gateway
```

---

## 📊 日常维护

### 查看日志

```bash
# 实时查看日志
ssh ubuntu@82.157.186.237 "pm2 logs agri-gateway"

# 查看最近100行
ssh ubuntu@82.157.186.237 "pm2 logs agri-gateway --lines 100"

# 只查看错误
ssh ubuntu@82.157.186.237 "pm2 logs agri-gateway --err"
```

### 重启服务

```bash
# 正常重启
ssh ubuntu@82.157.186.237 "pm2 restart agri-gateway"

# 强制重启
ssh ubuntu@82.157.186.237 "pm2 reload agri-gateway"
```

### 监控资源

```bash
# 查看CPU和内存使用
ssh ubuntu@82.157.186.237 "pm2 monit"

# 查看系统资源
ssh ubuntu@82.157.186.237 "htop"
```

### 清理日志

```bash
# 清空PM2日志
ssh ubuntu@82.157.186.237 "pm2 flush"

# 清理旧日志文件
ssh ubuntu@82.157.186.237 "find /home/ubuntu/.pm2/logs -name '*.log' -mtime +7 -delete"
```

---

## ⚠️ 注意事项

### 1. 部署前检查

- [ ] 本地测试通过
- [ ] 没有未提交的敏感信息（.env等）
- [ ] 已通知团队成员
- [ ] 选择低峰期部署（避免影响用户）

### 2. 部署时注意

- [ ] 保持网络连接稳定
- [ ] 观察部署日志
- [ ] 验证服务启动成功
- [ ] 测试关键功能

### 3. 部署后验证

- [ ] API接口正常响应
- [ ] 前端页面可访问
- [ ] 数据库连接正常
- [ ] 定时任务正常运行
- [ ] 无明显错误日志

---

## 🛡️ 安全建议

### 1. 不要提交敏感文件

确保 `.gitignore` 包含：
```
.env
node_modules/
data/
*.log
uploads/
.DS_Store
```

### 2. 使用环境变量

敏感配置放在服务器的 `.env` 文件中，不要提交到Git。

### 3. 定期备份

- 每天自动备份数据库
- 每次部署前备份代码
- 保留最近7天的备份

### 4. 限制SSH访问

```bash
# 在服务器上配置防火墙
sudo ufw allow from your-ip-address to any port 22
sudo ufw enable
```

---

## 📞 故障排查

### 问题1：部署后服务无法启动

```bash
# 查看详细错误
ssh ubuntu@82.157.186.237 "pm2 logs agri-gateway --err"

# 常见原因：
# - 依赖未安装：npm install
# - 端口被占用：lsof -i :3000
# - 配置文件错误：检查.env
```

### 问题2：数据库连接失败

```bash
# 测试数据库连接
ssh ubuntu@82.157.186.237 "mysql -h 8.130.161.244 -u root -p -e 'SELECT 1'"

# 检查网络连接
ssh ubuntu@82.157.186.237 "ping 8.130.161.244"
```

### 问题3：API返回502错误

```bash
# 检查PM2状态
ssh ubuntu@82.157.186.237 "pm2 status"

# 检查端口监听
ssh ubuntu@82.157.186.237 "netstat -tlnp | grep 3000"

# 重启服务
ssh ubuntu@82.157.186.237 "pm2 restart agri-gateway"
```

---

## 💡 最佳实践

### 1. 自动化部署流程

```
本地开发 → 本地测试 → Git提交 → 自动部署 → 验证
```

### 2. 版本管理

- 使用语义化版本号（v1.0.0, v1.1.0等）
- 每次部署打标签：`git tag v1.0.0 && git push --tags`
- 记录变更日志（CHANGELOG.md）

### 3. 监控告警

建议设置：
- 服务宕机告警
- CPU/内存异常告警
- 错误日志告警

### 4. 文档更新

每次部署后更新：
- 功能变更记录
- 配置变更说明
- 已知问题列表

---

## 📝 快速参考

### 常用命令速查

```bash
# 部署
./deploy-to-server.sh          # Linux/Mac
deploy-to-server.bat           # Windows

# 查看状态
ssh ubuntu@82.157.186.237 "pm2 status"

# 查看日志
ssh ubuntu@82.157.186.237 "pm2 logs agri-gateway --lines 50"

# 重启服务
ssh ubuntu@82.157.186.237 "pm2 restart agri-gateway"

# 测试API
curl http://82.157.186.237:3000/api/health

# 回滚
ssh ubuntu@82.157.186.237 "cd /home/ubuntu/agri-gateway-backups && ls -t"
```

---

**文档版本**: 1.0  
**最后更新**: 2026-04-24  
**维护者**: 开发团队
