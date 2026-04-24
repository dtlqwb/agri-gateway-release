# 智慧农机数据聚合平台 v3.0

## 📦 版本信息

- **版本号**: v3.0.0
- **发布日期**: 2026-04-12
- **更新类型**: 功能增强 + 安全加固

---

## ✨ 主要功能

### 1. 多数据源聚合
- ✅ **云途安API数据** - 实时同步作业数据
- ✅ **旧供应商数据** - 支持Excel导入和历史数据迁移
- ✅ **数据自动合并** - 看板统计自动聚合所有数据源

### 2. 数据统计与展示
- ✅ **实时看板** - 总作业面积、设备数量、作业类型分布
- ✅ **耕种管收统计** - 按作业类型分类统计
- ✅ **合作社排名** - 按组织统计作业面积
- ✅ **多维度筛选** - 支持日期范围、地区、作业类型筛选

### 3. 数据管理
- ✅ **Excel智能导入** - 自动识别列名，支持多种格式
- ✅ **数据修复** - 在线编辑和修正作业记录
- ✅ **原始数据管理** - 查看和管理API原始记录
- ✅ **批量操作** - 支持批量删除和恢复

### 4. 权限管理
- ✅ **分级权限** - 超级管理员、农业局管理员、合作社管理员
- ✅ **数据隔离** - 不同角色看到不同的数据范围
- ✅ **安全认证** - HMAC-SHA256签名Token，24小时过期

### 5. 自动化任务
- ✅ **定时同步** - 每天凌晨2点自动同步云途安数据
- ✅ **自动抓取** - 每天凌晨3点自动抓取旧供应商数据
- ✅ **智能去重** - 基于唯一索引自动避免重复数据

---

## 🔐 安全特性（v3.0新增）

### Token认证增强
- ✅ HMAC-SHA256签名防伪造
- ✅ 24小时自动过期机制
- ✅ 签名验证防篡改
- ✅ 详细的验证日志

### 文件上传优化
- ✅ 磁盘存储替代内存存储（避免OOM）
- ✅ 文件大小限制10MB
- ✅ 文件类型白名单（仅允许Excel）
- ✅ 自动清理临时文件

### 敏感信息保护
- ✅ `.env`文件不被提交到Git
- ✅ 提供`.env.example`模板
- ✅ 完善的`.gitignore`规则

---

## 📁 项目结构

```
agri-gateway-release/
├── .env                    # 环境配置（需自行创建）
├── .env.example           # 环境配置模板
├── .gitignore             # Git忽略规则
├── index.js               # 主服务入口
├── package.json           # 项目依赖
├── README.md              # 使用说明
├── SECURITY_UPDATE.md     # 安全更新说明
├── EXCEL_IMPORT_GUIDE.md  # Excel导入指南
├── 项目开发文档.md         # 开发文档
│
├── public/                # 前端页面
│   ├── index.html         # 主看板页面
│   ├── farmer.html        # 农户查询页面
│   ├── data-repair.html   # 数据修复页面
│   ├── data-repair-work.html  # 作业记录修复
│   └── admin-manage.html  # 管理员管理
│
├── services/              # 服务层
│   ├── db.js             # 数据库服务
│   ├── yunTinanService.js # 云途安API服务
│   ├── oldSupplierCrawler.js # 旧供应商爬虫
│   ├── excelImport.js    # Excel导入服务
│   ├── excelParser.js    # Excel解析服务
│   └── workRecordsService.js # 作业记录服务
│
└── templates/             # 模板文件
    └── 旧供应商作业记录导入模板.xlsx
```

---

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 14.x
- MySQL >= 8.0
- Windows / Linux / macOS

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制模板文件并修改配置：

```bash
cp .env.example .env
```

编辑`.env`文件，配置以下内容：

```bash
# 云途安API配置
YT_USERNAME=your_username
YT_PASSWORD=your_password

# 旧供应商配置
OLD_SUPPLIER_USERNAME=your_username
OLD_SUPPLIER_PASSWORD=your_password

# Token密钥（生产环境必须修改）
TOKEN_SECRET=your-random-secret-key

# MySQL数据库配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=agri_gateway

# 服务端口
PORT=3001
```

**生成安全的TOKEN_SECRET**：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. 启动服务

```bash
npm start
```

服务将在 `http://localhost:3001` 启动

### 5. 访问系统

- **主看板**: http://localhost:3001
- **健康检查**: http://localhost:3001/api/health

**默认管理员账号**：
- 用户名: `admin`
- 密码: `admin123`

---

## 📊 主要API接口

### 认证相关
- `POST /api/admin/login` - 管理员登录
- `POST /api/farmer/login` - 农户登录

### 数据统计
- `GET /api/stats/all` - 聚合统计（云途安+旧供应商）
- `GET /api/stats` - 云途安统计
- `GET /api/machines` - 设备列表

### 数据管理
- `POST /api/import/preview` - Excel预览
- `POST /api/import/confirm` - Excel确认导入
- `GET /api/work-records` - 作业记录列表
- `PUT /api/work-records/:id` - 更新作业记录
- `DELETE /api/work-records/:id` - 删除作业记录

### 管理员管理（超管专属）
- `GET /api/admins` - 管理员列表
- `POST /api/admins` - 添加管理员
- `PUT /api/admins/:id` - 更新管理员
- `DELETE /api/admins/:id` - 删除管理员

---

## 📝 Excel导入说明

### 必需字段
至少包含以下4列：
- 设备号
- 作业日期
- 作业类型
- 作业面积

### 支持的列名
系统支持多种列名写法，详见 [EXCEL_IMPORT_GUIDE.md](./EXCEL_IMPORT_GUIDE.md)

### 使用模板
项目中提供了标准模板：`templates/旧供应商作业记录导入模板.xlsx`

---

## ⚙️ 定时任务

系统会自动执行以下定时任务：

1. **云途安数据同步**
   - 时间：每天凌晨 02:00
   - 内容：拉取最近7天的作业数据
   
2. **旧供应商数据抓取**
   - 时间：每天凌晨 03:00
   - 内容：自动登录并抓取最新数据

---

## 🔧 常见问题

### Q1: 首次启动很慢？
A: 首次启动会执行全量数据同步，可能需要几分钟。后续启动会使用增量同步，速度很快。

### Q2: 如何修改端口？
A: 在`.env`文件中修改`PORT`配置项。

### Q3: Token多久过期？
A: Token有效期为24小时，过期后需要重新登录。

### Q4: 如何备份数据？
A: 定期备份MySQL数据库：
```bash
mysqldump -u root -p agri_gateway > backup_$(date +%Y%m%d).sql
```

### Q5: 上传文件失败？
A: 检查：
- 文件格式是否为.xlsx或.xls
- 文件大小是否超过10MB
- uploads目录是否有写权限

---

## 📞 技术支持

如遇问题，请检查：
1. 服务器日志输出
2. `.env`配置是否正确
3. 数据库连接是否正常
4. 浏览器控制台错误信息

---

## 📄 许可证

ISC License

---

## 🎯 版本历史

### v3.0.0 (2026-04-12)
- ✨ 新增HMAC-SHA256 Token认证
- ✨ 优化文件上传为磁盘存储
- ✨ 添加文件类型白名单验证
- ✨ 实现自动清理临时文件
- ✨ 完善敏感信息保护
- 📝 新增详细的使用文档

### v2.0.0 (2026-04-12)
- ✨ 支持新旧供应商数据聚合
- ✨ 实现耕种管收统计
- ✨ 优化Excel导入性能
- ✨ 移除代码层去重逻辑

### v1.0.0
- 🎉 初始版本发布

---

**祝您使用愉快！** 🚀
