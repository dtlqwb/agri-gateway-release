# 📦 导入旧供应商设备数据指南

**CSV文件**: `templates/旧供应商终端映射表.csv`  
**设备数量**: 73台  
**更新时间**: 2026-04-18

---

## ✅ 快速导入（推荐）

### 步骤1: 确保已安装依赖

```bash
npm install
```

### 步骤2: 运行导入脚本

```bash
node import-old-devices-from-csv.js
```

脚本会自动：
1. ✅ 读取CSV文件
2. ✅ 将终端编号转换为MD5格式
3. ✅ 连接到MySQL数据库
4. ✅ 插入73条设备记录
5. ✅ 显示导入结果统计

### 步骤3: 验证导入

刷新页面：http://82.157.186.237:3000/index.html

应该能看到"旧供应商"区块，显示73台设备。

---

## 📊 CSV文件格式

文件位置: `templates/旧供应商终端映射表.csv`

格式：
```csv
终端编号,合作社名称,机手姓名
16052696013,灵丘县柳科乡下彭庄村下彭庄组股份经济合作社,张小刚
17070928154,灵丘县良昇仓种养专业合作社,邓明亮
...
```

**注意**: 
- 第一行是表头
- 共73行数据
- 作业类型字段为空，可在前端编辑

---

## 🔧 如果导入失败

### 错误1: 找不到模块 mysql2

```bash
npm install mysql2
```

### 错误2: 数据库连接失败

检查 `.env` 文件中的配置：
```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=agri_gateway
```

### 错误3: 表不存在

重启服务会自动创建表：
```bash
# 停止服务（Ctrl+C）
node index.js
```

---

## 📝 手动SQL导入（备选方案）

如果脚本无法运行，可以使用SQL直接导入。

我已为你生成了完整的SQL文件：`import_old_devices.sql`

执行方法：
```bash
mysql -u root -p agri_gateway < import_old_devices.sql
```

---

## 💡 导入后操作

### 1. 验证数据

```sql
USE agri_gateway;
SELECT COUNT(*) as total FROM old_supplier_devices;
-- 应该返回 73
```

### 2. 设置作业类型（可选）

CSV中没有作业类型，可以在前端编辑：
1. 登录系统
2. 进入设备列表
3. 点击设备的"编辑"按钮
4. 设置作业类型（耕/种/管/收）

或者批量设置：
```sql
-- 将所有设备设置为"耕"
UPDATE old_supplier_devices SET work_type_name = '耕';

-- 或根据合作社设置
UPDATE old_supplier_devices 
SET work_type_name = '耕' 
WHERE cooperative_name LIKE '%农机%';
```

### 3. 同步作业记录

如果需要旧设备的作业记录，需要：
1. 配置旧供应商API（在.env中）
2. 运行同步任务
3. 或手动导入历史作业数据

---

## 📞 常见问题

### Q: 导入后页面还是不显示？

A: 检查以下几点：
1. 确认导入成功（脚本显示"✅ 导入完成"）
2. 检查数据库中是否有数据：`SELECT COUNT(*) FROM old_supplier_devices;`
3. 清除浏览器缓存（Ctrl+F5）
4. 查看浏览器Console是否有错误

### Q: 可以重复导入吗？

A: 可以。脚本会检测重复数据：
- 如果设备已存在，会更新合作社和机手信息
- 不会创建重复记录

### Q: 如何删除所有数据重新导入？

```sql
DELETE FROM old_supplier_devices;
-- 然后重新运行导入脚本
```

---

## ✨ 总结

**最简单的方法**:
```bash
node import-old-devices-from-csv.js
```

一条命令搞定！🎉

如有问题随时联系我。
