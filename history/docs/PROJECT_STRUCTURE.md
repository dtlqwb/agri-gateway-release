# 项目结构说明

> 本文档说明项目的目录结构和各模块职责，便于快速理解和维护。

---

## 📁 目录概览

```
agri-gateway-release/
├── index.js                    # ⭐ 主服务入口
├── package.json                # 依赖配置
├── .env                        # 环境配置（不提交git）
│
├── services/                   # 🔧 核心服务层
│   ├── db.js                  # 数据库服务
│   ├── yunTinanService.js     # 云途安API
│   ├── oldSupplierService.js  # 旧供应商API（北斗设备）
│   ├── excelImport.js         # Excel导入
│   └── workRecordsService.js  # 作业记录服务
│
├── public/                     # 🌐 前端页面
│   ├── index.html             # 管理后台主页
│   ├── farmer.html            # 农户端
│   ├── admin-manage.html      # 管理员管理
│   ├── work-type-config.html  # 作业类型配置
│   └── old-api-manage.html    # 旧API管理
│
├── scripts/                    # 🛠️ 运维脚本
│   └── sync-beidou-range.js   # 北斗数据同步
│
├── config/                     # 配置文件
├── templates/                  # 模板文件
├── uploads/                    # 上传目录
│
└── history/                    # 📦 历史归档
    ├── docs/                  # 历史文档
    ├── scripts/               # 历史脚本
    └── deprecated/            # 废弃代码
```

---

## 🔧 核心模块说明

### 1. index.js - 主服务入口

**职责**：
- Express服务器启动
- 路由定义
- 中间件配置
- 定时任务调度

**主要路由**：
- `/api/*` - API接口
- `/farmer/*` - 农户端接口
- `/admin/*` - 管理端接口

**文件大小**: 55.2KB  
**优化建议**: 拆分为routes/目录下的多个文件

---

### 2. services/db.js - 数据库服务

**职责**：
- MySQL连接管理
- 通用查询方法（queryOne, queryAll, runSql）
- 数据表初始化
- 数据修复功能
- 导出workRecordsService的方法

**主要功能**：
```javascript
// 连接管理
await db.init()
await db.close()

// 查询
await db.queryOne(sql, params)
await db.queryAll(sql, params)
await db.runSql(sql, params)

// 业务方法
await db.repairAcreData()
await db.repairMachineData()
await db.getFarmerList()
// ... 更多方法见workRecordsService.js
```

**文件大小**: 71.0KB  
**优化建议**: 拆分为connection、queries、migrations等模块

---

### 3. services/yunTinanService.js - 云途安API服务

**职责**：
- 调用云途安API获取农机数据
- 数据解析和转换
- 同步到本地数据库

**主要方法**：
```javascript
// 同步数据
await yt.syncDayData(date)
await yt.syncRangeData(startDate, endDate)

// 查询数据
await yt.getWorkRecords(orgId, date)
await yt.getStats(orgId)
```

**文件大小**: 20.2KB  
**状态**: ✅ 稳定运行

---

### 4. services/oldSupplierService.js - 旧供应商API服务

**职责**：
- 调用北斗设备API获取作业面积数据
- 设备映射管理
- 数据同步到work_records表

**主要方法**：
```javascript
// 检查是否启用
if (!oldService.enabled) { ... }

// 同步数据
await oldService.syncDayData(date)

// 设备管理
await oldService.importDeviceMapping(csvPath)
```

**API配置**（.env）：
```env
ENABLE_OLD_SYNC=true
OLD_API_BASE=http://60.188.243.23:28111
OLD_API_USER=2dd7d00ac0ac421caa398f47c65cee6b
OLD_API_KEY=998c50f71d4740a79d11d0101f196f8f
```

**文件大小**: 11.9KB  
**状态**: ✅ 已修复API调用问题

---

### 5. services/excelImport.js - Excel导入服务

**职责**：
- 解析Excel文件
- 导入作业记录
- 导入设备信息

**主要方法**：
```javascript
// 导入作业记录
await excelImport.importWorkRecords(filePath, source)

// 导入设备
await excelImport.importMachines(filePath)
```

**文件大小**: 11.3KB  
**状态**: ✅ 正常使用

---

### 6. services/workRecordsService.js - 作业记录服务

**职责**：
- 提供作业记录相关的数据库操作方法
- 通过db.js的展开语法导出

**注意**：
- 该模块不是独立引用的
- 在db.js中通过 `...require('./workRecordsService')` 导出
- 使用时直接调用 `db.xxx()` 即可

**主要方法**：
```javascript
// 这些方法通过db对象调用
await db.getFarmerWorkRecords(farmerId, date)
await db.getFarmerStats(farmerId)
await db.getAgriSummary(orgId, date)
// ... 更多方法
```

**文件大小**: 6.3KB  
**优化建议**: 考虑完全独立或合并到db.js

---

## 🌐 前端页面说明

### public/index.html - 管理后台主页

**功能**：
- 看板统计（今日/本月/本年作业面积）
- 合作社管理
- 设备管理
- 数据同步控制
- Excel导入

**技术栈**：
- Vue 3 (CDN)
- Element Plus (CDN)
- ECharts (图表)

**文件大小**: 112.6KB  
**优化建议**: 分离CSS和JS，考虑组件化

---

### public/farmer.html - 农户端

**功能**：
- 农户登录
- 查看个人设备
- 查看作业记录
- 查看统计数据

**特点**：
- 简化界面，适合农户使用
- 支持设备作业类型显示

**文件大小**: 29.0KB

---

### public/admin-manage.html - 管理员管理

**功能**：
- 管理员列表
- 添加/编辑/删除管理员
- 权限管理

**文件大小**: 11.5KB

---

### public/work-type-config.html - 作业类型配置

**功能**：
- 为设备配置作业类型（耕/种/管/收/其他）
- 批量配置
- 按日期范围配置

**文件大小**: 17.7KB

---

### public/old-api-manage.html - 旧API管理

**功能**：
- 查看北斗设备列表
- 手动触发数据同步
- 查看同步日志

**文件大小**: 17.4KB

---

## 🛠️ 运维脚本

### scripts/sync-beidou-range.js - 北斗数据同步

**用途**：首次全量同步北斗设备数据

**执行方式**：
```bash
node scripts/sync-beidou-range.js
```

**功能**：
- 自动计算日期范围（4月1日到昨天）
- 逐天同步73台设备的数据
- 显示进度和统计信息
- 支持Ctrl+C中断

**输出示例**：
```
========== 开始同步北斗设备数据 ==========
[日期范围] 2026-04-01 至 2026-04-15
[总天数] 15 天

[6.7%] 正在同步: 2026-04-01 (1/15)
  ✅ 该日期有数据: 5 台设备, 总面积 123.45 亩

========== 同步完成统计 ==========
[总天数] 15 天
[有数据的天数] 8 天
[成功同步] 365 条记录
[总面积] 1234.56 亩
```

---

### scripts/import-beidou-devices.js - 设备导入

**用途**：从CSV文件导入设备映射表

**状态**：⚠️ 已完成（73台设备已导入）

**建议**：可移动到history/scripts/

---

## 📦 历史归档（history/）

### history/docs/ - 历史文档

包含所有开发文档、测试报告、功能说明等18个文件。

**保留原因**：
- 供后续开发参考
- 了解历史决策背景
- 避免重复工作

---

### history/scripts/ - 历史脚本

包含测试脚本、修复脚本、迁移脚本等13个文件。

**分类**：
- 测试脚本：test-*.js, debug-*.js
- 修复脚本：fix-*.js, add-work-type-*
- 迁移脚本：migrate-*.js, export-database.js
- 旧同步脚本：sync-beidou-april.js, sync-beidou-yearly.js

---

### history/deprecated/ - 废弃代码

**包含**：
- oldSupplierCrawler.js - Playwright爬虫（已被API替代）
- excelParser.js - 旧Excel解析器（已被excelImport.js替代）
- data-repair.html - 旧数据修复页面
- data-repair-work.html - 旧作业记录修复页面

**保留原因**：
- 可能需要参考实现
- 紧急情况下可恢复

---

## 🎯 快速上手

### 启动服务

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑.env文件，配置数据库和API密钥

# 3. 启动服务
node index.js

# 4. 访问页面
# 管理后台: http://localhost:3000
# 农户端: http://localhost:3000/farmer.html
```

### 同步北斗数据

```bash
# 首次同步（4月1日到昨天）
node scripts/sync-beidou-range.js

# 之后每天自动同步（由定时任务执行）
```

### 导入Excel数据

```bash
# 通过管理后台上传Excel文件
# 或使用API接口
POST /api/import/excel
```

---

## 📊 项目统计

| 指标 | 数值 |
|------|------|
| 核心服务模块 | 5个 |
| 前端页面 | 5个 |
| 运维脚本 | 2个（活跃） |
| 历史归档文件 | 35个 |
| 总代码量 | ~200KB |
| 最大单文件 | db.js (71.0KB) |

---

## 🔗 相关文档

- [README.md](./README.md) - 项目说明
- [交付清单.md](./交付清单.md) - 交付内容
- [快速上手指南.md](./快速上手指南.md) - 快速开始
- [项目整理报告.md](./项目整理报告.md) - 详细整理报告

---

**最后更新**: 2026-04-16
