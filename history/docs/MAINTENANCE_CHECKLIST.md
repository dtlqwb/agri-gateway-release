# 项目维护清单

> 快速参考指南，帮助保持项目整洁和可维护。

---

## 📁 目录结构速查

```
agri-gateway-release/
├── index.js                # ⭐ 主服务入口
├── services/               # 🔧 核心服务（5个文件）
├── public/                 # 🌐 前端页面（5个文件）
├── scripts/                # 🛠️ 运维脚本（2个文件）
├── history/                # 📦 历史归档
└── *.md                    # 📄 文档（7个文件）
```

**原则**：
- ✅ 根目录只保留核心文件和文档
- ✅ 代码按功能分类到对应目录
- ✅ 历史文件统一归档到history/

---

## ✅ 日常检查清单

### 每周检查

- [ ] 检查uploads/目录，清理临时文件
- [ ] 查看错误日志，处理异常
- [ ] 备份数据库（如果需要）
- [ ] 检查磁盘空间

### 每月检查

- [ ] Review history/目录，删除过久的备份
- [ ] 更新依赖包（npm outdated）
- [ ] 检查安全漏洞（npm audit）
- [ ] 清理node_modules（重新install）

### 每季度检查

- [ ] 全面review项目结构
- [ ] 更新文档
- [ ] 性能优化
- [ ] 技术债务清理

---

## 📝 新增代码规范

### 添加新功能时

1. **服务层代码** → `services/`
   ```
   services/
   └── yourNewService.js
   ```

2. **路由代码** → 等待index.js拆分后放到`routes/`
   ```
   // 暂时在index.js中添加
   // TODO: 移动到 routes/yourRoute.js
   ```

3. **前端页面** → `public/`
   ```
   public/
   └── your-new-page.html
   ```

4. **运维脚本** → `scripts/`
   ```
   scripts/
   └── your-script.js
   ```

5. **配置文件** → `config/`
   ```
   config/
   └── your-config.js
   ```

### 不要做的事

❌ 不要在根目录创建新文件（除了.md文档）  
❌ 不要直接在index.js写大量业务逻辑  
❌ 不要创建test-*.js、debug-*.js等临时文件（用完后立即归档）  
❌ 不要忘记更新文档  

---

## 🗂️ 文件归档规则

### 何时归档

满足以下任一条件即归档：

1. **测试脚本** - 测试完成后
2. **修复脚本** - 问题修复后
3. **迁移脚本** - 迁移完成后
4. **临时文件** - 不再需要时
5. **旧版本代码** - 被新版本替代后
6. **备份文件** - 超过3个月

### 归档位置

```
history/
├── docs/          # 文档类（.md, .txt等）
├── scripts/       # 脚本类（.js, .sql, .bat等）
└── deprecated/    # 废弃代码（被替代的文件）
```

### 归档步骤

```bash
# 1. 移动到history对应目录
Move-Item -Path "scripts/test-xxx.js" -Destination "history/scripts/"

# 2. 在项目整理报告中记录
# 编辑 CONVERGENCE_SUMMARY.md 或 项目整理报告.md

# 3. 提交git
git add history/
git commit -m "archive: 归档测试脚本 test-xxx.js"
```

---

## 📄 文档更新规则

### 必须更新的文档

| 变更类型 | 更新文档 |
|---------|---------|
| 新增功能 | README.md, PROJECT_STRUCTURE.md |
| API变更 | README.md, 接口文档 |
| 配置变更 | README.md, .env.example |
| 目录结构调整 | PROJECT_STRUCTURE.md, README.md |
| 重大重构 | OPTIMIZATION_ROADMAP.md, 项目整理报告.md |
| Bug修复 | 相关文档（如果有） |

### 文档命名规范

- ✅ 使用中文或英文，保持一致性
- ✅ 使用有意义的名称
- ✅ 避免空格，使用下划线或连字符
- ❌ 不要使用temp、test、new等模糊名称

示例：
```
✅ PROJECT_STRUCTURE.md
✅ optimization-roadmap.md
✅ 项目整理报告.md
❌ temp.md
❌ new_doc.md
❌ test file.md
```

---

## 🔧 常用命令

### 启动服务

```bash
# 开发环境
node index.js

# 生产环境（使用pm2）
pm2 start index.js --name agri-gateway
pm2 save
pm2 startup
```

### 同步数据

```bash
# 北斗设备数据同步
node scripts/sync-beidou-range.js

# 云途安数据同步（自动定时任务）
# 无需手动执行
```

### 数据库操作

```bash
# 导出数据库
mysqldump -u root -p agri_gateway > backup.sql

# 导入数据库
mysql -u root -p agri_gateway < backup.sql

# 查看数据库大小
mysql -u root -p -e "SELECT table_schema AS 'Database', 
ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)' 
FROM information_schema.tables 
WHERE table_schema = 'agri_gateway';"
```

### Git操作

```bash
# 查看变更
git status
git diff

# 提交代码
git add .
git commit -m "feat: 添加新功能"

# 推送代码
git push origin main

# 查看历史
git log --oneline
```

---

## 🚨 常见问题处理

### 服务启动失败

```bash
# 1. 检查端口占用
netstat -ano | findstr :3001

# 2. 检查.env配置
cat .env

# 3. 检查数据库连接
mysql -u root -p -e "SHOW DATABASES;"

# 4. 查看详细错误
node index.js 2>&1 | tee error.log
```

### 数据同步失败

```bash
# 1. 检查API配置
# 查看 .env 中的 OLD_API_* 配置

# 2. 测试API连接
node -e "require('dotenv').config(); console.log(process.env.OLD_API_BASE)"

# 3. 手动同步测试
node scripts/sync-beidou-range.js

# 4. 查看同步日志
# 在管理后台查看同步历史记录
```

### 前端页面空白

```bash
# 1. 清除浏览器缓存
# Ctrl+Shift+Delete

# 2. 检查控制台错误
# F12 -> Console

# 3. 检查网络请求
# F12 -> Network

# 4. 重启服务
# Ctrl+C 停止，然后重新启动
```

---

## 📊 性能监控

### 关键指标

| 指标 | 正常范围 | 告警阈值 |
|------|---------|---------|
| CPU使用率 | < 50% | > 80% |
| 内存使用 | < 512MB | > 1GB |
| 响应时间 | < 500ms | > 2s |
| 数据库连接 | < 50 | > 100 |
| 磁盘空间 | > 10GB | < 5GB |

### 监控命令

```bash
# 查看进程状态
ps aux | grep node

# 查看内存使用
node -e "console.log(process.memoryUsage())"

# 查看数据库连接数
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# 查看磁盘空间
df -h
```

---

## 🔐 安全注意事项

### 敏感信息保护

1. **.env文件**
   - ✅ 添加到.gitignore
   - ✅ 不要分享给他人
   - ✅ 定期更换密码

2. **数据库密码**
   - ✅ 使用强密码
   - ✅ 定期更换
   - ✅ 不要硬编码在代码中

3. **API密钥**
   - ✅ 存储在.env中
   - ✅ 限制访问权限
   - ✅ 定期轮换

### 安全检查清单

- [ ] .env文件未提交到git
- [ ] 数据库密码足够强壮
- [ ] API密钥已妥善保护
- [ ] 没有硬编码的敏感信息
- [ ] 依赖包无已知漏洞（npm audit）

---

## 📞 紧急联系

### 问题上报流程

1. **轻微问题** - 记录到issue，下次迭代修复
2. **中等问题** - 24小时内修复
3. **严重问题** - 立即处理，通知相关人员
4. **紧急问题** - 立即停机修复，全员通知

### 联系方式

- 开发负责人：[姓名] - [电话/微信]
- 运维负责人：[姓名] - [电话/微信]
- 技术支持：[邮箱]

---

## 📚 学习资源

### 内部文档

- [README.md](./README.md) - 项目说明
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 项目结构
- [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md) - 优化路线
- [项目整理报告.md](./项目整理报告.md) - 整理详情

### 外部资源

- Node.js官方文档: https://nodejs.org/docs/
- Express框架: https://expressjs.com/
- MySQL文档: https://dev.mysql.com/doc/
- Vue.js文档: https://vuejs.org/

---

## 🎯 持续改进

### 反馈渠道

- GitHub Issues
- 团队会议
- 代码Review意见
- 用户反馈

### 改进周期

- **每周**: 小优化（bug修复、性能调优）
- **每月**: 中优化（功能增强、文档完善）
- **每季度**: 大优化（架构调整、技术升级）

---

**最后更新**: 2026-04-16  
**维护者**: 开发团队  
**更新频率**: 每月review一次
