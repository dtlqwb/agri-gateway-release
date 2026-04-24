# 农机定位聚合平台 - 项目文档

**版本**: v3.0.0  
**最后更新**: 2026-04-18  
**状态**: ✅ 生产就绪（测试通过率 100%）

---

## 📋 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [数据库设计](#数据库设计)
- [API接口文档](#api接口文档)
- [前端页面](#前端页面)
- [定时任务](#定时任务)
- [部署说明](#部署说明)
- [测试报告](#测试报告)
- [已知问题和注意事项](#已知问题和注意事项)

---

## 项目概述

农机定位聚合平台是一个综合性的农机作业数据管理系统，整合了多个供应商（云途安、旧供应商）的农机设备数据，提供统一的监控、统计、修复和导出功能。

### 主要特点

- ✅ **多数据源整合**：同时支持云途安（新供应商）和旧供应商API的数据
- ✅ **权限管理**：超管、农业局管理员、农户三级权限体系
- ✅ **数据修复**：支持手动编辑作业记录，修正错误数据
- ✅ **自动化同步**：定时自动同步两个供应商的最新数据
- ✅ **数据导出**：支持Excel格式的作业记录导出
- ✅ **实时统计**：提供合作社、设备、作业类型等多维度统计

---

## 核心功能

### 1. 用户认证与权限系统

#### 权限级别
- **超级管理员 (super)**: 完全访问权限，包括数据修复、删除、导入等敏感操作
- **农业局管理员 (agri_bureau)**: 查看统计数据，无修改权限
- **农户 (farmer)**: 仅查看自己合作社的数据和设备

#### 认证方式
- Token-based authentication（JWT-like）
- Token存储在 `.env` 文件的 `TOKEN_SECRET` 中
- 所有敏感API需要 `Authorization` header

### 2. 数据同步功能

#### 云途安同步
- **频率**: 每天凌晨 2:00 自动执行
- **方式**: API调用获取最新作业数据
- **去重机制**: 基于 `t_number + work_date + work_type_name` 唯一索引
- **数据存储**: MySQL `work_records` 表

#### 旧供应商同步
- **方式1 - API同步**: 每天凌晨 3:00 自动执行，通过浏览器自动化抓取
- **方式2 - Excel导入**: 支持手动上传Excel文件批量导入
- **去重机制**: 同样基于唯一索引避免重复数据

### 3. 数据修复管理

#### 功能特性
- 查询和筛选作业记录（按日期、设备号、作业类型、合作社、数据源）
- 单条记录编辑（可修改：作业面积、达标面积、车牌号、机手姓名、合作社、作业类型）
- 批量设置合作社
- 批量删除记录
- 数据导出（Excel格式）

#### UTC时间处理
- 数据库存储UTC时间
- 后端自动转换为北京时间（+8小时）后返回给前端
- 前端显示为 `YYYY-MM-DD` 格式

### 4. 设备管理

#### 设备类型
- **云途安设备**: 从云途安API同步，存储在 `machines` 表
- **旧供应商设备**: 从旧供应商API/Excel导入，存储在 `old_supplier_devices` 表

#### 作业类型配置
- 支持四种作业类型：耕、种、管、收
- 可为每个设备单独配置作业类型
- 作业类型影响数据统计和展示

### 5. 合作社与农户管理

- 合作社（organizations）与设备的关联
- 农户（farmers）与合作社的关联
- 支持按合作社筛选和统计数据

### 6. 数据导出

#### 导出选项
- 全量作业记录导出（支持选择数据源）
- 按日期范围筛选
- 按合作社、设备号、作业类型筛选
- Excel格式输出，包含所有字段

---

## 技术架构

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | LTS | 运行时环境 |
| Express | ^5.2.1 | Web框架 |
| MySQL2 | ^3.22.0 | 数据库驱动 |
| Playwright | ^1.59.1 | 浏览器自动化（旧供应商抓取） |
| node-cron | ^4.2.1 | 定时任务调度 |
| xlsx | ^0.18.5 | Excel文件读写 |
| multer | ^2.1.1 | 文件上传处理 |
| dotenv | ^17.4.1 | 环境变量管理 |
| axios | ^1.14.0 | HTTP客户端 |
| cors | ^2.8.6 | CORS中间件 |

### 前端技术栈

- **纯HTML/CSS/JavaScript**：无框架依赖，轻量快速
- **响应式设计**：适配桌面和移动端
- **RESTful API通信**：使用 Fetch API

### 数据库

- **MySQL 8.0+**
- 字符集: utf8mb4
- 时区: UTC（应用层转换）

---

## 项目结构

```
agri-gateway-release/
├── config/                    # 配置文件
│   └── database.js           # 数据库连接配置
├── middleware/                # 中间件
│   ├── auth.js               # 认证中间件
│   ├── cors.js               # CORS中间件
│   └── upload.js             # 文件上传中间件
├── routes/                    # 路由模块
│   ├── index.js              # 路由汇总
│   ├── admin.js              # 管理员相关路由
│   ├── agriSummary.js        # 农业数据汇总
│   ├── dataManage.js         # 数据管理
│   ├── deviceManage.js       # 设备管理
│   ├── oldSupplier.js        # 旧供应商API
│   ├── tracks.js             # 设备轨迹
│   ├── workRecords.js        # 作业记录管理
│   └── yunTinan.js           # 云途安API
├── services/                  # 业务逻辑服务
│   ├── db.js                 # 数据库服务（71KB，核心）
│   ├── excelImport.js        # Excel导入服务
│   ├── oldSupplierService.js # 旧供应商服务
│   ├── scheduler.js          # 定时任务调度
│   ├── workRecordsService.js # 作业记录服务
│   └── yunTinanService.js    # 云途安服务
├── utils/                     # 工具函数
│   └── token.js              # Token生成和验证
├── public/                    # 前端静态文件
│   ├── index.html            # 主管理页面（112KB）
│   ├── farmer.html           # 农户端页面
│   ├── admin-manage.html     # 管理员管理页面
│   ├── data-repair-work.html # 数据修复页面
│   ├── old-api-manage.html   # 旧供应商API管理
│   └── work-type-config.html # 作业类型配置
├── scripts/                   # 脚本工具
│   ├── sync-beidou-range.js  # 北斗设备同步脚本
│   └── ...                   # 其他辅助脚本
├── templates/                 # Excel模板
│   └── 旧供应商导入模板.xlsx
├── uploads/                   # 上传文件目录
├── history/                   # 历史文档（开发过程记录）
├── .env                       # 环境变量配置（不提交到Git）
├── .env.example               # 环境变量示例
├── .gitignore                 # Git忽略配置
├── index.js                   # 应用入口（精简版，94行）
├── package.json               # 项目依赖
└── README.md                  # 简要说明
```

---

## 数据库设计

### 核心表结构

#### 1. work_records（作业记录表）
```sql
CREATE TABLE work_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  t_number VARCHAR(50),           -- 终端编号
  work_date DATE,                  -- 作业日期
  work_type_name VARCHAR(20),      -- 作业类型名称
  acre DECIMAL(10,2),              -- 作业面积（亩）
  ok_acre DECIMAL(10,2),           -- 达标面积（亩）
  plate_no VARCHAR(20),            -- 车牌号
  driver_name VARCHAR(50),         -- 机手姓名
  org_id INT,                      -- 合作社ID
  org_name VARCHAR(100),           -- 合作社名称
  source VARCHAR(20),              -- 数据源：yuntinan/old/old_api
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tnumber_date_type (t_number, work_date, work_type_name)
);
```

#### 2. machines（云途安设备表）
```sql
CREATE TABLE machines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  macid VARCHAR(50),               -- MAC地址
  t_number VARCHAR(50),            -- 终端编号
  plate_no VARCHAR(20),            -- 车牌号
  driver_name VARCHAR(50),         -- 机手姓名
  work_type_name VARCHAR(20),      -- 作业类型
  org_id INT,                      -- 合作社ID
  last_sync_time TIMESTAMP,        -- 最后同步时间
  source VARCHAR(20) DEFAULT 'yuntinan'
);
```

#### 3. old_supplier_devices（旧供应商设备表）
```sql
CREATE TABLE old_supplier_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50),           -- 设备ID
  device_name VARCHAR(100),        -- 设备名称
  plate_no VARCHAR(20),            -- 车牌号
  driver_name VARCHAR(50),         -- 机手姓名
  work_type_name VARCHAR(20),      -- 作业类型
  org_id INT,                      -- 合作社ID
  mapped_yuntinan_tnumber VARCHAR(50), -- 映射的云途安终端号
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. organizations（合作社表）
```sql
CREATE TABLE organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),               -- 合作社名称
  contact VARCHAR(50),             -- 联系人
  phone VARCHAR(20),               -- 联系电话
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 5. farmers（农户表）
```sql
CREATE TABLE farmers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE,     -- 用户名
  password VARCHAR(255),           -- 密码（加密）
  org_id INT,                      -- 所属合作社ID
  role VARCHAR(20) DEFAULT 'farmer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. admins（管理员表）
```sql
CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE,     -- 用户名
  password VARCHAR(255),           -- 密码（加密）
  role VARCHAR(20),                -- 角色：super/agri_bureau
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 7. crawl_log（抓取日志表）
```sql
CREATE TABLE crawl_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_time TIMESTAMP,            -- 开始时间
  end_time TIMESTAMP,              -- 结束时间
  status VARCHAR(20),              -- 状态：success/failed
  records_count INT,               -- 记录数
  error_message TEXT,              -- 错误信息
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## API接口文档

### 基础信息

- **Base URL**: `http://localhost:3001/api`
- **认证**: 部分接口需要 `Authorization: <token>` header
- **响应格式**: JSON `{ code: 0, msg: "ok", data: {...} }`

### 认证接口

#### POST /api/admin/login
管理员登录
```json
Request: { "username": "admin", "password": "admin123" }
Response: { "code": 0, "data": { "username": "admin", "role": "super", "token": "..." } }
```

### 作业记录接口

#### GET /api/work-records
查询作业记录列表
```
Query: page=1&pageSize=20&startDate=2026-04-01&endDate=2026-04-18&tNumber=&workType=&orgId=&source=
Headers: Authorization: <token>
```

#### GET /api/work-records/:id
查询单条记录详情
```
Headers: Authorization: <token>
```

#### PUT /api/work-records/:id
更新作业记录
```json
Request: { "acre": 10.5, "ok_acre": 9.8, "plate_no": "...", "driver_name": "...", "org_id": 1, "org_name": "...", "work_type_name": "耕" }
Headers: Authorization: <token>
```

#### DELETE /api/work-records/:id
删除作业记录
```
Headers: Authorization: <token>
```

#### GET /api/work-records/stats
获取作业记录统计
```
Headers: Authorization: <token>
```

### 云途安接口

#### GET /api/machines
获取云途安设备列表

#### GET /api/stats
获取云途安统计数据
```
Query: startDate=2026-04-01&endDate=2026-04-18
```

#### GET /api/work-types
获取作业类型配置

### 旧供应商接口

#### GET /api/old/machines
获取旧供应商设备列表

#### GET /api/old/devices
获取旧供应商设备详情（需认证）

#### GET /api/old/stats
获取旧供应商统计数据（需认证）

### 设备管理接口

#### GET /api/device/list
获取设备列表（含作业类型）
```
Query: orgId=1
```

#### POST /api/device/work-type
更新设备作业类型
```json
Request: { "macid": "...", "workTypeName": "耕" }
```

### 数据导出接口

#### GET /api/export/all-records
导出全量作业记录
```
Query: sources=yuntinan,old,old_api&startDate=...&endDate=...
```

#### GET /api/agri/summary
获取农业数据汇总

### 管理接口

#### GET /api/admins
获取管理员列表（超管专属）
```
Headers: Authorization: <token>
```

#### GET /api/organizations
获取合作社列表

#### GET /api/farmers
获取农户列表

#### GET /api/farmer/stats
获取农户统计数据
```
Query: orgId=1
```

---

## 前端页面

### 1. 主管理页面 (index.html)
- **路径**: `/`
- **功能**: 
  - 数据看板（统计卡片、图表）
  - 设备列表展示
  - 合作社管理
  - 农户管理
  - 数据同步控制

### 2. 农户端页面 (farmer.html)
- **路径**: `/farmer`
- **功能**:
  - 农户登录
  - 查看自己合作社的设备
  - 修改设备作业类型
  - 查看作业统计数据

### 3. 数据修复页面 (data-repair-work.html)
- **路径**: 在主页面中通过标签页切换
- **功能**:
  - 高级筛选（日期、设备、类型、合作社、数据源）
  - 表格展示作业记录
  - 单条编辑（面积、车牌、机手、合作社、作业类型）
  - 批量设置合作社
  - 批量删除
  - Excel导出

### 4. 管理员管理页面 (admin-manage.html)
- **路径**: 在主页面中通过标签页切换
- **功能**:
  - 管理员账号CRUD
  - 角色分配（super/agri_bureau）
  - 权限控制

### 5. 旧供应商API管理 (old-api-manage.html)
- **路径**: 在主页面中通过标签页切换
- **功能**:
  - 手动触发数据抓取
  - 查看抓取日志
  - 配置抓取参数

### 6. 作业类型配置 (work-type-config.html)
- **路径**: 在主页面中通过标签页切换
- **功能**:
  - 查看和配置作业类型
  - 设备作业类型批量设置

---

## 定时任务

### 调度器配置 (services/scheduler.js)

#### 1. 云途安同步任务
- **Cron表达式**: `0 2 * * *` （每天凌晨2:00）
- **功能**: 自动同步云途安最新作业数据
- **启动**: `scheduler.startYuntinanScheduler(dbReady)`

#### 2. 旧供应商爬虫任务
- **Cron表达式**: `0 3 * * *` （每天凌晨3:00）
- **功能**: 使用Playwright自动登录旧供应商网站，抓取Excel并解析
- **启动**: `scheduler.startOldSupplierCrawler()`

#### 3. 旧供应商API同步任务
- **Cron表达式**: `0 4 * * *` （每天凌晨4:00）
- **功能**: 通过API同步旧供应商数据（备用方案）
- **启动**: `scheduler.startOldAPISync()`

### 手动触发

所有定时任务都提供了对应的API接口，可以手动触发：
- `POST /api/sync/yuntinan` - 手动同步云途安
- `POST /api/old-api/crawl` - 手动触发旧供应商抓取
- `POST /api/old/sync` - 手动同步旧供应商API

---

## 部署说明

### 环境要求

- **Node.js**: 16.x 或更高版本
- **MySQL**: 8.0 或更高版本
- **操作系统**: Windows/Linux/macOS
- **内存**: 至少 2GB RAM（Playwright需要较多内存）

### 安装步骤

1. **克隆项目**
```bash
cd agri-gateway-release
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，填写正确的数据库配置和密钥
```

4. **初始化数据库**
```bash
# 确保MySQL服务已启动
# 首次运行会自动创建表和初始数据
node index.js
```

5. **启动服务**
```bash
npm start
# 或
node index.js
```

6. **访问应用**
- 管理后台: http://localhost:3001
- 农户端: http://localhost:3001/farmer

### 环境变量配置 (.env)

```env
# 服务器配置
PORT=3001

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=agri_gateway

# Token密钥（请修改为随机字符串）
TOKEN_SECRET=your_secret_key_here

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 农户账号（可选）
FARMER_USERNAME=farmer
FARMER_PASSWORD=farmer123

# 云途安API配置
YUNTINAN_API_URL=https://api.yuntinan.com
YUNTINAN_API_KEY=your_api_key

# 旧供应商配置
OLD_SUPPLIER_USERNAME=your_username
OLD_SUPPLIER_PASSWORD=your_password
```

### 生产环境建议

1. **使用PM2管理进程**
```bash
npm install -g pm2
pm2 start index.js --name agri-gateway
pm2 save
pm2 startup
```

2. **配置Nginx反向代理**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **数据库备份**
```bash
# 每天凌晨1点备份数据库
0 1 * * * mysqldump -u root -p agri_gateway > /backup/agri_gateway_$(date +\%Y\%m\%d).sql
```

4. **日志管理**
- 建议使用 `winston` 或 `pino` 进行日志管理
- 配置日志轮转，避免日志文件过大

---

## 测试报告

### 自动化测试结果

**测试时间**: 2026-04-18  
**测试脚本**: `test-all-features.js`  
**总测试数**: 21  
**通过**: 21 ✅  
**失败**: 0 ❌  
**通过率**: **100%** 🎉

### 测试覆盖范围

1. ✅ **系统健康检查**
   - API健康检查

2. ✅ **认证和权限系统**
   - 超管登录
   - 农户登录
   - 超管获取管理员列表
   - 未授权访问拒绝

3. ✅ **数据同步功能**
   - 查询云途安统计
   - 查询作业记录（分页）
   - 查询作业记录统计
   - 查询云途安设备列表
   - 查询旧供应商设备列表

4. ✅ **旧供应商API同步**
   - 查询旧供应商设备列表
   - 查询旧供应商统计

5. ✅ **设备管理功能**
   - 获取合作社列表
   - 获取农户列表
   - 查询设备列表（含作业类型）

6. ✅ **数据修复管理**
   - 查询单条作业记录详情（含UTC时间转换验证）

7. ✅ **数据导出功能**
   - 导出预览（农业汇总）
   - 查询全量作业记录
   - 查询云途安作业类型

8. ✅ **作业类型配置**
   - 查询农户统计数据（带orgId）
   - 查询设备列表（含作业类型）

### 手动测试建议

虽然自动化测试已通过，但建议定期手动测试以下场景：

1. **数据同步验证**
   - 手动触发云途安同步，检查是否成功
   - 手动触发旧供应商抓取，检查Excel解析
   - 验证昨天数据是否正确同步

2. **数据修复功能**
   - 编辑作业记录，修改作业类型
   - 批量设置合作社
   - 导出数据并验证Excel格式

3. **权限控制**
   - 使用不同角色登录，验证权限隔离
   - 尝试越权访问，确认被拒绝

4. **性能测试**
   - 大数据量下的查询响应时间
   - 导出大量数据的性能
   - 并发访问的稳定性

---

## 已知问题和注意事项

### ⚠️ 已知问题

1. **UTC时间显示**
   - **问题**: 数据库存储UTC时间，可能导致日期显示偏差
   - **解决**: 已在后端实现UTC到本地时间的转换（+8小时）
   - **状态**: ✅ 已修复

2. **作业类型编辑**
   - **问题**: 修复页面编辑对话框中作业类型字段为只读
   - **解决**: 已改为下拉框，支持编辑
   - **状态**: ✅ 已修复

3. **旧供应商数据源筛选**
   - **问题**: 选择"旧供应商"数据源时查询无结果
   - **原因**: 数据库中旧供应商数据标识为 `old_api`，前端传递 `old`
   - **解决**: 查询时兼容 `old` 和 `old_api` 两种标识
   - **状态**: ✅ 已修复

4. **导出接口不一致**
   - **问题**: 导出功能使用了错误的API接口
   - **解决**: 统一使用 `/api/export/all-records` 接口
   - **状态**: ✅ 已修复

### 💡 注意事项

1. **数据库时区**
   - MySQL默认使用UTC时间
   - 应用层负责时区转换
   - 不要直接在前端处理UTC时间

2. **Token安全**
   - `TOKEN_SECRET` 必须设置为强随机字符串
   - 不要将 `.env` 文件提交到Git
   - 定期更换Token密钥

3. **Playwright依赖**
   - 旧供应商抓取依赖Playwright
   - 首次使用需要安装浏览器：`npx playwright install`
   - 确保服务器有足够的内存（建议4GB+）

4. **数据去重**
   - 作业记录表有唯一索引：`(t_number, work_date, work_type_name)`
   - 同步时会自动跳过重复数据
   - 如需重新同步，先删除旧数据

5. **文件上传限制**
   - 最大文件大小：50MB
   - 支持的Excel格式：.xlsx, .xls
   - 上传文件保存在 `uploads/` 目录

6. **定时任务冲突**
   - 三个定时任务分别在不同时间执行（2:00, 3:00, 4:00）
   - 避免同时执行导致数据库压力过大
   - 可根据实际情况调整Cron表达式

7. **备份策略**
   - 建议每天备份数据库
   - 重要操作前先备份数据
   - 保留最近7天的备份文件

8. **性能优化**
   - 大数据量查询时使用分页
   - 为常用查询字段添加索引
   - 定期清理过期日志数据

### 🔧 维护建议

1. **定期检查**
   - 每周检查同步日志，确认数据正常同步
   - 每月检查数据库大小，清理无用数据
   - 每季度审查权限设置，移除离职人员账号

2. **监控告警**
   - 监控服务器CPU、内存使用率
   - 监控数据库连接数
   - 设置定时任务失败告警

3. **版本升级**
   - 定期更新Node.js依赖包
   - 关注安全漏洞公告
   - 升级前在测试环境验证

---

## 附录

### 常用命令

```bash
# 启动服务
npm start

# 开发模式（热重载）
npm run dev

# 运行测试
node test-all-features.js

# 安装Playwright浏览器
npx playwright install

# 数据库备份
mysqldump -u root -p agri_gateway > backup.sql

# 数据库恢复
mysql -u root -p agri_gateway < backup.sql
```

### 常见问题排查

#### 1. 服务无法启动
```bash
# 检查端口是否被占用
netstat -ano | findstr :3001

# 检查数据库连接
mysql -u root -p -e "SHOW DATABASES;"

# 查看详细错误日志
node index.js 2>&1 | tee error.log
```

#### 2. 数据同步失败
```bash
# 检查定时任务状态
# 查看 logs 目录下的日志文件

# 手动触发同步测试
curl -X POST http://localhost:3001/api/sync/yuntinan

# 检查数据库连接
mysql -u root -p agri_gateway -e "SELECT COUNT(*) FROM work_records;"
```

#### 3. 前端页面空白
```bash
# 检查浏览器控制台错误
# 检查API是否正常
curl http://localhost:3001/api/health

# 清除浏览器缓存
# Ctrl+F5 强制刷新
```

### 联系与支持

- **项目仓库**: [GitHub Repository]
- **问题反馈**: [Issues]
- **文档更新**: 每次重大变更后更新本文档

---

**文档版本**: 1.0  
**最后更新**: 2026-04-18  
**维护者**: 开发团队

---

*© 2026 农机定位聚合平台. All rights reserved.*
