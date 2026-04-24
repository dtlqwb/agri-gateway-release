# 导出功能缺少旧设备数据修复报告

## 📋 问题描述

用户反馈：**导出的数据没有将旧设备的数据导出来**。

## 🔍 根本原因

### Source值不匹配

**数据库实际情况**:
```sql
SELECT source, COUNT(*) FROM work_records GROUP BY source;

结果:
  yuntinan: 2485 条
  old_api: 186 条    ← 旧供应商API同步的数据使用 'old_api'
```

**导出查询硬编码**:
```sql
WHERE wr.source IN ('yuntinan', 'old')  -- ❌ 缺少 'old_api'
```

### 问题分析

1. **历史遗留**: 早期CSV导入的旧设备可能使用 `'old'` 作为source
2. **当前实际**: 新I日供应商API同步的数据使用 `'old_api'` 作为source
3. **查询缺陷**: 导出查询只包含 `('yuntinan', 'old')`，遗漏了 `'old_api'`
4. **结果**: 186条旧供应商API数据无法被导出

---

## ✅ 解决方案

### 修改 getAllWorkRecords 函数

在 `services/db.js` 的原始数据查询中添加 `'old_api'` 到source列表。

**文件**: `services/db.js` (第1335行)

```javascript
// 修改前
WHERE wr.source IN ('yuntinan', 'old')

// 修改后
WHERE wr.source IN ('yuntinan', 'old', 'old_api')
```

**完整代码段** (第1319-1344行):
```javascript
// 2. 获取原始数据（排除已修复的记录）
let originalSql = `
  SELECT 
    wr.t_number,
    wr.work_date,
    wr.work_type_name,
    wr.acre,
    wr.ok_acre,
    wr.plate_no,
    wr.driver_name,
    wr.org_name,
    wr.source,
    '原始' as data_status,
    '' as remark,
    wr.created_at as updated_at
  FROM work_records wr
  WHERE wr.source IN ('yuntinan', 'old', 'old_api')  -- ✅ 添加 'old_api'
    AND NOT EXISTS (
      SELECT 1 FROM api_raw_records ar
      WHERE ar.api_t_number = wr.t_number
        AND ar.api_work_date = wr.work_date
        AND ar.api_work_type_name = wr.work_type_name
        AND ar.source = wr.source
        AND ar.status = 1
    )
`;
```

---

## 🧪 测试验证

### 1. 数据库Source分布检查

```bash
node scripts/check-export-sources.js
```

**结果**:
```
Source分布:
  yuntinan: 2485 条
  old_api: 186 条    ← 确认存在
```

### 2. 导出查询验证

```bash
node scripts/verify-export-data.js
```

**结果**:
```
导出数据分布 (2026-04-10 至 2026-04-16):
  旧供应商(API) (old_api): 141 条, 7414.00 亩  ← ✅ 包含
  云途安 (yuntinan): 880 条, 5637.87 亩

总计: 1021 条记录, 13051.87 亩

✅ 确认: 导出数据中包含旧设备数据!
   - 旧供应商(API): 141 条记录
```

### 3. API导出测试

```bash
GET /api/export/all-records?startDate=2026-04-10&endDate=2026-04-16&sources=yuntinan,old_api
```

**结果**:
```
✅ API响应成功!
状态码: 200
文件大小: 168.72 KB (Excel文件)
```

---

## 📊 修复前后对比

### 修复前

| 数据源 | 记录数 | 是否导出 |
|--------|--------|---------|
| 云途安 (yuntinan) | 880条 | ✅ 是 |
| 旧供应商 (old) | 0条 | ❌ 无数据 |
| 旧供应商API (old_api) | 141条 | ❌ **被遗漏** |
| **总计** | **880条** | - |

### 修复后

| 数据源 | 记录数 | 是否导出 |
|--------|--------|---------|
| 云途安 (yuntinan) | 880条 | ✅ 是 |
| 旧供应商 (old) | 0条 | - |
| 旧供应商API (old_api) | 141条 | ✅ **已包含** |
| **总计** | **1021条** | - |

**提升**: +141条记录 (+16%), +7414亩作业面积

---

## 💡 技术说明

### Source值的历史演变

| 时期 | 数据来源 | Source值 | 说明 |
|------|---------|----------|------|
| 早期 | CSV导入 | `'old'` | 手动导入的历史数据 |
| 当前 | API同步 | `'old_api'` | 新I日供应商API自动同步 |

### 为什么需要同时支持多个source值？

1. **向后兼容**: 保留对历史 `'old'` 数据的支持
2. **当前实际**: 支持当前使用的 `'old_api'` 数据
3. **未来扩展**: 预留其他可能的source值

### 最佳实践建议

**方案A: 动态查询所有旧供应商数据**（推荐）
```javascript
// 使用 LIKE 查询所有以 'old' 开头的source
WHERE wr.source LIKE 'old%'
```

**方案B: 明确列出所有已知source**（当前采用）
```javascript
WHERE wr.source IN ('yuntinan', 'old', 'old_api')
```

**方案C: 配置化管理**
```javascript
const OLD_SOURCES = process.env.OLD_SOURCES?.split(',') || ['old', 'old_api'];
WHERE wr.source IN (${OLD_SOURCES.map(() => '?').join(',')})
```

---

## 📝 修改文件清单

| 文件 | 修改类型 | 行数变化 | 说明 |
|------|---------|---------|------|
| `services/db.js` | 修改 | +1/-1 | 添加 'old_api' 到source列表 |
| `scripts/check-export-sources.js` | 新建 | +82 | Source分布检查脚本 |
| `scripts/verify-export-data.js` | 新建 | +49 | 导出数据验证脚本 |

---

## ✨ 总结

### 问题
导出功能无法导出旧设备数据，因为查询条件中缺少 `'old_api'` source值

### 原因
- 数据库中旧供应商API同步的数据使用 `'old_api'` 作为source
- 导出查询硬编码为 `('yuntinan', 'old')`，遗漏了 `'old_api'`

### 解决
在 `getAllWorkRecords` 函数的原始数据查询中添加 `'old_api'` 到source列表

### 结果
- ✅ 导出数据现在包含141条旧设备记录
- ✅ 新增7414亩作业面积
- ✅ 总导出记录从880条增加到1021条 (+16%)

---

**修复时间**: 2026-04-17 16:00  
**状态**: ✅ 已完成并测试通过
