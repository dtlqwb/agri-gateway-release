# 农业局账号配置指南

**适用版本**: v3.0.0  
**更新时间**: 2026-04-18

---

## 📋 概述

农业局账号是系统中的**只读权限账号**，主要用于：
- ✅ 查看农机作业统计数据
- ✅ 导出作业记录报表
- ✅ 查看所有合作社数据
- ❌ **不能**修改、删除数据
- ❌ **不能**管理其他管理员
- ❌ **不能**访问数据修复功能

---

## 🔑 角色说明

系统支持两种管理员角色：

| 角色 | 代码 | 权限说明 | 图标 |
|------|------|---------|------|
| 超级管理员 | `super` | 全部权限（增删改查、管理账号） | 🔑 |
| 只读管理员 | `viewer` | 仅查看和导出（农业局专用） | 👁️ |

**农业局账号应使用 `viewer` 角色**。

---

## 🛠️ 配置方法

### 方法一：通过管理页面配置（推荐）

#### 步骤1: 以超管身份登录
1. 访问 http://localhost:3001
2. 使用超级管理员账号登录（默认：admin / admin123）

#### 步骤2: 进入管理员管理页面
1. 点击顶部导航栏的 **"管理员管理"** 标签
2. 或直接访问：http://localhost:3001/admin-manage.html

#### 步骤3: 添加农业局账号
在"添加管理员"表单中填写：

```
用户名: nongyeju          （必填，登录用）
密码:   nongye123         （必填，建议修改为强密码）
姓名:   农业局管理员       （可选，显示名称）
角色:   👁️ 只读（农业局）  （重要！选择此项）
```

#### 步骤4: 点击"添加管理员"按钮
成功后会显示"✅ 添加成功"提示。

#### 步骤5: 验证账号
1. 退出当前账号
2. 使用新创建的农业局账号登录
3. 确认只能看到"数据管理"标签页
4. 确认无法访问"数据修复"和"管理员管理"功能

---

### 方法二：通过API接口配置

适合批量创建或通过脚本自动化配置。

#### API端点
```
POST /api/admins
```

#### 请求示例
```bash
curl -X POST http://localhost:3001/api/admins \
  -H "Content-Type: application/json" \
  -H "Authorization: YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "username": "nongyeju",
    "password": "nongye123",
    "name": "农业局管理员",
    "role": "viewer",
    "status": 1
  }'
```

#### 参数说明
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✅ | 登录用户名，必须唯一 |
| password | string | ✅ | 登录密码 |
| name | string | ❌ | 真实姓名或显示名称 |
| role | string | ❌ | 角色：`viewer` 或 `super`，默认 `viewer` |
| status | number | ❌ | 状态：1=启用，0=禁用，默认 1 |

#### 响应示例
```json
{
  "code": 0,
  "data": { "id": 3 },
  "msg": "添加成功"
}
```

---

### 方法三：直接操作数据库

适合初始化部署或批量导入。

#### SQL语句
```sql
-- 插入农业局账号
INSERT INTO admins (username, password, name, role, status) 
VALUES ('nongyeju', 'nongye123', '农业局管理员', 'viewer', 1);

-- 查看已创建的账号
SELECT id, username, name, role, status, created_at FROM admins;
```

⚠️ **注意**: 
- 密码目前是明文存储（生产环境建议加密）
- 确保不要重复插入相同用户名的账号

---

## 👥 批量配置示例

如果需要为多个农业局工作人员创建账号：

### 方案1: 使用SQL批量插入
```sql
INSERT INTO admins (username, password, name, role, status) VALUES
('nongyeju_1', 'password1', '张三', 'viewer', 1),
('nongyeju_2', 'password2', '李四', 'viewer', 1),
('nongyeju_3', 'password3', '王五', 'viewer', 1);
```

### 方案2: 使用脚本批量创建
创建 `create-agri-admins.js`:
```javascript
const fetch = require('node-fetch');

const admins = [
  { username: 'zhangsan', password: 'zs123456', name: '张三', role: 'viewer' },
  { username: 'lisi', password: 'ls123456', name: '李四', role: 'viewer' },
  { username: 'wangwu', password: 'ww123456', name: '王五', role: 'viewer' },
];

async function createAdmin(admin) {
  const res = await fetch('http://localhost:3001/api/admins', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'YOUR_SUPER_ADMIN_TOKEN'
    },
    body: JSON.stringify(admin)
  });
  const data = await res.json();
  console.log(`${admin.name}: ${data.msg}`);
}

// 批量创建
Promise.all(admins.map(createAdmin))
  .then(() => console.log('所有账号创建完成'))
  .catch(err => console.error('创建失败:', err));
```

运行脚本：
```bash
node create-agri-admins.js
```

---

## 🔐 安全建议

### 1. 密码强度要求
- ✅ 至少8个字符
- ✅ 包含大小写字母、数字
- ✅ 避免使用常见词汇
- ❌ 不要使用 `123456`、`password` 等弱密码

**推荐密码示例**: `Agri@2026!Secure`

### 2. 定期更换密码
- 建议每3个月更换一次密码
- 离职人员账号立即禁用或删除

### 3. 最小权限原则
- 农业局账号**必须**使用 `viewer` 角色
- 不要给农业局账号分配 `super` 权限
- 只授予完成工作所需的最小权限

### 4. 账号审计
定期审查管理员账号列表：
```bash
# 查看所有管理员
curl http://localhost:3001/api/admins \
  -H "Authorization: YOUR_TOKEN"
```

检查是否有：
- 未知账号
- 长期未使用的账号
- 权限过高的账号

---

## 🧪 测试验证

### 测试1: 登录验证
1. 使用农业局账号登录
2. 应该能成功登录
3. 登录后显示欢迎信息

### 测试2: 权限验证
农业局账号登录后：

**应该能看到的功能**:
- ✅ 数据看板（统计图表）
- ✅ 设备列表
- ✅ 合作社列表
- ✅ 数据导出
- ✅ 农户列表

**不应该看到的功能**:
- ❌ 数据修复标签页
- ❌ 管理员管理标签页
- ❌ 编辑/删除按钮
- ❌ 批量操作按钮

### 测试3: API权限验证
尝试调用需要超管权限的API：
```bash
# 这个请求应该返回 403 Forbidden
curl http://localhost:3001/api/admins \
  -H "Authorization: AGRIBUREAU_TOKEN"
```

预期响应：
```json
{
  "code": -1,
  "msg": "权限不足，需要超管权限"
}
```

---

## 📊 默认账号

系统初始化时会创建以下默认账号：

| 用户名 | 密码 | 角色 | 用途 |
|--------|------|------|------|
| admin | admin123 | super | 超级管理员 |
| nongyeju | nongye123 | viewer | 农业局管理员 |

⚠️ **重要**: 首次部署后请立即修改默认密码！

---

## 🔄 账号管理

### 修改密码
目前系统暂不支持自助修改密码，需要超管通过以下方式修改：

**方法1: 通过管理页面**
1. 超管登录
2. 进入"管理员管理"
3. 点击对应账号的"编辑"按钮
4. 修改密码并保存

**方法2: 通过API**
```bash
curl -X PUT http://localhost:3001/api/admins/2 \
  -H "Content-Type: application/json" \
  -H "Authorization: SUPER_ADMIN_TOKEN" \
  -d '{"password": "new_password_123"}'
```

**方法3: 直接更新数据库**
```sql
UPDATE admins SET password = 'new_password' WHERE username = 'nongyeju';
```

### 禁用账号
临时禁用某个农业局账号（不删除数据）：

```sql
UPDATE admins SET status = 0 WHERE username = 'nongyeju';
```

重新启用：
```sql
UPDATE admins SET status = 1 WHERE username = 'nongyeju';
```

### 删除账号
永久删除账号（谨慎操作）：

**通过API**:
```bash
curl -X DELETE http://localhost:3001/api/admins/2 \
  -H "Authorization: SUPER_ADMIN_TOKEN"
```

**通过数据库**:
```sql
DELETE FROM admins WHERE username = 'nongyeju';
```

---

## ❓ 常见问题

### Q1: 农业局账号看不到某些数据？
**A**: 检查以下几点：
1. 确认账号状态为启用（status=1）
2. 确认角色为 `viewer`
3. 检查数据库中是否有对应的数据
4. 查看浏览器控制台是否有错误信息

### Q2: 农业局账号能否导出数据？
**A**: ✅ 可以。`viewer` 角色拥有数据导出权限，可以导出Excel报表。

### Q3: 如何限制农业局只能看特定合作社的数据？
**A**: 当前版本不支持数据隔离，`viewer` 角色可以看到所有合作社数据。如需实现数据隔离，需要：
1. 在 `admins` 表中添加 `org_id` 字段
2. 修改查询逻辑，根据 `org_id` 过滤数据
3. 前端根据账号的 `org_id` 自动筛选

这是未来版本的改进方向。

### Q4: 忘记了农业局账号密码怎么办？
**A**: 联系超级管理员，通过管理页面或数据库重置密码。

### Q5: 可以同时有多个农业局账号吗？
**A**: ✅ 可以。系统支持创建任意数量的 `viewer` 角色账号。

---

## 📞 技术支持

如遇到问题，请：
1. 查看项目文档: [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)
2. 检查测试报告: [TEST_AND_BUG_REPORT.md](./TEST_AND_BUG_REPORT.md)
3. 查看部署指南: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

---

**文档版本**: 1.0  
**最后更新**: 2026-04-18  
**维护者**: 开发团队
