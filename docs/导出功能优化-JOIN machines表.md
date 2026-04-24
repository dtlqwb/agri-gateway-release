# 导出功能优化 - JOIN machines表获取真实合作社名

**修改时间**: 2026-04-18  
**修改原因**: 导出的数据中，云途安设备的合作社名称显示为"云途安"，而不是真实的合作社名称  
**修改文件**: `services/db.js`

---

## 📋 问题分析

### 问题现象
导出Excel时，云途安设备的 `org_name` 字段显示为 "云途安"，而不是设备实际所属的合作社名称。

### 根本原因
`work_records` 表中存储的 `org_name` 是API返回的原始值（"云途安"），而真实的合作社名称存储在 `machines` 表的 `org_name` 字段中。

### 影响范围
- ❌ 全量导出 (`getExportRecordsAll`)
- ❌ 农户页面查询 (`getAllWorkRecords`)
- ✅ 不影响其他功能

---

## ✅ 修改方案

### 核心思路
使用 `LEFT JOIN machines` 表，通过 `t_number` 关联，获取真实的合作社名称、车牌号和机手姓名。

### 优先级规则
```sql
CASE 
  WHEN w.org_name = '云途安' OR w.org_name IS NULL OR w.org_name = '' 
  THEN m.org_name  -- 使用machines表的真实合作社名
  ELSE w.org_name   -- 否则使用work_records中的值（旧供应商数据）
END as org_name
```

---

## 🔧 具体修改

### 修改1: getExportRecordsAll (全量导出)

**位置**: `services/db.js` 第1920行

#### 修改前
```sql
SELECT work_date, work_type, work_type_name, t_number, plate_no,
       driver_name, org_name, acre, ok_acre, duration as work_duration, source
FROM work_records WHERE 1=1
```

#### 修改后
```sql
SELECT w.work_date, w.work_type, w.work_type_name, w.t_number,
       COALESCE(w.plate_no, m.plate_no) as plate_no,
       COALESCE(w.driver_name, m.driver_name) as driver_name,
       CASE WHEN w.org_name = '云途安' OR w.org_name IS NULL OR w.org_name = ''
            THEN m.org_name ELSE w.org_name END as org_name,
       w.acre, w.ok_acre, w.duration as work_duration, w.source
FROM work_records w
LEFT JOIN machines m ON w.t_number = m.t_number AND m.source = 'yuntinan'
WHERE 1=1
```

**关键变化**:
1. ✅ 添加表别名 `w` 和 `m`
2. ✅ 使用 `COALESCE` 优先使用 work_records 的值，为空时用 machines 的值
3. ✅ 使用 `CASE WHEN` 处理 org_name，避免显示"云途安"
4. ✅ 添加 `LEFT JOIN machines`，条件包含 `m.source = 'yuntinan'`
5. ✅ 所有字段引用都加上表别名前缀

---

### 修改2: getAllWorkRecords (农户页面查询)

**位置**: `services/db.js` 第1279行

#### 修改前
```sql
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
WHERE wr.source IN (...)
```

#### 修改后
```sql
SELECT 
  wr.t_number,
  wr.work_date,
  wr.work_type_name,
  wr.acre,
  wr.ok_acre,
  COALESCE(wr.plate_no, m.plate_no) as plate_no,
  COALESCE(wr.driver_name, m.driver_name) as driver_name,
  CASE WHEN wr.org_name = '云途安' OR wr.org_name IS NULL OR wr.org_name = ''
       THEN m.org_name ELSE wr.org_name END as org_name,
  wr.source,
  '原始' as data_status,
  '' as remark,
  wr.created_at as updated_at
FROM work_records wr
LEFT JOIN machines m ON wr.t_number = m.t_number AND m.source = 'yuntinan'
WHERE wr.source IN (...)
```

**关键变化**:
1. ✅ 同样使用 `COALESCE` 和 `CASE WHEN` 逻辑
2. ✅ 添加 `LEFT JOIN machines`
3. ✅ ORDER BY 中使用 `org_name` 而不是 `wr.org_name`

---

## 📊 效果对比

### 修改前
| t_number | org_name | plate_no | driver_name |
|----------|----------|----------|-------------|
| 863998043804831 | 云途安 | | |
| 863998043804435 | 云途安 | | |

### 修改后
| t_number | org_name | plate_no | driver_name |
|----------|----------|----------|-------------|
| 863998043804831 | 灵丘县柳科乡下彭庄村... | 晋B12345 | 张三 |
| 863998043804435 | 灵丘县良昇仓种养专业... | 晋B67890 | 李四 |

---

## 🎯 技术细节

### 1. LEFT JOIN vs INNER JOIN
使用 `LEFT JOIN` 而不是 `INNER JOIN` 的原因：
- ✅ 保留所有作业记录，即使没有对应的设备信息
- ✅ 旧供应商数据可能不在 machines 表中，但也要显示
- ✅ 如果JOIN失败，COALESCE会使用原值

### 2. JOIN 条件
```sql
LEFT JOIN machines m ON wr.t_number = m.t_number AND m.source = 'yuntinan'
```
- 只JOIN云途安设备（`m.source = 'yuntinan'`）
- 避免与旧供应商设备混淆

### 3. COALESCE 函数
```sql
COALESCE(wr.plate_no, m.plate_no) as plate_no
```
- 如果 `wr.plate_no` 不为NULL，使用它
- 否则使用 `m.plate_no`
- 确保有值显示

### 4. CASE WHEN 逻辑
```sql
CASE 
  WHEN w.org_name = '云途安' OR w.org_name IS NULL OR w.org_name = '' 
  THEN m.org_name 
  ELSE w.org_name 
END as org_name
```
- 明确排除 "云途安" 这个占位符
- 处理 NULL 和空字符串
- 保留旧供应商的真实合作社名

---

## 🧪 测试验证

### 测试1: 全量导出
1. 登录系统
2. 进入"数据管理" → "全量导出"
3. 点击"导出Excel"
4. 打开Excel文件，检查：
   - ✅ 云途安设备的 org_name 显示真实合作社名
   - ✅ 旧供应商设备的 org_name 保持不变
   - ✅ plate_no 和 driver_name 正确填充

### 测试2: 农户页面查询
1. 使用农户账号登录
2. 查看作业记录列表
3. 检查：
   - ✅ org_name 显示真实合作社名
   - ✅ 筛选和排序正常工作

### 测试3: SQL直接验证
```sql
-- 检查云途安设备
SELECT w.t_number, w.org_name as old_org_name, m.org_name as new_org_name
FROM work_records w
LEFT JOIN machines m ON w.t_number = m.t_number AND m.source = 'yuntinan'
WHERE w.source = 'yuntinan'
LIMIT 10;

-- 应该看到 old_org_name = '云途安', new_org_name = 真实合作社名
```

---

## ⚠️ 注意事项

### 1. 性能影响
- LEFT JOIN 会增加查询复杂度
- 对于大量数据（>10万条），可能需要优化
- 建议添加索引：
  ```sql
  CREATE INDEX idx_machines_tnumber_source ON machines(t_number, source);
  ```

### 2. 数据一致性
- 确保 `machines` 表中的数据是最新的
- 如果设备信息变更，需要同步更新 `machines` 表

### 3. 向后兼容
- 修改不影响现有API接口
- 返回的字段名保持不变
- 前端无需修改

---

## 📝 相关文件

| 文件 | 作用 | 状态 |
|------|------|------|
| `services/db.js` | 数据库查询函数 | ✅ 已修改 |
| `routes/summary.js` | 调用 getExportRecordsAll | ✅ 无需修改 |
| `routes/workRecords.js` | 调用 getAllWorkRecords | ✅ 无需修改 |
| `public/index.html` | 农户页面展示 | ✅ 无需修改 |

---

## 💡 后续优化建议

### P1 - 中优先级
1. **添加索引**: 提升JOIN性能
   ```sql
   CREATE INDEX idx_work_records_tnumber ON work_records(t_number);
   CREATE INDEX idx_machines_tnumber_source ON machines(t_number, source);
   ```

2. **缓存机制**: 对于频繁查询的数据，可以考虑缓存

### P2 - 低优先级
3. **数据同步**: 定期从API同步最新的设备信息到 machines 表
4. **监控查询性能**: 记录慢查询日志

---

## ✅ 总结

**修改内容**: 在两个导出函数中添加 LEFT JOIN machines 表  
**修改目的**: 获取真实的合作社名称、车牌号和机手姓名  
**影响范围**: 全量导出、农户页面查询  
**风险评估**: 低（向后兼容，不影响现有功能）  
**性能影响**: 轻微（可通过索引优化）  

**修改完成时间**: 2026-04-18  
**下次审查时间**: 2026-05-18（检查性能和数据准确性）
