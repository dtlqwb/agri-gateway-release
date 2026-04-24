# Token失效问题说明

## 🐛 问题现象

访问数据管理页面时显示：
```
加载失败: Token无效或已过期，请重新登录
```

---

## 🔍 问题原因

在 **v3.0版本** 中，我们对Token认证机制进行了安全升级：

### 升级前（v2.0）
```javascript
// 简单的base64编码
token = Buffer.from('username:timestamp').toString('base64');
```
**问题**：
- ❌ 任何人都可以伪造token
- ❌ 没有过期机制
- ❌ 没有防篡改保护

### 升级后（v3.0）✅
```javascript
// HMAC-SHA256签名 + 24小时过期
token = Buffer.from('username:timestamp:signature').toString('base64');
```
**优势**：
- ✅ 防止伪造（需要密钥签名）
- ✅ 24小时自动过期
- ✅ 防止篡改（签名验证）

---

## ✅ 解决方案

### 方案1：重新登录（推荐）⭐⭐⭐

**步骤**：
1. 访问 http://localhost:3001
2. 点击右上角"管理员登录"
3. 输入账号密码重新登录
4. 再次访问数据管理页面

**优点**：
- ✅ 最简单直接
- ✅ 获取新的安全token
- ✅ 24小时内有效

---

### 方案2：清除浏览器缓存

如果重新登录后仍有问题：

**Chrome/Edge浏览器**：
1. 按 `F12` 打开开发者工具
2. 切换到"Application"标签
3. 左侧选择"Local Storage" → "http://localhost:3001"
4. 右键删除 `admin_user` 项
5. 刷新页面，重新登录

**或者使用快捷键**：
```
Ctrl + Shift + Delete
→ 选择"缓存的图片和文件"、"Cookie和其他网站数据"
→ 点击"清除数据"
```

---

## 📋 其他受影响的页面

以下页面都使用了相同的Token机制，都需要重新登录：

- ✅ 管理员后台 (`index.html`)
- ✅ 数据修复管理 (`data-repair-work.html`)
- ✅ 农户管理 (`farmer.html`)
- ✅ 新I日供应商API管理 (`old-api-manage.html`)

**只需要在主页面重新登录一次，其他页面自动生效。**

---

## 🔐 Token有效期说明

### 有效期
- **24小时**（从登录时间开始计算）
- 示例：今天 14:00 登录 → 明天 14:00 过期

### 过期后
- 所有API请求返回 401 错误
- 页面显示"Token无效或已过期，请重新登录"
- 自动跳转到登录页

### 如何延长
- 重新登录即可获取新的24小时token
- 不需要退出，直接重新登录

---

## 🛡️ 安全特性

新的Token机制提供了以下安全保护：

| 特性 | 说明 |
|------|------|
| **HMAC-SHA256签名** | 防止token伪造 |
| **时间戳验证** | 防止重放攻击 |
| **24小时过期** | 限制token有效期 |
| **密钥保护** | 签名密钥存储在.env中 |

---

## 📝 技术细节

### Token格式
```
base64(username:timestamp:signature)

示例解码后：
admin:1744617600000:a1b2c3d4e5f6...
```

### 验证流程
1. 解码base64获取三部分
2. 验证时间戳是否过期（24小时）
3. 使用密钥重新计算签名
4. 比对签名是否一致
5. 全部通过 → 允许访问

---

## ❓ 常见问题

### Q1: 为什么之前不用重新登录？
**A**: v2.0的token没有过期机制，只要不清除浏览器缓存就一直有效。v3.0增加了24小时过期保护。

### Q2: 可以延长token有效期吗？
**A**: 可以。修改 `index.js` 中的 `TOKEN_EXPIRY` 值：
```javascript
// 当前：24小时
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

// 改为：7天
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;
```

### Q3: 同事拿到安装包后也需要重新登录吗？
**A**: 不需要。他们是全新部署，第一次登录就会生成新的安全token。

### Q4: 如何查看token是否过期？
**A**: 打开浏览器开发者工具（F12）→ Console，输入：
```javascript
const user = JSON.parse(localStorage.getItem('admin_user'));
const timestamp = parseInt(atob(user.token).split(':')[1]);
const expiry = new Date(timestamp + 24*60*60*1000);
console.log('Token过期时间:', expiry.toLocaleString('zh-CN'));
```

---

## 🚀 快速解决步骤

1. **访问主页**
   ```
   http://localhost:3001
   ```

2. **点击"管理员登录"**

3. **输入账号密码**
   - 默认账号: `admin`
   - 默认密码: `admin123`

4. **登录成功后，再次访问数据管理页面**
   ```
   http://localhost:3001/data-repair-work.html
   ```

5. **问题解决！✅**

---

## 📅 修复时间

**问题发现**: 2026-04-14  
**原因**: v3.0 Token安全升级  
**解决方案**: 重新登录获取新token
