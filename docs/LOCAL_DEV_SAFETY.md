# 本地开发安全指南

## ⚠️ 重要提醒

**当前配置：本地和云端共享同一个数据库！**

这意味着你在本地的所有数据操作都会**直接影响生产环境**。

---

## 🛡️ 安全防护措施

### 1. 已禁用的功能（本地开发）

✅ **定时任务已自动禁用**
- 云途安自动同步任务 - 已禁用
- 旧供应商爬虫任务 - 已禁用  
- 旧供应商API同步任务 - 已禁用

**原因**：云端服务器已经有定时任务在运行，本地再运行会导致：
- 重复插入数据
- 数据冲突
- 不必要的API调用

**配置位置**：`.env` 文件中的 `ENABLE_SCHEDULER=false`

---

## 🚫 禁止的操作

### 绝对不要做的操作

1. **❌ 删除数据**
   ```javascript
   // 禁止！这会删除生产数据
   DELETE FROM work_records WHERE ...
   DROP TABLE work_records
   TRUNCATE TABLE machines
   ```

2. **❌ 批量更新数据**
   ```javascript
   // 禁止！会影响所有用户看到的数据
   UPDATE work_records SET acre = 0
   UPDATE machines SET org_id = NULL
   ```

3. **❌ 运行数据修复脚本**
   ```bash
   # 禁止在本地运行这些脚本
   node fix-duplicates.js
   node scripts/sync-and-verify.js
   node check-missing-device.js
   ```

4. **❌ 清空数据库**
   ```bash
   # 绝对禁止！
   mysqldump --no-data ... | mysql ...  # 会清空数据
   ```

5. **❌ 手动触发同步**
   ```javascript
   // 禁止手动调用同步函数
   await yunTinanService.syncAllWorkRecords()
   await oldSupplierService.syncDateRange(...)
   ```

---

## ✅ 安全的操作

### 可以安全进行的操作

1. **✅ 查询数据**
   ```javascript
   // 安全：只读操作
   SELECT * FROM work_records WHERE ...
   SELECT COUNT(*) FROM machines
   ```

2. **✅ 前端开发**
   - 修改 HTML/CSS/JavaScript
   - 调整页面布局
   - 优化用户体验

3. **✅ API测试（GET请求）**
   ```bash
   # 安全：只读API
   curl http://localhost:3000/api/agri/summary
   curl http://localhost:3000/api/machines
   curl http://localhost:3000/api/organizations
   ```

4. **✅ 代码调试**
   - 添加 console.log
   - 设置断点
   - 查看变量值

5. **✅ 性能测试**
   - 测试页面加载速度
   - 测试API响应时间
   - 分析查询性能

---

## 🧪 如何安全地测试写入操作

如果确实需要测试写入功能，请遵循以下步骤：

### 方法1：使用事务（推荐）

```javascript
const connection = await db.getConnection();
try {
  await connection.beginTransaction();
  
  // 执行测试操作
  await connection.query('INSERT INTO test_table ...');
  await connection.query('UPDATE work_records SET ...');
  
  // 测试完成后回滚
  await connection.rollback();
  console.log('✅ 测试完成，数据已回滚');
  
} catch (error) {
  await connection.rollback();
  console.error('❌ 测试失败，已回滚:', error);
} finally {
  connection.release();
}
```

### 方法2：创建明确的测试数据

```javascript
// 1. 创建带标记的测试数据
await db.runSql(`
  INSERT INTO work_records 
  (t_number, work_date, acre, source, remark, created_at)
  VALUES 
  ('TEST_DEVICE_001', '2026-01-01', 100, 'test', 'LOCAL_TEST_DATA', NOW())
`);

// 2. 进行测试...

// 3. 测试完成后清理
await db.runSql(`
  DELETE FROM work_records 
  WHERE remark = 'LOCAL_TEST_DATA'
`);
```

### 方法3：使用独立的测试表

```sql
-- 创建测试表
CREATE TABLE work_records_test LIKE work_records;

-- 在测试表中操作
INSERT INTO work_records_test ...
UPDATE work_records_test ...

-- 测试完成后删除测试表
DROP TABLE work_records_test;
```

---

## 🔍 检查清单

### 每次开发前检查

- [ ] 确认定时任务已禁用（查看启动日志）
- [ ] 确认不会执行删除操作
- [ ] 确认不会运行修复脚本
- [ ] 如需写入，已准备好回滚方案

### 提交代码前检查

- [ ] 没有硬编码敏感信息（密码、密钥）
- [ ] 没有留下测试数据
- [ ] 没有注释掉重要的安全检查
- [ ] `.env` 文件没有被提交到Git

---

## 📋 常见场景处理

### 场景1：需要测试新的API接口

**安全做法**：
```javascript
// 只实现GET接口，不实现POST/PUT/DELETE
router.get('/api/test/new-feature', async (req, res) => {
  // 只读取数据，不修改
  const data = await db.queryAll('SELECT ...');
  res.json({ code: 0, data });
});
```

### 场景2：需要测试数据导入功能

**安全做法**：
1. 先在Excel中准备测试数据
2. 明确标记为测试数据
3. 导入后立即验证
4. 验证完成后删除测试数据

```javascript
// 导入后记录ID
const insertedIds = [];
for (const record of testData) {
  const result = await db.runSql('INSERT INTO ...', record);
  insertedIds.push(result.insertId);
}

// 测试完成后删除
await db.runSql(
  'DELETE FROM work_records WHERE id IN (?)',
  [insertedIds]
);
```

### 场景3：需要优化SQL查询

**安全做法**：
```javascript
// 1. 先用EXPLAIN分析
const explain = await db.queryAll('EXPLAIN SELECT ...');
console.log(explain);

// 2. 在测试环境验证
// 3. 确认无问题后再部署到生产
```

### 场景4：需要修改数据结构

**安全做法**：
1. 先在本地MySQL实例上测试（不是共享数据库）
2. 编写迁移脚本
3. 备份生产数据
4. 在维护窗口执行
5. 验证无误后提交

---

## 🚨 紧急情况处理

### 如果不小心删除了数据

1. **立即停止所有操作**
2. **联系DBA或负责人**
3. **从备份恢复数据**

阿里云RDS通常有自动备份，可以恢复到指定时间点。

### 如果不小心插入了大量测试数据

```sql
-- 快速清理（谨慎使用！）
DELETE FROM work_records 
WHERE remark LIKE '%TEST%' 
   OR t_number LIKE 'TEST_%'
   OR created_at > NOW() - INTERVAL 1 HOUR;
```

---

## 💡 最佳实践建议

### 1. 开发流程

```
本地开发 → 本地测试 → 代码审查 → 部署到云端
   ↓
只读操作    事务测试    安全检查    定时任务启用
```

### 2. 团队协作

- 建立代码审查机制
- 制定数据操作规范
- 定期备份数据库
- 记录所有数据变更

### 3. 监控告警

建议在云端服务器上设置：
- 数据库异常操作告警
- 大量删除操作告警
- 非工作时间操作告警

---

## 📞 需要帮助？

如果遇到以下情况，请立即联系团队负责人：

- ❓ 不确定某个操作是否安全
- ❓ 需要执行数据修复
- ❓ 发现数据异常
- ❓ 需要临时启用定时任务

---

## 📝 总结

**核心原则**：
1. 🚫 不在本地删除/修改生产数据
2. 🚫 不在本地运行定时任务
3. ✅ 只做查询、测试和开发
4. ✅ 如需写入，使用事务并及时回滚

**记住**：你现在操作的是**真实的生产数据库**，每一次写入都会影响所有用户！

---

**文档版本**: 1.0  
**最后更新**: 2026-04-24  
**适用范围**: 所有使用共享数据库的开发人员
