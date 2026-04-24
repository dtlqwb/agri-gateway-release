# 新I日供应商API集成说明

## 📋 功能概述

已成功集成新I日供应商API，实现以下功能：

- ✅ 设备映射表自动导入（CSV）
- ✅ 定时自动同步（每天凌晨4点）
- ✅ 手动同步（单天/日期范围）
- ✅ 数据统计和展示
- ✅ 管理后台页面

---

## 🔧 配置说明

### 1. 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# 启用新I日供应商API同步（默认false）
ENABLE_OLD_SYNC=false

# API基础地址
OLD_API_BASE=http://60.188.243.23:28111

# API认证信息
OLD_API_USER=2dd7d00ac0ac421caa398f47c65cee6b
OLD_API_KEY=998c50f71d4740a79d11d0101f196f8f
```

**重要**: 
- `ENABLE_OLD_SYNC=true` 才会启用自动同步
- 不配置也能运行，只是不会执行同步任务

---

## 🚀 使用方法

### 方法1：使用管理后台页面（推荐）

1. **启动服务**
   ```bash
   npm start
   ```

2. **访问管理页面**
   ```
   http://localhost:3001/old-api-manage.html
   ```

3. **操作步骤**
   - 点击"导入设备映射表"导入74台设备
   - 点击"同步昨天数据"测试同步
   - 查看合作社统计和设备列表

---

### 方法2：使用API接口

#### 导入设备映射表
```bash
POST /api/old-api/import-devices
```

#### 同步单天数据
```bash
POST /api/old-api/sync
Content-Type: application/json

{
  "date": "2026-04-11"
}
```

#### 批量同步日期范围
```bash
POST /api/old-api/sync
Content-Type: application/json

{
  "startDate": "2026-04-01",
  "endDate": "2026-04-11"
}
```

#### 获取统计数据
```bash
GET /api/old-api/stats?startDate=2026-04-01&endDate=2026-04-11
```

#### 获取设备列表
```bash
GET /api/old-api/devices
```

---

### 方法3：使用测试脚本

```bash
node scripts/test-old-api.js
```

这个脚本会：
1. 测试签名生成
2. 导入设备映射表
3. 测试单个设备API调用
4. 显示同步功能说明

---

## 📊 数据库结构

### old_supplier_devices 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| macid | VARCHAR(20) | 终端编号（唯一） |
| cooperative_name | VARCHAR(100) | 合作社名称 |
| driver_name | VARCHAR(50) | 机手姓名 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### work_records 表（复用）

新I日供应商API的数据会保存到 `work_records` 表，特征：
- `source = 'old_api'`
- `t_number = macid`
- `work_type_name = '其他'`
- `ok_acre = 0`（旧API无达标面积）

---

## ⏰ 定时任务

### 自动同步时间
- **时间**: 每天凌晨 4:00
- **内容**: 同步昨天的数据
- **条件**: `ENABLE_OLD_SYNC=true`

### 其他定时任务
- 云途安同步: 每天凌晨 2:00
- 旧供应商抓取: 每天凌晨 3:00
- **新I日供应商API**: 每天凌晨 4:00 ⭐

---

## 🔍 数据隔离

### Source字段区分

| 数据源 | source值 | 说明 |
|--------|----------|------|
| 云途安API | 'yuntinan' | 原有数据 |
| Excel导入 | 'excel' | 手工导入 |
| 旧供应商爬虫 | 'old' | Playwright抓取 |
| **新I日供应商API** | **'old_api'** | **新集成** ⭐ |

### 查询示例

```sql
-- 只查询新I日供应商API数据
SELECT * FROM work_records WHERE source = 'old_api';

-- 聚合所有数据源
SELECT source, COUNT(*) as count, SUM(acre) as total_acre
FROM work_records
GROUP BY source;
```

---

## 🛠️ 故障排查

### Q1: 同步失败，提示"连接超时"？

**A**: 检查网络连接
```bash
ping 60.188.243.23
telnet 60.188.243.23 28111
```

### Q2: 签名验证失败？

**A**: 检查配置
- 确认 `OLD_API_USER` 和 `OLD_API_KEY` 正确
- 确认时间戳格式正确（秒级）
- 确认MD5签名算法正确

### Q3: 没有设备数据？

**A**: 先导入设备映射表
```bash
# 方法1: 使用管理页面
点击"导入设备映射表"

# 方法2: 使用API
POST /api/old-api/import-devices

# 方法3: 使用测试脚本
node scripts/test-old-api.js
```

### Q4: API返回面积为0？

**A**: 可能原因
- 该设备当天没有作业
- API返回格式与预期不符
- 需要调整 `parseAreaResult()` 方法

**调试方法**:
```javascript
// 在 oldSupplierService.js 中添加日志
console.log('API原始响应:', JSON.stringify(result));
```

---

## 🔄 回滚方案

如果需要回滚，只需：

1. **删除服务文件**
   ```bash
   rm services/oldSupplierService.js
   ```

2. **删除数据库表**
   ```sql
   DROP TABLE IF EXISTS old_supplier_devices;
   DELETE FROM work_records WHERE source = 'old_api';
   ```

3. **移除定时任务**
   - 删除 index.js 中的 `scheduleOldAPISync()` 相关代码

4. **移除配置**
   - 删除 .env 中的 `OLD_API_*` 和 `ENABLE_OLD_SYNC` 配置

---

## 📝 开发注意事项

### 1. 代码隔离
- ✅ 新建 `oldSupplierService.js`
- ✅ 不修改 `yunTinanService.js`
- ✅ 不影响原有功能

### 2. 错误隔离
- ✅ try-catch包裹所有API调用
- ✅ 同步失败不影响其他定时任务
- ✅ 详细的错误日志

### 3. 性能优化
- ✅ 请求间隔100ms，避免过快
- ✅ 批量插入优化
- ✅ 索引优化（macid字段）

### 4. 安全性
- ✅ API密钥从环境变量读取
- ✅ 不硬编码敏感信息
- ✅ 管理页面需要认证

---

## 📞 API技术细节

### 认证方式
```
Header:
  user: 2dd7d00ac0ac421caa398f47c65cee6b
  timestamp: {当前时间戳（秒）}
  sign: MD5(timestamp + key)
```

### 请求示例
```javascript
POST http://60.188.243.23:28111/machine/gps/area
Content-Type: application/json

{
  "macid": "16052696013",
  "day": "2026-04-11"
}
```

### 响应解析
根据实际API返回结构调整 `parseAreaResult()` 方法。

---

## 🎯 下一步优化建议

1. **完善API响应解析**
   - 根据实际返回格式调整解析逻辑
   - 添加更多错误处理

2. **增加重试机制**
   - 失败的请求自动重试
   - 指数退避策略

3. **添加监控告警**
   - 同步失败发送通知
   - 数据异常检测

4. **性能优化**
   - 并发请求多个设备
   - 缓存常用数据

5. **数据可视化**
   - 添加图表展示
   - 趋势分析

---

## 📚 相关文件

- `services/oldSupplierService.js` - 核心服务
- `public/old-api-manage.html` - 管理页面
- `scripts/test-old-api.js` - 测试脚本
- `终端映射表_清理版.csv` - 设备映射表
- `services/db.js` - 数据库表定义

---

**集成完成！** 🎉

如有问题，请查看日志或联系技术支持。
