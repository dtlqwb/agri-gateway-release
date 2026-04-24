# 农机定位数据聚合平台

## 项目说明
本项目是一个农机作业数据聚合平台，整合多个供应商的数据源，提供统一的数据管理和查询服务。

## 技术栈
- **后端**: Node.js + Express
- **数据库**: MySQL 8.0
- **前端**: 原生 HTML + JavaScript

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
编辑 `.env` 文件，配置数据库连接信息：
```
# MySQL 数据库配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=agri_gateway

# 服务端口
PORT=3001

# 云途安（新供应商）配置
YT_API_BASE=https://ss.yuntinan.com/prod-api
YT_USERNAME=alqx
YT_PASSWORD=173135
```

### 3. 创建数据库
```sql
CREATE DATABASE agri_gateway DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 数据库迁移（重要）

**如果是旧数据库（已有数据），必须先执行迁移：**
```bash
node migrate_add_api_id.js
```

该脚本会：
- 添加 `api_id` 字段到 `work_records` 表
- 添加 `idx_api_id` 索引
- 重命名唯一索引
- 清理空字符串的 `api_id`

**如果是全新数据库，此步骤可跳过**（启动时会自动创建正确的表结构）。

### 5. 启动服务
```bash
node index.js
```

### 6. 访问系统
打开浏览器访问：http://localhost:3001

## 目录结构
```
├── .env                    # 环境配置（不提交git）
├── .env.example            # 环境配置模板
├── index.js                # 主程序入口
├── package.json            # 项目依赖
│
├── services/               # 🔧 核心服务层
│   ├── db.js               # 数据库服务（71KB）
│   ├── yunTinanService.js  # 云途安API服务
│   ├── oldSupplierService.js # 旧供应商API服务（北斗设备）
│   ├── excelImport.js      # Excel导入服务
│   └── workRecordsService.js # 作业记录服务（通过db.js导出）
│
├── public/                 # 🌐 前端页面
│   ├── index.html          # 管理后台主页
│   ├── farmer.html         # 农户端
│   ├── admin-manage.html   # 管理员管理
│   ├── work-type-config.html # 作业类型配置
│   └── old-api-manage.html # 旧API管理
│
├── scripts/                # 🛠️ 运维脚本
│   └── sync-beidou-range.js # 北斗数据同步（4月1日-昨天）
│
├── config/                 # 配置文件
├── templates/              # Excel模板
├── uploads/                # 上传目录
│
└── history/                # 📦 历史归档
    ├── docs/              # 历史文档（18个文件）
    ├── scripts/           # 历史脚本（13个文件）
    └── deprecated/        # 废弃代码（4个文件）
```

**📄 详细文档**：
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 项目结构详细说明
- [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md) - 优化路线图
- [项目整理报告.md](./项目整理报告.md) - 完整整理报告

## 功能模块

### 1. 数据同步
- 自动同步云途安作业数据（每2小时）
- 支持手动触发同步
- 自动去重和增量更新

### 2. 权限管理
- **超级管理员**: 所有权限
- **农业局**: 查看+导出+数据修复
- **普通管理员**: 仅查看

### 3. 数据管理
- 作业记录查询（按时间、合作社、设备号筛选）
- 数据编辑和批量操作
- 全量数据导出

### 4. 农户查询
- 农户信息查询（按姓名、电话、合作社）
- 作业面积统计
- 设备轨迹查询

## 默认管理员账号
- 用户名: `admin`
- 密码: `admin123`

**⚠️ 首次登录后请立即修改密码！**

## 常见问题

### 数据库连接失败
- 确认 MySQL 服务已启动
- 检查 `.env` 中的数据库配置
- 确认数据库已创建

### 同步失败
- 检查云途安账号密码是否正确
- 确认服务器网络可访问云途安API
- 查看控制台日志获取详细错误信息

### 端口被占用
修改 `.env` 中的 `PORT` 配置项

## 技术支持
如有问题，请联系开发团队。
