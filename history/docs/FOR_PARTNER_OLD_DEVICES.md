# 给同伴：旧设备数据不显示的排查步骤

---

你好！

关于旧供应商设备数据不显示的问题，请按以下步骤排查：

## 🔍 第1步: 运行诊断脚本

在项目根目录运行：
```bash
node check-old-devices.js
```

这个脚本会自动检查：
- ✅ 数据库表是否存在
- ✅ 表中是否有数据
- ✅ 数据统计信息
- ✅ 示例数据展示

把运行结果截图或复制给我。

---

## 📊 第2步: 手动检查（如果脚本无法运行）

登录MySQL，执行以下SQL：

```sql
USE agri_gateway;

-- 检查表是否存在
SHOW TABLES LIKE 'old_supplier_devices';

-- 检查数据量
SELECT COUNT(*) as total FROM old_supplier_devices;

-- 查看具体数据
SELECT * FROM old_supplier_devices LIMIT 5;
```

把结果告诉我。

---

## 🌐 第3步: 检查API

在浏览器中访问：
```
http://82.157.186.237:3000/api/old/machines
```

应该返回类似这样的JSON：
```json
{
  "code": 0,
  "data": [...],
  "total": 73
}
```

如果返回 `total: 0` 或报错，把完整响应发给我。

---

## 💡 可能的原因和解决

### 原因1: 表中没有数据（最可能）⭐

**症状**: `SELECT COUNT(*)` 返回 0

**解决**: 需要导入旧设备数据

如果你有CSV或Excel文件，发给我，我帮你生成导入脚本。

或者手动插入几条测试数据：
```sql
INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name) VALUES
('test_device_1', '测试合作社', '张三', '耕'),
('test_device_2', '测试合作社', '李四', '种');
```

然后刷新页面看是否显示。

### 原因2: 表不存在

**症状**: `SHOW TABLES` 找不到 `old_supplier_devices`

**解决**: 重启服务
```bash
# 停止服务（Ctrl+C）
# 重新启动
node index.js
```

首次启动会自动创建所有表。

### 原因3: API错误

**症状**: 访问 `/api/old/machines` 返回错误

**解决**: 查看服务器日志
```bash
# 如果用PM2
pm2 logs agri-gateway --lines 50

# 如果直接运行
# 查看控制台输出
```

把错误信息发给我。

---

## 📝 快速测试

如果想快速验证功能是否正常，可以先插入2条测试数据：

```sql
USE agri_gateway;

INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name) 
VALUES 
('md5_test_001', '测试合作社A', '测试机手1', '耕'),
('md5_test_002', '测试合作社A', '测试机手2', '种');
```

然后刷新页面 `http://82.157.186.237:3000/index.html`

如果能看到"旧供应商"区块和这2台设备，说明功能正常，只是缺少真实数据。

---

## 📞 需要的信息

请提供以下信息，我会帮你进一步排查：

1. **诊断脚本的输出** 或 **SQL查询结果**
2. **API返回的JSON**
3. **浏览器Console是否有错误**（F12 -> Console标签）
4. **服务器日志**（如果有错误）

---

**提示**: 最可能的原因是数据库中没有旧设备数据，需要先导入设备列表。

如有问题随时联系我！
