# 统一数据源配置指南

## 🎯 目标

让本地开发环境直接连接服务器的MySQL数据库，实现数据完全一致。

---

## ⚠️ 重要前提条件

### 1. 服务器MySQL必须允许远程连接

**检查步骤**（在服务器上执行）：

```bash
# 1. 登录MySQL
mysql -u root -p

# 2. 检查当前用户权限
SELECT user, host FROM mysql.user;

# 3. 如果root用户的host是'localhost'，需要改为'%'
GRANT ALL PRIVILEGES ON agri_gateway.* TO 'root'@'%' IDENTIFIED BY 'your-password';
FLUSH PRIVILEGES;

# 4. 检查MySQL绑定地址
cat /etc/mysql/mysql.conf.d/mysqld.cnf | grep bind-address
# 应该是: bind-address = 0.0.0.0
# 如果是 127.0.0.1，需要修改为 0.0.0.0 并重启MySQL
```

### 2. 防火墙开放3306端口

```bash
# Ubuntu/Debian
sudo ufw allow 3306/tcp
sudo ufw reload

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3306/tcp
sudo firewall-cmd --reload
```

### 3. 云服务器安全组配置

如果是阿里云/腾讯云等，需要在控制台的安全组中开放3306端口。

---

## 🔧 配置步骤

### 步骤1：备份当前配置

```bash
# 备份当前的.env文件
cp .env .env.local-backup
```

### 步骤2：修改.env配置

将MySQL配置部分修改为：

```env
# MySQL 数据库配置（连接到服务器）
MYSQL_HOST=82.157.186.237
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-server-mysql-password
MYSQL_DATABASE=agri_gateway
```

**注意**：需要将 `MYSQL_PASSWORD` 改为服务器MySQL的实际密码。

### 步骤3：测试连接

运行测试脚本：

```bash
node scripts/test-remote-db.js
```

### 步骤4：验证数据

访问 http://localhost:3000 查看数据是否与服务器一致。

---

## 📊 方案对比

### 方案A：直接连接服务器数据库（当前方案）

**优点**：
- ✅ 数据实时完全一致
- ✅ 无需同步逻辑
- ✅ 维护简单

**缺点**：
- ⚠️ 依赖网络连接
- ⚠️ 网络延迟可能影响性能
- ⚠️ 服务器MySQL需要允许远程连接
- ⚠️ 安全性需要考虑

**适用场景**：
- 稳定的网络连接
- 团队内部开发
- 对实时性要求高

---

### 方案B：API重新同步（备选方案）

**优点**：
- ✅ 不依赖数据库远程访问
- ✅ 本地可以有离线副本
- ✅ 更安全

**缺点**：
- ⚠️ 数据可能有短暂延迟
- ⚠️ 需要定期执行同步

**适用场景**：
- 网络不稳定
- 需要离线工作
- 安全性要求高

---

## 🔒 安全建议

### 1. 使用专用数据库用户

不要使用root用户，创建专用用户：

```sql
-- 在服务器上执行
CREATE USER 'agri_dev'@'%' IDENTIFIED BY 'strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON agri_gateway.* TO 'agri_dev'@'%';
FLUSH PRIVILEGES;
```

然后在 `.env` 中使用：
```env
MYSQL_USER=agri_dev
MYSQL_PASSWORD=strong-password
```

### 2. 限制IP白名单

如果可能，只允许特定IP访问：

```sql
GRANT ALL PRIVILEGES ON agri_gateway.* TO 'root'@'your-ip-address' IDENTIFIED BY 'password';
```

### 3. 使用SSH隧道（最安全）

通过SSH隧道连接，不需要开放MySQL端口：

```bash
# 建立SSH隧道
ssh -L 3307:localhost:3306 ubuntu@82.157.186.237

# 然后配置本地连接
MYSQL_HOST=localhost
MYSQL_PORT=3307
```

---

## 🧪 测试清单

配置完成后，逐项测试：

- [ ] 数据库连接成功
- [ ] 可以查询数据
- [ ] 可以插入数据
- [ ] 定时任务正常运行
- [ ] API接口正常响应
- [ ] 前端页面显示正确
- [ ] 性能可接受（无明显延迟）

---

## ⚡ 性能优化建议

### 1. 启用连接池

确保 `services/db.js` 中使用了连接池（已实现）。

### 2. 添加查询缓存

对于不频繁变化的数据，可以添加缓存：

```javascript
// 示例：缓存合作社列表10分钟
let orgCache = null;
let orgCacheTime = 0;

async function getOrganizations() {
  const now = Date.now();
  if (orgCache && now - orgCacheTime < 10 * 60 * 1000) {
    return orgCache;
  }
  
  orgCache = await db.queryAll('SELECT * FROM organizations');
  orgCacheTime = now;
  return orgCache;
}
```

### 3. 监控网络延迟

```bash
# 测试到服务器的延迟
ping 82.157.186.237

# 测试数据库连接延迟
time mysql -h 82.157.186.237 -u root -p -e "SELECT 1"
```

---

## 🔄 切换回本地数据库

如果需要切换回本地数据库：

```bash
# 恢复备份
cp .env.local-backup .env

# 或者手动修改
MYSQL_HOST=localhost
```

---

## ❓ 常见问题

### Q1: 连接超时怎么办？
A: 检查防火墙、安全组配置，确认MySQL允许远程连接。

### Q2: 连接很慢怎么办？
A: 
- 检查网络质量
- 考虑使用SSH隧道
- 或者改用API同步方案

### Q3: 多人同时连接会有问题吗？
A: MySQL默认支持多个连接，但要注意连接池大小配置。

### Q4: 服务器重启后需要重新配置吗？
A: 不需要，只要MySQL配置不变，.env配置就可以继续使用。

---

## 📝 下一步

1. **确认服务器MySQL配置**（允许远程连接）
2. **获取MySQL密码**
3. **修改.env配置**
4. **运行测试脚本**
5. **验证功能正常**

---

**文档版本**: 1.0  
**最后更新**: 2026-04-24
