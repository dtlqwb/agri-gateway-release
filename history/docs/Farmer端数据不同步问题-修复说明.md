# Farmer端数据不同步问题 - 排查与修复

## 🔍 问题描述

用户反馈：farmer端登录后看不到数据。

---

## 🐛 根本原因

### 1. 农户 org_id 不匹配

**问题**：农户表中的 `org_id` 和 `org_name` 不一致。

**示例**：
```
农户"测试农户"：
- org_id = 1
- org_name = "中野窝合作社"

但实际上：
- "中野窝合作社" 的 ID 是 5
- ID 为 1 的是 "灵丘县三里坊种养专业合作社"
```

**影响**：farmer.html 使用 `currentUser.org_id` 查询数据，导致查不到正确的数据。

---

### 2. 旧供应商API同步未设置 org_id

**问题**：旧供应商API同步数据时，只设置了 `org_name`，没有设置 `org_id`。

**原代码**：
```javascript
INSERT INTO work_records 
  (t_number, work_date, work_type_name, acre, ok_acre, 
   org_name, driver_name, source, created_at)
VALUES (?, ?, ?, ?, 0, ?, ?, 'old_api', NOW())
```

**影响**：farmer端按 `org_id` 查询时，这些记录的 `org_id=0`，查不到。

---

### 3. 部分合作社确实没有数据

**现状**：
- 合作社 ID:1（灵丘县三里坊种养专业合作社）：1907条记录 ✅
- 合作社 ID:5（中野窝合作社）：2条记录 ✅
- 合作社 ID:8（灵丘县兴农农机合作社）：0条记录 ❌
- 合作社 ID:10（灵丘县绿野农机专业合作社）：0条记录 ❌

**说明**：如果农户关联的合作社没有数据，自然看不到任何记录。

---

## ✅ 已完成的修复

### 修复1：修正农户 org_id

**脚本**：`scripts/fix-farmer-org-id.js`

**执行结果**：
```
[修复] 农户 1 (中野窝合作社): org_id 1 -> 5
```

**效果**：农户的 `org_id` 现在与 `org_name` 匹配。

---

### 修复2：旧供应商API同步时设置 org_id

**文件**：`services/oldSupplierService.js`

**修改内容**：
```javascript
// 根据合作社名称查找 org_id
let orgId = 0;
if (device.cooperative_name) {
  const org = await db.queryOne(
    `SELECT id FROM organizations WHERE name = ?`,
    [device.cooperative_name]
  );
  if (org) {
    orgId = org.id;
  }
}

// 插入时包含 org_id
INSERT INTO work_records 
  (t_number, work_date, work_type_name, acre, ok_acre, 
   org_id, org_name, driver_name, source, created_at)
VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'old_api', NOW())
```

**效果**：新同步的数据会正确设置 `org_id`。

---

## 📊 当前数据状态

### 各合作社数据量

| 合作社ID | 合作社名称 | 记录数 | 状态 |
|---------|-----------|--------|------|
| 1 | 灵丘县三里坊种养专业合作社 | 1907 | ✅ 有数据 |
| 5 | 中野窝合作社 | 2 | ✅ 有数据 |
| 8 | 灵丘县兴农农机合作社 | 0 | ⚠️ 无数据 |
| 10 | 灵丘县绿野农机专业合作社 | 0 | ⚠️ 无数据 |

### 农户关联情况

| 农户ID | 手机号 | 姓名 | org_id | 合作社名称 | 能否看到数据 |
|-------|--------|------|--------|-----------|------------|
| 1 | 13800138000 | 测试农户 | 5 | 中野窝合作社 | ✅ 能看到2条 |
| 3 | 13934760824 | 测试 | 1 | 灵丘县三里坊种养专业合作社 | ✅ 能看到1907条 |
| 4 | 13900139000 | 测试2 | 10 | 灵丘县绿野农机专业合作社 | ❌ 无数据 |
| 5 | 13700137000 | 测试3 | 8 | 灵丘县兴农农机合作社 | ❌ 无数据 |

---

## 🔧 如何验证修复

### 1. 测试农户登录

使用以下账号登录 farmer.html：

**账号1**：
- 手机号：13800138000
- 密码：123456
- 预期：看到2条记录（中野窝合作社）

**账号2**：
- 手机号：13934760824
- 密码：123456
- 预期：看到1907条记录（灵丘县三里坊种养专业合作社）

---

### 2. 检查浏览器控制台

打开 farmer.html，登录成功后：
1. 按 F12 打开开发者工具
2. 切换到 Network 标签
3. 查看 API 请求：
   - `/api/farmer/stats?orgId=X`
   - `/api/farmer/records?orgId=X`
4. 检查返回的数据是否正确

---

### 3. 直接查询数据库

```sql
-- 查看某个合作社的数据
SELECT COUNT(*) as cnt 
FROM work_records 
WHERE org_id = 1;  -- 替换为实际的 org_id

-- 查看农户信息
SELECT id, phone, name, org_id, org_name 
FROM farmers;
```

---

## 💡 解决方案

### 对于没有数据的合作社

如果农户关联的合作社没有数据，有以下解决方案：

#### 方案1：等待数据同步
- 旧供应商API定时同步（凌晨4点）
- 或手动触发同步

#### 方案2：重新分配农户到有其他数据的合作社
```sql
UPDATE farmers 
SET org_id = 1, org_name = '灵丘县三里坊种养专业合作社'
WHERE id = 4;  -- 替换为实际农户ID
```

#### 方案3：为该合作社添加设备并同步数据
1. 在 `old_supplier_devices` 表中添加设备
2. 设置设备的 `cooperative_name` 为该合作社名称
3. 触发数据同步

---

## 📝 相关脚本

### 1. 修复农户 org_id
```bash
node scripts/fix-farmer-org-id.js
```

### 2. 修复旧数据 org_id（如果需要）
```bash
node scripts/fix-old-api-org-id.js
```

### 3. 检查各合作社数据量
```bash
node scripts/check-org-data.js
```

---

## ⚠️ 注意事项

1. **历史数据不会自动更新**
   - 修复只影响新同步的数据
   - 旧数据需要使用 SQL 脚本手动修复

2. **org_id 和 org_name 必须匹配**
   - 添加新农户时，确保两者一致
   - 建议在管理端添加校验逻辑

3. **数据源统一**
   - 目前只有云途安数据（source='yuntinan'）
   - 旧供应商API数据需要先导入设备映射表并启用同步

---

## 🎯 后续优化建议

1. **添加数据校验**
   - 在创建/更新农户时，校验 org_id 和 org_name 是否匹配
   
2. **添加友好提示**
   - farmer.html 中，如果查询结果为空，显示"该合作社暂无数据"
   
3. **支持多数据源**
   - farmer端可以同时查看云途安和旧供应商API的数据
   - 修改查询条件：`WHERE org_id = ? OR org_name = ?`

---

**修复日期**：2026-04-15  
**状态**：✅ 核心问题已修复
