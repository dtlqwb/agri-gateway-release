# index.js 拆分实施方案

> **目标**: 将 55KB 的 index.js 拆分为模块化结构，提升可维护性  
> **原则**: 渐进式重构，保证每次改动都可测试、可回退  
> **预计时间**: 2-3天

---

## 📋 拆分策略

### 核心原则

1. **小步快跑** - 每次只拆分一个模块，立即测试
2. **保持兼容** - API接口不变，前端无需修改
3. **逐步迁移** - 先创建新文件，再删除旧代码
4. **充分测试** - 每步都要验证功能正常

### 目标结构

```
agri-gateway-release/
├── index.js (精简版，约5KB)
│   ├── 服务器启动
│   ├── 中间件配置
│   └── 路由注册
│
├── middleware/
│   ├── cors.js           # CORS中间件
│   ├── auth.js           # 认证和权限中间件
│   └── upload.js         # 文件上传配置
│
├── routes/
│   ├── index.js          # 路由汇总
│   ├── oldSupplier.js    # 旧供应商API路由
│   ├── deviceManage.js   # 设备管理路由
│   ├── yunTinan.js       # 云途安API路由
│   ├── tracks.js         # 轨迹查询路由
│   ├── dataManage.js     # 数据管理路由
│   ├── admin.js          # 管理员相关路由
│   └── farmer.js         # 农户相关路由
│
├── services/
│   └── scheduler.js      # 定时任务调度
│
└── utils/
    └── token.js          # Token工具函数
```

---

## 🎯 实施步骤（7步）

### Step 1: 创建目录结构（5分钟）

```bash
mkdir middleware
mkdir routes
mkdir utils
```

**验证**：
```bash
ls -la middleware/ routes/ utils/
```

---

### Step 2: 提取中间件（30分钟）

#### 2.1 创建 middleware/cors.js

```javascript
/**
 * CORS 跨域中间件
 */
module.exports = function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
};
```

#### 2.2 创建 middleware/upload.js

```javascript
/**
 * 文件上传配置
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 格式的Excel文件'), false);
    }
  }
});

module.exports = upload;
```

#### 2.3 创建 utils/token.js

从 index.js 中提取 Token 相关函数（第928-989行）：

```javascript
/**
 * Token 工具函数
 */
const crypto = require('crypto');

// Token密钥
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'agri-gateway-secret-key-2026';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

/**
 * 生成Token
 */
function generateToken(username) {
  const timestamp = Date.now();
  const data = `${username}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('hex');
  
  // 格式: username:timestamp:signature (base64编码)
  return Buffer.from(`${username}:${timestamp}:${signature}`).toString('base64');
}

/**
 * 验证Token
 */
function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    
    if (parts.length !== 3) return null;
    
    const [username, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr);
    
    // 验证时间戳是否过期
    if (Date.now() - timestamp > TOKEN_EXPIRY) {
      return null;
    }
    
    // 验证签名
    const data = `${username}:${timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    return { username, timestamp };
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken,
  TOKEN_EXPIRY
};
```

**测试**：
```bash
node -e "const token = require('./utils/token'); console.log(token.generateToken('admin'));"
```

---

### Step 3: 提取认证中间件（30分钟）

创建 middleware/auth.js：

```javascript
/**
 * 认证和权限中间件
 */
const { verifyToken } = require('../utils/token');
const db = require('../services/db');

/**
 * 验证管理员登录
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.json({ code: -1, msg: '未登录' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);
  
  if (!verified) {
    return res.json({ code: -1, msg: 'Token无效或已过期' });
  }
  
  // 从数据库验证用户是否存在
  const user = db.queryOne('SELECT * FROM admins WHERE username = ?', [verified.username]);
  
  if (!user) {
    return res.json({ code: -1, msg: '用户不存在' });
  }
  
  req.user = user;
  next();
}

/**
 * 验证超级管理员
 */
function requireSuper(req, res, next) {
  if (req.user.role !== 'super') {
    return res.json({ code: -1, msg: '权限不足' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireSuper
};
```

**测试**：检查语法错误
```bash
node -c middleware/auth.js
```

---

### Step 4: 拆分路由模块（核心步骤，2-3小时）

#### 4.1 创建 routes/oldSupplier.js

从 index.js 第253-287行提取：

```javascript
/**
 * 旧供应商数据 API 路由
 */
const express = require('express');
const router = express.Router();
const db = require('../services/db');

// 获取旧供应商统计
router.get('/stats', (req, res) => {
  try {
    const stats = db.getOldStats();
    res.json({ code: 0, data: stats });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 获取旧供应商设备列表
router.get('/machines', (req, res) => {
  try {
    const machines = db.getOldMachines();
    res.json({ code: 0, data: machines, total: machines.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 获取旧供应商作业记录
router.get('/records', (req, res) => {
  try {
    const { tNumber, workType, startDate, endDate, limit } = req.query;
    const records = db.getOldWorkRecords({
      tNumber, workType, startDate, endDate,
      limit: limit ? parseInt(limit) : undefined
    });
    res.json({ code: 0, data: records, total: records.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
```

#### 4.2 创建 routes/deviceManage.js

从 index.js 第346-403行提取：

```javascript
/**
 * 设备作业类型管理 API 路由
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireSuper } = require('../middleware/auth');
const db = require('../services/db');

// 农户修改设备作业类型
router.post('/work-type', async (req, res) => {
  try {
    const { deviceId, workTypeName } = req.body;
    
    if (!deviceId || !workTypeName) {
      return res.json({ code: -1, msg: '参数不完整' });
    }
    
    await db.runSql(
      'UPDATE old_supplier_devices SET work_type_name = ?, updated_at = NOW() WHERE macid = ?',
      [workTypeName, deviceId]
    );
    
    res.json({ code: 0, msg: '修改成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 获取设备列表
router.get('/list', async (req, res) => {
  try {
    const devices = await db.queryAll(
      'SELECT macid, cooperative_name, driver_name, work_type_name FROM old_supplier_devices ORDER BY macid'
    );
    res.json({ code: 0, data: devices, total: devices.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// 批量配置作业类型
router.post('/work-type/batch', requireAuth, requireSuper, async (req, res) => {
  try {
    const { deviceIds, workTypeName } = req.body;
    
    if (!deviceIds || !Array.isArray(deviceIds) || !workTypeName) {
      return res.json({ code: -1, msg: '参数不完整' });
    }
    
    let updated = 0;
    for (const deviceId of deviceIds) {
      await db.runSql(
        'UPDATE old_supplier_devices SET work_type_name = ?, updated_at = NOW() WHERE macid = ?',
        [workTypeName, deviceId]
      );
      updated++;
    }
    
    res.json({ code: 0, msg: `成功更新 ${updated} 台设备`, data: { updated } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
```

#### 4.3 继续创建其他路由文件

按照相同模式创建：
- `routes/yunTinan.js` - 云途安API路由
- `routes/tracks.js` - 轨迹查询路由
- `routes/dataManage.js` - 数据管理路由
- `routes/admin.js` - 管理员相关路由
- `routes/farmer.js` - 农户相关路由

**每个文件的模板**：
```javascript
/**
 * [模块名称] API 路由
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireSuper } = require('../middleware/auth');
const db = require('../services/db');
// 引入其他需要的服务...

// 路由定义...

module.exports = router;
```

---

### Step 5: 创建路由汇总（15分钟）

创建 routes/index.js：

```javascript
/**
 * 路由汇总
 */
const express = require('express');
const router = express.Router();

// 导入所有路由模块
const oldSupplierRoutes = require('./oldSupplier');
const deviceManageRoutes = require('./deviceManage');
const yunTinanRoutes = require('./yunTinan');
const tracksRoutes = require('./tracks');
const dataManageRoutes = require('./dataManage');
const adminRoutes = require('./admin');
const farmerRoutes = require('./farmer');

// 注册路由
router.use('/old', oldSupplierRoutes);
router.use('/device', deviceManageRoutes);
router.use('/yuntinan', yunTinanRoutes);
router.use('/tracks', tracksRoutes);
router.use('/data', dataManageRoutes);
router.use('/admin', adminRoutes);
router.use('/farmer', farmerRoutes);

module.exports = router;
```

---

### Step 6: 创建定时任务服务（30分钟）

创建 services/scheduler.js：

```javascript
/**
 * 定时任务调度服务
 */
const db = require('./db');
const yt = require('./yunTinanService');
const oldService = require('./oldSupplierService');

/**
 * 执行云途安数据同步
 */
async function runYuntinanSync(mode = 'recent') {
  const today = new Date().toISOString().substring(0, 10);
  
  try {
    // 检查是否已在同步
    const existing = db.getLatestSyncLog();
    if (existing && existing.status === 'running') {
      console.log(`[自动同步] 正在同步中，跳过`);
      return;
    }
    
    // ... 原有同步逻辑 ...
    
  } catch (error) {
    console.error('[自动同步] 失败:', error.message);
  }
}

/**
 * 执行旧供应商API同步
 */
async function runOldSupplierSync() {
  if (!oldService.enabled) {
    return;
  }
  
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    console.log(`[旧供应商] 开始自动同步: ${dateStr}`);
    const result = await oldService.syncDayData(dateStr);
    console.log(`[旧供应商] 同步完成:`, result);
  } catch (error) {
    console.error('[旧供应商] 同步失败:', error.message);
  }
}

/**
 * 启动定时任务
 */
function startSchedulers() {
  console.log('[定时任务] 启动调度器...');
  
  // 云途安同步：每2小时
  setInterval(() => {
    console.log('[定时任务] 触发云途安同步');
    runYuntinanSync('recent');
  }, 2 * 60 * 60 * 1000);
  
  // 旧供应商同步：每天凌晨4点
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(4, 0, 0, 0);
  const msUntil4am = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    console.log('[定时任务] 触发旧供应商同步');
    runOldSupplierSync();
    
    // 之后每天执行
    setInterval(() => {
      runOldSupplierSync();
    }, 24 * 60 * 60 * 1000);
  }, msUntil4am);
  
  console.log(`[定时任务] 下次云途安同步: 2小时后`);
  console.log(`[定时任务] 下次旧供应商同步: 明天凌晨4点`);
}

module.exports = {
  runYuntinanSync,
  runOldSupplierSync,
  startSchedulers
};
```

---

### Step 7: 重构 index.js（1小时）

创建新的精简版 index.js：

```javascript
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ===================== 中间件 =====================
const corsMiddleware = require('./middleware/cors');
const upload = require('./middleware/upload');

app.use(corsMiddleware);

// ===================== 数据库初始化 =====================
const db = require('./services/db');
let dbReady = false;

async function startServer() {
  await db.init();
  dbReady = true;
  console.log('[DB] 数据库就绪');

  // 修复旧数据
  db.repairAcreData();
  db.repairMachineData();

  // ===================== 路由 =====================
  const routes = require('./routes');
  app.use('/api', routes);

  // 静态文件
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ===================== 启动服务器 =====================
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 聚合平台已启动: http://localhost:${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/health`);
    console.log(`   前端: http://localhost:${PORT}\n`);
  });

  // ===================== 定时任务 =====================
  const scheduler = require('./services/scheduler');
  scheduler.startSchedulers();
}

// 启动
startServer().catch(err => {
  console.error('[启动失败]', err);
  process.exit(1);
});
```

---

## ✅ 测试清单

### 每步完成后测试

```bash
# 1. 语法检查
node -c middleware/cors.js
node -c middleware/upload.js
node -c utils/token.js
node -c middleware/auth.js
node -c routes/oldSupplier.js
# ... 检查所有文件

# 2. 启动服务
node index.js

# 3. 测试关键API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/old/stats
curl http://localhost:3000/api/device/list

# 4. 前端测试
# 打开浏览器访问 http://localhost:3000
# 测试登录、数据查询等功能

# 5. 检查日志
# 确认没有错误输出
# 确认定时任务正常启动
```

---

## 🔄 回退方案

如果某一步出现问题：

```bash
# 1. 停止服务
Ctrl+C

# 2. 恢复备份
git checkout index.js

# 3. 删除新建的文件
rm -rf middleware/ routes/ utils/

# 4. 重新启动
node index.js
```

**建议**：每完成一个Step就提交一次git：
```bash
git add middleware/cors.js middleware/upload.js
git commit -m "refactor: 提取CORS和上传中间件"

git add utils/token.js
git commit -m "refactor: 提取Token工具函数"

# ... 依此类推
```

---

## ⏱️ 时间估算

| 步骤 | 工作内容 | 预计时间 |
|------|---------|---------|
| Step 1 | 创建目录结构 | 5分钟 |
| Step 2 | 提取中间件 | 30分钟 |
| Step 3 | 提取认证中间件 | 30分钟 |
| Step 4 | 拆分路由模块 | 2-3小时 |
| Step 5 | 创建路由汇总 | 15分钟 |
| Step 6 | 创建定时任务服务 | 30分钟 |
| Step 7 | 重构index.js | 1小时 |
| 测试 | 全面测试 | 1小时 |
| **总计** | | **5-6小时** |

---

## 🎯 成功标准

- ✅ 所有API接口正常工作
- ✅ 前端页面无报错
- ✅ 定时任务正常执行
- ✅ 代码行数减少（index.js从1612行降到约150行）
- ✅ 可维护性提升（模块化清晰）

---

## 💡 注意事项

1. **不要一次性完成所有步骤** - 分天进行，每天2-3个Step
2. **每一步都要测试** - 确保功能正常再继续
3. **保留备份** - git提交前不要删除原代码
4. **文档同步更新** - 更新PROJECT_STRUCTURE.md
5. **团队沟通** - 告知团队成员正在进行重构

---

**开始时间**: 待定  
**负责人**: 开发团队  
**预计完成**: 2-3天内
