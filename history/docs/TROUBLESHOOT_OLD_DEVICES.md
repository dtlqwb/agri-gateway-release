# 🔍 旧供应商设备数据不显示 - 排查指南

**问题**: http://82.157.186.237:3000/index.html 部署后，旧供应商设备数据没有显示

---

## 📋 可能的原因

### 原因1: 数据库中没有旧供应商设备数据 ⭐ 最可能

旧供应商设备存储在 `old_supplier_devices` 表中，如果这个表是空的，前端就不会显示任何旧设备。

**检查方法**:
```sql
-- 登录MySQL
mysql -u root -p

-- 切换到数据库
USE agri_gateway;

-- 检查旧设备表是否有数据
SELECT COUNT(*) as total FROM old_supplier_devices;

-- 查看具体数据
SELECT * FROM old_supplier_devices LIMIT 10;
```

**预期结果**: 
- 如果 `total = 0`，说明表中没有数据，需要导入
- 如果 `total > 0`，说明有数据，继续排查其他原因

---

### 原因2: API返回错误

检查API是否正常返回数据。

**检查方法**:
在浏览器中访问：
```
http://82.157.186.237:3000/api/old/machines
```

**预期响应**:
```json
{
  "code": 0,
  "data": [...],  // 设备数组
  "total": 73     // 设备数量
}
```

如果返回：
```json
{
  "code": -1,
  "msg": "错误信息",
  "data": [],
  "total": 0
}
```
说明API出错了，查看错误信息。

---

### 原因3: 前端JavaScript报错

打开浏览器开发者工具（F12），查看Console标签是否有错误。

**常见错误**:
- `Failed to fetch` - 网络请求失败
- `CORS error` - 跨域问题
- JavaScript语法错误

---

## ✅ 解决方案

### 方案1: 导入旧供应商设备数据（如果表为空）

#### 步骤1: 准备CSV文件

你需要一个包含旧设备信息的CSV文件，格式如下：
```csv
macid,cooperative_name,driver_name,work_type_name
MD5设备号1,合作社名称1,机手姓名1,耕
MD5设备号2,合作社名称2,机手姓名2,种
...
```

#### 步骤2: 使用导入脚本

项目中有导入脚本 `scripts/import-beidou-devices.js`，使用方法：

```bash
# 将CSV文件放到项目根目录
# 然后运行
node scripts/import-beidou-devices.js your_file.csv
```

#### 步骤3: 手动插入数据（如果没有CSV）

如果只有设备列表，可以直接SQL插入：

```sql
USE agri_gateway;

INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name) VALUES
('md5_device_1', '合作社A', '张三', '耕'),
('md5_device_2', '合作社A', '李四', '种'),
('md5_device_3', '合作社B', '王五', '收');
-- 继续添加更多设备...
```

---

### 方案2: 检查并修复API错误

如果API返回错误，查看服务器日志：

```bash
# 查看Node.js输出日志
# 如果是PM2运行
pm2 logs agri-gateway --lines 50

# 如果直接运行
# 查看启动时的控制台输出
```

常见错误及解决：
- **数据库连接失败**: 检查 `.env` 中的数据库配置
- **表不存在**: 首次运行时会自动创建表，重启服务
- **查询错误**: 查看具体错误信息

---

### 方案3: 检查前端配置

确保前端能正确访问API。

**检查项**:
1. 浏览器Console是否有CORS错误
2. Network标签中 `/api/old/machines` 请求状态码是否为200
3. 请求URL是否正确（应该是 `http://82.157.186.237:3000/api/old/machines`）

---

## 🔧 快速诊断脚本

创建一个诊断脚本 `check-old-devices.js`：

```javascript
const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  console.log('🔍 检查旧供应商设备数据...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    // 检查表是否存在
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'old_supplier_devices'"
    );
    
    if (tables.length === 0) {
      console.log('❌ old_supplier_devices 表不存在');
      console.log('   解决方法: 重启服务，会自动创建表');
      await connection.end();
      return;
    }
    
    console.log('✅ old_supplier_devices 表存在\n');
    
    // 检查数据量
    const [count] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    
    console.log(`📊 设备总数: ${count[0].total}`);
    
    if (count[0].total === 0) {
      console.log('\n⚠️  表中没有数据！');
      console.log('\n解决方法:');
      console.log('1. 如果有CSV文件，运行: node scripts/import-beidou-devices.js 文件.csv');
      console.log('2. 或者手动插入数据到 old_supplier_devices 表');
    } else {
      console.log('\n✅ 表中有数据');
      
      // 显示前5条
      const [rows] = await connection.execute(
        'SELECT macid, cooperative_name, driver_name FROM old_supplier_devices LIMIT 5'
      );
      
      console.log('\n示例数据:');
      rows.forEach((row, i) => {
        console.log(`  ${i+1}. ${row.macid} - ${row.cooperative_name} - ${row.driver_name}`);
      });
    }
    
    await connection.end();
    
  } catch (err) {
    console.error('❌ 检查失败:', err.message);
  }
}

check();
```

运行诊断：
```bash
node check-old-devices.js
```

---

## 📝 给同伴的操作步骤

### 第1步: 检查数据库
让同伴运行以下SQL：
```sql
USE agri_gateway;
SELECT COUNT(*) as total FROM old_supplier_devices;
```

### 第2步: 根据结果处理

**如果 total = 0**:
- 需要提供旧设备数据（CSV文件或Excel）
- 或者手动插入设备信息

**如果 total > 0**:
- 检查API: 访问 `http://82.157.186.237:3000/api/old/machines`
- 查看浏览器Console是否有错误
- 查看服务器日志

### 第3步: 验证
刷新页面 `http://82.157.186.237:3000/index.html`
应该能看到"旧供应商"设备区块。

---

## 💡 补充说明

### 旧设备数据来源

旧供应商设备数据通常来自：
1. **CSV/Excel文件导入** - 最常见
2. **API同步** - 如果配置了旧供应商API
3. **手动录入** - 逐条添加

### 需要的字段

`old_supplier_devices` 表结构：
- `macid` - 设备MAC地址（MD5加密的设备号）
- `cooperative_name` - 合作社名称
- `driver_name` - 机手姓名
- `work_type_name` - 作业类型（耕/种/管/收）
- `mapped_yuntinan_tnumber` - 映射的云途安终端号（可选）

### 数据示例

如果你有原始的旧设备列表，可以提供给我，我帮你生成导入SQL。

---

## 📞 需要提供的信息

如果以上方法都不能解决，请提供：

1. **数据库检查结果**:
   ```sql
   SELECT COUNT(*) FROM old_supplier_devices;
   ```

2. **API返回结果**:
   访问 `http://82.157.186.237:3000/api/old/machines` 的完整响应

3. **浏览器Console错误**:
   F12 -> Console 标签的截图或文字

4. **服务器日志**:
   启动和访问时的日志输出

我会根据这些信息进一步帮你排查！
