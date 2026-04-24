# 重构后测试指南

**创建时间**: 2026-04-16 18:30  
**目的**: 确保重构后的代码功能正常，无回归问题

---

## 📋 测试前准备

### 1. 确认文件结构

```bash
# 检查所有新文件是否存在
ls middleware/
ls routes/
ls utils/
ls services/scheduler.js
ls index.js
```

预期输出：
```
middleware/: auth.js, cors.js, upload.js
routes/: admin.js, dataManage.js, deviceManage.js, index.js, oldSupplier.js, tracks.js, yunTinan.js
utils/: token.js
services/: scheduler.js
index.js (94行, 约2.7KB)
```

### 2. 备份验证

```bash
# 确认原文件已备份
ls -lh index_old_full.js
```

应该看到：`index_old_full.js` (约55KB)

---

## 🧪 测试步骤

### Step 1: 语法检查

```powershell
# 检查所有JavaScript文件
Get-ChildItem *.js, middleware\*.js, routes\*.js, utils\*.js, services\*.js | ForEach-Object {
    Write-Host "检查: $($_.Name)"
    node -c $_.FullName
}
```

✅ **预期结果**: 所有文件通过，无错误输出

---

### Step 2: 启动服务

```bash
node index.js
```

✅ **预期输出**:
```
[DB] 数据库就绪
[自动同步] 下次定时同步: ...
[旧供应商抓取] 已禁用（使用新I日供应商API替代）
[新I日供应商API] 同步功能未启用（设置 ENABLE_OLD_SYNC=true 以启用）

🚀 聚合平台已启动: http://localhost:3000
   API: http://localhost:3000/api/health
   前端: http://localhost:3000
```

⚠️ **如果出错**: 
- 查看错误信息
- 检查是否有模块找不到
- 可以回退到 `index_old_full.js`

---

### Step 3: 健康检查

打开浏览器或终端访问：

```bash
curl http://localhost:3000/api/health
```

✅ **预期响应**:
```json
{
  "code": 0,
  "msg": "ok",
  "time": "2026-04-16T10:30:00.000Z"
}
```

---

### Step 4: 测试管理员功能

#### 4.1 管理员登录

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "username": "admin",
    "role": "super",
    "token": "..."
  }
}
```

保存返回的 `token`，后续测试需要用到。

#### 4.2 获取管理员列表（需要token）

```bash
curl http://localhost:3000/api/admins \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 1
}
```

---

### Step 5: 测试云途安API

#### 5.1 农机列表

```bash
curl http://localhost:3000/api/machines
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 42
}
```

#### 5.2 面积统计

```bash
curl "http://localhost:3000/api/stats?startDate=2026-04-01&endDate=2026-04-16"
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": {
    "totalAcre": 1234.56,
    "totalOkAcre": 1200.00,
    ...
  }
}
```

#### 5.3 作业类型

```bash
curl http://localhost:3000/api/work-types
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...]
}
```

---

### Step 6: 测试旧供应商API

#### 6.1 设备列表

```bash
curl http://localhost:3000/api/old/machines
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 100
}
```

#### 6.2 作业记录

```bash
curl "http://localhost:3000/api/old/records?limit=10"
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 10
}
```

---

### Step 7: 测试农户功能

#### 7.1 农户登录

```bash
curl -X POST http://localhost:3000/api/farmer/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","password":"123456"}'
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "phone": "13800138000",
    "name": "张三",
    "token": "..."
  }
}
```

#### 7.2 农户统计

```bash
curl "http://localhost:3000/api/farmer/stats?orgId=1"
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": {
    "totalAcre": 500.00,
    "machineCount": 10
  }
}
```

---

### Step 8: 测试设备管理

#### 8.1 获取设备列表

```bash
curl http://localhost:3000/api/devices/list
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 100
}
```

#### 8.2 更新作业类型

```bash
curl -X POST http://localhost:3000/api/device/work-type \
  -H "Content-Type: application/json" \
  -d '{"macid":"ABC123","workTypeName":"旋耕"}'
```

✅ **预期响应**:
```json
{
  "code": 0,
  "msg": "作业类型已更新"
}
```

---

### Step 9: 测试轨迹功能

#### 9.1 查询轨迹

```bash
curl "http://localhost:3000/api/tracks?tNumber=T001&workDate=2026-04-15"
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...],
  "total": 100
}
```

---

### Step 10: 测试数据导入

#### 10.1 获取导入历史

```bash
curl http://localhost:3000/api/imports
```

✅ **预期响应**:
```json
{
  "code": 0,
  "data": [...]
}
```

---

### Step 11: 测试前端页面

在浏览器中访问：

1. **管理端**: http://localhost:3000
   - ✅ 页面正常加载
   - ✅ 可以登录
   - ✅ 数据显示正常

2. **农户端**: http://localhost:3000/farmer
   - ✅ 页面正常加载
   - ✅ 可以登录
   - ✅ 数据显示正常

---

### Step 12: 检查定时任务

查看控制台输出，应该看到：

```
[自动同步] 10秒后将执行增量同步...
[自动同步] 下次定时同步: 2026-04-17 02:00:00 (XXX 分钟后)
[旧供应商抓取] 已禁用（使用新I日供应商API替代）
[新I日供应商API] 同步功能未启用（设置 ENABLE_OLD_SYNC=true 以启用）
```

等待10秒后，应该看到：
```
[自动同步] 每日增量同步，拉取最近7天数据...
[自动同步] 增量同步完成: X 新增, Y 更新, 共处理 Z 条
```

---

## ⚠️ 常见问题

### 问题1: 模块找不到

**错误信息**: `Cannot find module './middleware/cors'`

**解决方案**:
```bash
# 检查文件是否存在
ls middleware/cors.js

# 如果不存在，从备份恢复
Copy-Item index_old_full.js index.js -Force
```

### 问题2: 路由404

**错误信息**: `{"code":-1,"msg":"Not Found"}`

**解决方案**:
1. 检查 `routes/index.js` 是否正确注册了所有路由
2. 检查路由路径是否正确
3. 查看控制台是否有路由注册错误

### 问题3: Token验证失败

**错误信息**: `{"code":401,"msg":"Token无效或已过期"}`

**解决方案**:
1. 检查 `utils/token.js` 是否正确导出
2. 检查 `middleware/auth.js` 是否正确导入
3. 重新登录获取新token

### 问题4: 数据库错误

**错误信息**: `SQLITE_ERROR: no such table: xxx`

**解决方案**:
1. 检查 `services/db.js` 是否正常
2. 删除 `data/agri-gateway.db` 重新启动（会重建表）
3. 或者从备份恢复数据库

---

## 🔄 回退方案

如果测试发现严重问题，可以立即回退：

```powershell
# 停止服务 (Ctrl+C)

# 恢复原index.js
Move-Item index.js index_new_backup.js -Force
Move-Item index_old_full.js index.js -Force

# 删除新创建的目录（可选）
Remove-Item middleware -Recurse -Force
Remove-Item routes -Recurse -Force
Remove-Item utils -Recurse -Force
Remove-Item services\scheduler.js -Force

# 重新启动
node index.js
```

---

## ✅ 测试清单

完成以下检查后，标记为 ✅：

- [ ] 所有文件语法检查通过
- [ ] 服务正常启动，无错误
- [ ] 健康检查接口返回正常
- [ ] 管理员登录成功
- [ ] 管理员CRUD功能正常
- [ ] 云途安API返回数据
- [ ] 旧供应商API返回数据
- [ ] 农户登录成功
- [ ] 农户数据查询正常
- [ ] 设备管理功能正常
- [ ] 轨迹查询功能正常
- [ ] 数据导入功能正常
- [ ] 前端页面正常显示
- [ ] 定时任务正常启动
- [ ] 控制台无异常错误

---

## 📊 测试结果记录

**测试日期**: _______________  
**测试人员**: _______________  

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 语法检查 | ⬜ | |
| 服务启动 | ⬜ | |
| 健康检查 | ⬜ | |
| 管理员功能 | ⬜ | |
| 云途安API | ⬜ | |
| 旧供应商API | ⬜ | |
| 农户功能 | ⬜ | |
| 设备管理 | ⬜ | |
| 轨迹功能 | ⬜ | |
| 数据导入 | ⬜ | |
| 前端页面 | ⬜ | |
| 定时任务 | ⬜ | |

**总体评价**: ⬜ 通过  ⬜ 部分通过  ⬜ 失败

**问题记录**:
```
(在此记录发现的问题)
```

---

## 🎉 测试通过后

恭喜！如果所有测试都通过，说明重构成功！

### 建议操作

1. **提交代码**
   ```bash
   git add .
   git commit -m "refactor: 完成index.js模块化重构"
   ```

2. **更新文档**
   - 更新 README.md
   - 更新 PROJECT_STRUCTURE.md

3. **通知团队**
   - 告知团队成员重构完成
   - 提供新的代码结构说明

4. **监控运行**
   - 观察服务器运行状态
   - 检查日志是否有异常
   - 确认定时任务正常运行

---

**祝测试顺利！** 🚀
