require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 文件上传配置（使用磁盘存储，避免内存泄漏）
const uploadDir = path.join(__dirname, 'uploads');
// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // 使用时间戳+随机数生成唯一文件名
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueSuffix + ext);
    }
  }),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 限制10MB
    files: 1 // 每次只允许一个文件
  },
  fileFilter: (req, file, cb) => {
    // 只允许Excel文件
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 格式的Excel文件'), false);
    }
  }
});

// ===================== 数据库初始化 =====================
const db = require('./services/db');
let dbReady = false;

async function startServer() {
  await db.init();
  dbReady = true;
  console.log('[DB] 数据库就绪');

  // 修复旧数据：acre=0 的记录用 ok_acre 回填
  db.repairAcreData();

  // 修复旧数据：从作业记录提取设备信息写入 machines 表
  db.repairMachineData();

  // 路由
  setupRoutes();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 聚合平台已启动: http://localhost:${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/health`);
    console.log(`   前端: http://localhost:${PORT}\n`);
  });

  // ===================== 云途安数据自动同步 =====================

  /**
   * 执行云途安数据同步（核心函数）
   * @param {'all'|'recent'} mode - all=全量同步(首次), recent=增量同步(每日,拉最近7天)
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

      // 全量模式：只在没有任何成功记录时自动触发
      if (mode === 'all') {
        console.log(`[自动同步] 首次启动，执行全量同步...`);
      } else {
        console.log(`[自动同步] 每日增量同步，拉取最近7天数据...`);
      }

      db.createSyncLog(today, mode);

      const yt = require('./services/yunTinanService');
      const result = await yt.syncData(mode === 'all' ? 'all' : 'recent', 7);

      // 构建machineMap
      const machineMap = {};
      for (const [tNumber, m] of Object.entries(result.machineMap)) {
        machineMap[tNumber] = {
          plateNo: m.plateNo,
          driverName: m.driverName,
          orgName: m.orgName
        };
      }

      // 写入本地DB（靠唯一索引去重）
      const dbResult = await db.syncYuntinanRecords(result.records, machineMap);

      db.updateSyncLog(today, {
        status: 'success',
        total_records: dbResult.totalRecords,
        new_records: dbResult.newRecords,
        update_records: dbResult.updateRecords,
        finished_at: new Date().toLocaleString('zh-CN')
      });

      const label = mode === 'all' ? '全量' : '增量';
      console.log(`[自动同步] ${label}同步完成: ${dbResult.newRecords} 新增, ${dbResult.updateRecords} 更新, 共处理 ${dbResult.totalRecords} 条`);
    } catch (e) {
      console.error(`[自动同步] 同步失败:`, e.message);
      try {
        db.updateSyncLog(today, {
          status: 'failed',
          error: e.message,
          finished_at: new Date().toLocaleString('zh-CN')
        });
      } catch (_) {}
    }
  }

  // 启动后10秒：检查是否需要全量同步，否则增量同步
  setTimeout(() => {
    const hasSuccess = (() => {
      try { const l = db.getLatestSyncLog(); return l && l.status === 'success'; } catch(_) { return false; }
    })();
    const mode = hasSuccess ? 'recent' : 'all';
    console.log(`[自动同步] 10秒后将执行${mode === 'all' ? '全量' : '增量'}同步...`);
    runYuntinanSync(mode).catch(e => console.error('[自动同步] 启动同步失败:', e.message));
  }, 10000);

  // 每天凌晨 2:00 自动增量同步（拉最近7天，靠去重避免重复）
  function scheduleNextSync() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next - now;
    console.log(`[自动同步] 下次定时同步: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

    setTimeout(() => {
      runYuntinanSync('recent').catch(e => console.error('[定时同步] 失败:', e.message));
      // 注册下一天的定时
      scheduleNextSync();
    }, delay);
  }

  scheduleNextSync();

  // ===================== 旧供应商数据自动抓取（已禁用）=====================
  // 注：由于新I日供应商API已启用，旧的Playwright爬虫方式已不再需要
  // 如需重新启用，请将 ENABLE_OLD_CRAWLER 设置为 true
  
  if (process.env.ENABLE_OLD_CRAWLER === 'true') {
    // 每天凌晨 3:00 自动抓取旧供应商数据（最近7天）
    function scheduleOldSupplierCrawl() {
      const now = new Date();
      const next = new Date(now);
      next.setHours(3, 0, 0, 0); // 凌晨3点
      if (next <= now) next.setDate(next.getDate() + 1);

      const delay = next - now;
      console.log(`[旧供应商抓取] 下次定时抓取: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

      setTimeout(async () => {
        try {
          console.log('[定时任务] 开始抓取旧供应商数据...');
          const crawler = require('./services/oldSupplierCrawler');
          const result = await crawler.crawlOldSupplierData({ days: 7 });
          console.log('[定时任务] 旧供应商抓取完成:', result);
        } catch (e) {
          console.error('[定时任务] 旧供应商抓取失败:', e.message);
        }
        // 注册下一天的定时
        scheduleOldSupplierCrawl();
      }, delay);
    }

    scheduleOldSupplierCrawl();
  } else {
    console.log('[旧供应商抓取] 已禁用（使用新I日供应商API替代）');
  }

  // ===================== 新I日供应商API自动同步 =====================
  
  // 每天凌晨 4:00 自动同步新I日供应商API数据（昨天）
  function scheduleOldAPISync() {
    // 检查是否启用
    if (process.env.ENABLE_OLD_SYNC !== 'true') {
      console.log('[新I日供应商API] 同步功能未启用（设置 ENABLE_OLD_SYNC=true 以启用）');
      return;
    }

    const now = new Date();
    const next = new Date(now);
    next.setHours(4, 0, 0, 0); // 凌晨4点
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next - now;
    console.log(`[新I日供应商API] 下次定时同步: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

    setTimeout(async () => {
      try {
        console.log('[定时任务] 开始同步新I日供应商API数据...');
        const oldService = require('./services/oldSupplierService');
        
        // 启动时先导入CSV映射表
        const csvPath = require('path').join(__dirname, '终端映射表_清理版.csv');
        await oldService.importDeviceMapping(csvPath);
        
        // 同步昨天的数据
        const result = await oldService.syncDayData();
        console.log('[定时任务] 新I日供应商API同步完成:', result);
      } catch (e) {
        console.error('[定时任务] 新I日供应商API同步失败:', e.message);
      }
      // 注册下一天的定时
      scheduleOldAPISync();
    }, delay);
  }

  scheduleOldAPISync();
}

function setupRoutes() {

  // ===================== 旧供应商数据 API =====================

  // 获取旧供应商统计
  app.get('/api/old/stats', (req, res) => {
    try {
      const stats = db.getOldStats();
      res.json({ code: 0, data: stats });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取旧供应商设备列表
  app.get('/api/old/machines', (req, res) => {
    try {
      const machines = db.getOldMachines();
      res.json({ code: 0, data: machines, total: machines.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取旧供应商作业记录
  app.get('/api/old/records', (req, res) => {
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

  // ===================== 新I日供应商API集成 =====================

  // 导入设备映射表
  app.post('/api/old-api/import-devices', requireAuth, requireSuper, async (req, res) => {
    try {
      const oldService = require('./services/oldSupplierService');
      const csvPath = require('path').join(__dirname, '终端映射表_清理版.csv');
      const result = await oldService.importDeviceMapping(csvPath);
      res.json({ code: 0, data: result, msg: '导入成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 手动同步指定日期
  app.post('/api/old-api/sync', requireAuth, requireSuper, async (req, res) => {
    try {
      const { date, startDate, endDate } = req.body;
      const oldService = require('./services/oldSupplierService');
      
      let result;
      if (startDate && endDate) {
        // 批量同步日期范围
        result = await oldService.syncDateRange(startDate, endDate);
      } else {
        // 同步单天
        result = await oldService.syncDayData(date);
      }
      
      res.json({ code: 0, data: result, msg: '同步完成' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取新I日供应商API统计
  app.get('/api/old-api/stats', requireAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const oldService = require('./services/oldSupplierService');
      const stats = await oldService.getStats(startDate, endDate);
      res.json({ code: 0, data: stats });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取设备列表
  app.get('/api/old-api/devices', requireAuth, async (req, res) => {
    try {
      const devices = await db.queryAll('SELECT * FROM old_supplier_devices ORDER BY macid');
      res.json({ code: 0, data: devices, total: devices.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 设备作业类型管理 API =====================

  // 农户修改设备作业类型
  app.post('/api/device/work-type', async (req, res) => {
    try {
      const { macid, workTypeName } = req.body;
      
      if (!macid || !workTypeName) {
        return res.json({ code: -1, msg: '参数不完整' });
      }
      
      await db.updateDeviceWorkType(macid, workTypeName);
      res.json({ code: 0, msg: '作业类型已更新' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取设备列表（含作业类型）
  app.get('/api/devices/list', async (req, res) => {
    try {
      const { orgId } = req.query;
      let sql = `SELECT * FROM old_supplier_devices`;
      const params = [];
      
      if (orgId) {
        // 根据合作社ID查找合作社名称
        const org = await db.queryOne(`SELECT name FROM organizations WHERE id = ?`, [orgId]);
        if (org) {
          sql += ` WHERE cooperative_name = ?`;
          params.push(org.name);
        }
      }
      
      sql += ` ORDER BY macid`;
      const devices = await db.queryAll(sql, params);
      res.json({ code: 0, data: devices, total: devices.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 批量更新设备作业类型
  app.post('/api/device/work-type/batch', requireAuth, requireSuper, async (req, res) => {
    try {
      const { macids, workTypeName } = req.body;
      
      if (!macids || !macids.length || !workTypeName) {
        return res.json({ code: -1, msg: '参数不完整' });
      }
      
      const affectedRows = await db.batchUpdateDeviceWorkType(macids, workTypeName);
      res.json({ code: 0, data: { affectedRows }, msg: `已更新 ${affectedRows} 台设备` });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取导入历史
  app.get('/api/imports', (req, res) => {
    try {
      const history = db.getImportHistory();
      res.json({ code: 0, data: history });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // Excel 预览（上传后先预览，不写入数据库）
  app.post('/api/import/preview', requireAuth, requireSuper, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.json({ code: -1, msg: '请上传文件' });
      const importType = req.body.importType || 'work_records';
      const excelImport = require('./services/excelImport');
      
      // 从磁盘读取文件进行预览
      const fileBuffer = fs.readFileSync(req.file.path);
      const preview = excelImport.previewExcel(fileBuffer, importType, 10);
      
      // 预览完成后删除临时文件
      fs.unlinkSync(req.file.path);
      
      res.json({
        code: 0,
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          importType,
          sheets: preview
        }
      });
    } catch (e) {
      // 确保出错时也清理文件
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (err) {}
      }
      res.json({ code: -1, msg: e.message });
    }
  });

  // Excel 确认导入（写入数据库）
  app.post('/api/import/confirm', requireAuth, requireSuper, upload.single('file'), async (req, res) => {
    let filePath = null;
    try {
      if (!req.file) return res.json({ code: -1, msg: '请上传文件' });
      
      filePath = req.file.path; // 保存文件路径用于后续清理
      const importType = req.body.importType || 'work_records';
      const mappingOverrides = req.body.mapping ? JSON.parse(req.body.mapping) : {};
      const excelImport = require('./services/excelImport');

      // 从磁盘读取文件
      const fileBuffer = fs.readFileSync(filePath);
      const result = excelImport.doImport(fileBuffer, importType, mappingOverrides);

      // 如果是 machines 类型，用 upsertMachine 写入
      if (importType === 'machines') {
        const sheets = excelImport.parseExcel(fileBuffer);
        const { mapping } = excelImport.detectColumnMapping(sheets[0]?.headers || []);
        const finalMapping = { ...mapping, ...mappingOverrides };
        let machineCount = 0;
        for (const sheet of sheets) {
          for (const row of sheet.rows) {
            const m = excelImport.transformRow(row, finalMapping, 'machines');
            if (m.t_number) {
              db.upsertMachine(m);
              machineCount++;
            }
          }
        }
        result.successCount = machineCount;
      }

      // 如果是 work_records 类型，用 importWorkRecords 写入
      if (importType === 'work_records') {
        const sheets = excelImport.parseExcel(fileBuffer);
        const { mapping } = excelImport.detectColumnMapping(sheets[0]?.headers || []);
        const finalMapping = { ...mapping, ...mappingOverrides };
        const allRecords = [];
        for (const sheet of sheets) {
          for (const row of sheet.rows) {
            const r = excelImport.transformRow(row, finalMapping, 'work_records');
            if (r.t_number) {
              allRecords.push(r);
            }
          }
        }
        // 创建导入记录
        const importId = db.createImportRecord({
          fileName: req.file.originalname,
          fileSize: req.file.size,
          importType: 'work_records',
          rowCount: allRecords.length,
          status: 'completed'
        });
        const importResult = db.importWorkRecords(allRecords, importId);
        // 更新导入记录
        db.updateImportRecord(importId, {
          success_count: importResult.successCount,
          skip_count: importResult.skipCount,
          error_count: importResult.errorCount,
          errors: importResult.errors.join('\n')
        });
        result.successCount = importResult.successCount;
        result.skipCount = importResult.skipCount;
        result.errorCount = importResult.errorCount;
        result.errors = importResult.errors;
      }

      db.save();
      
      // 导入完成后删除临时文件
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.json({ code: 0, data: result });
    } catch (e) {
      // 确保出错时也清理文件
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) {}
      }
      res.json({ code: -1, msg: e.message });
    }
  });

  // 聚合统计（云途安 + 旧供应商）
  app.get('/api/stats/all', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // 云途安实时数据
      const yt = require('./services/yunTinanService');
      const ytStats = await yt.getAcreStats(startDate, endDate);

      // 旧供应商本地数据
      const oldStats = db.getOldStats();

      res.json({
        code: 0,
        data: {
          yuntinan: ytStats,
          old: oldStats,
          totalMachines: (ytStats.totalMachines || 42) + (oldStats.machineCount || 0),
          totalAcre: (ytStats.totalAcre || ytStats.total || 0) + (oldStats.totalAcre || 0),
          totalOkAcre: (ytStats.totalOkAcre || 0) + (oldStats.totalOkAcre || 0)
        }
      });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 云途安 API（原有） =====================

  // 面积统计
  app.get('/api/stats', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const db = require('./services/db');
      
      // 从数据库快速获取云途安统计数据
      const stats = await db.getYuntinanStats({ startDate, endDate });
      res.json({ code: 0, data: stats });
    } catch (e) {
      console.error('[API] /api/stats error:', e);
      res.json({ code: -1, msg: e.message });
    }
  });

  // 农机列表
  app.get('/api/machines', async (req, res) => {
    try {
      // 从数据库读取云途安设备（同步后的数据）
      const machines = await db.getMachinesBySource('yuntinan');
      res.json({
        code: 0,
        data: machines,
        total: machines.length
      });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 设备详情
  app.get('/api/machines/:id', async (req, res) => {
    try {
      const yt = require('./services/yunTinanService');
      const machine = await yt.getMachineDetail(req.params.id);
      res.json({ code: 0, data: machine });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 设备作业记录
  app.get('/api/machines/:id/acre', async (req, res) => {
    try {
      const yt = require('./services/yunTinanService');
      const { workType = '1', tNumber } = req.query;
      let deviceTNumber = tNumber;
      if (!deviceTNumber) {
        const machine = await yt.getMachineDetail(req.params.id);
        deviceTNumber = machine.tNumber;
      }
      const records = await yt.getAcreList(workType, deviceTNumber);
      res.json({ code: 0, data: records, total: records.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 所有设备作业记录
  app.get('/api/acre', async (req, res) => {
    try {
      const yt = require('./services/yunTinanService');
      const { workType = '1', tNumber } = req.query;
      const records = await yt.getAcreList(workType, tNumber || null);
      res.json({ code: 0, data: records, total: records.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 实时监控
  app.get('/api/monitor', async (req, res) => {
    try {
      const yt = require('./services/yunTinanService');
      const { tNumber } = req.query;
      const list = await yt.getMonitorList(tNumber || null);
      res.json({ code: 0, data: list, total: list.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 作业类型
  app.get('/api/work-types', async (req, res) => {
    try {
      const yt = require('./services/yunTinanService');
      const types = await yt.getWorkTypes();
      res.json({ code: 0, data: types });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ code: 0, msg: 'ok', time: new Date().toISOString(), db: dbReady });
  });

  // ===================== 设备轨迹 =====================
  // 获取设备作业轨迹（从数据库）
  app.get('/api/tracks', async (req, res) => {
    try {
      const { tNumber, workDate } = req.query;
      if (!tNumber || !workDate) {
        return res.json({ code: -1, msg: '缺少 tNumber 或 workDate 参数' });
      }
      const tracks = await db.getMachineTracks(tNumber, workDate);
      res.json({ code: 0, data: tracks, total: tracks.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 同步设备轨迹（从云途安API拉取并保存到数据库）
  app.post('/api/tracks/sync', async (req, res) => {
    try {
      const { tNumber, workDate } = req.body;
      if (!tNumber || !workDate) {
        return res.json({ code: -1, msg: '缺少 tNumber 或 workDate 参数' });
      }

      const yt = require('./services/yunTinanService');
      
      // 1. 从云途安API获取轨迹
      console.log(`[轨迹同步] 开始同步: ${tNumber} ${workDate}`);
      const tracks = await yt.getMachineTrack(tNumber, workDate);
      
      if (tracks.length === 0) {
        return res.json({ code: 0, msg: '该设备当天无轨迹数据', data: [], inserted: 0, skipped: 0 });
      }

      // 2. 保存到数据库
      const result = await db.saveMachineTracks(tracks);
      
      console.log(`[轨迹同步] 完成: ${tNumber} ${workDate}, 新增 ${result.inserted} 条, 跳过 ${result.skipped} 条`);
      
      res.json({ 
        code: 0, 
        msg: '轨迹同步成功',
        data: tracks,
        inserted: result.inserted,
        skipped: result.skipped
      });
    } catch (e) {
      console.error('[轨迹同步] 失败:', e.message);
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== API原始数据管理 =====================
  
  // 获取原始记录列表（分页+筛选）
  app.get('/api/raw-records', async (req, res) => {
    try {
      const filters = req.query;
      const result = await db.getApiRawRecords(filters);
      res.json({ code: 0, data: result });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取单条记录详情
  app.get('/api/raw-records/:id', async (req, res) => {
    try {
      const record = await db.getApiRawRecordById(req.params.id);
      if (!record) {
        return res.json({ code: -1, msg: '记录不存在' });
      }
      res.json({ code: 0, data: record });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 更新记录
  app.put('/api/raw-records/:id', requireAuth, requireSuper, async (req, res) => {
    try {
      const updates = req.body;
      await db.updateApiRawRecord(req.params.id, updates);
      res.json({ code: 0, msg: '更新成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 删除记录（软删除）
  app.post('/api/raw-records/:id/delete', requireAuth, requireSuper, async (req, res) => {
    try {
      await db.deleteApiRawRecord(req.params.id);
      res.json({ code: 0, msg: '删除成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 恢复记录
  app.post('/api/raw-records/:id/restore', requireAuth, requireSuper, async (req, res) => {
    try {
      await db.restoreApiRawRecord(req.params.id);
      res.json({ code: 0, msg: '恢复成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 批量操作
  app.post('/api/raw-records/batch', requireAuth, requireSuper, async (req, res) => {
    try {
      const { ids, updates } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json({ code: -1, msg: '请提供ID列表' });
      }
      await db.batchUpdateApiRawRecords(ids, updates);
      res.json({ code: 0, msg: `批量操作成功，共${ids.length}条` });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ==================== work_records 表管理 API ====================
  
  // 查询列表
  app.get('/api/work-records', requireAuth, async (req, res) => {
    try {
      const filters = req.query;
      const result = await db.getWorkRecords(filters);
      res.json({ code: 0, data: result });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 查询单条
  app.get('/api/work-records/:id', requireAuth, async (req, res) => {
    try {
      const record = await db.getWorkRecordById(req.params.id);
      if (!record) {
        return res.json({ code: -1, msg: '记录不存在' });
      }
      res.json({ code: 0, data: record });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 更新记录
  app.put('/api/work-records/:id', requireAuth, requireSuper, async (req, res) => {
    try {
      const updates = req.body;
      await db.updateWorkRecord(req.params.id, updates);
      res.json({ code: 0, msg: '更新成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 删除记录
  app.delete('/api/work-records/:id', requireAuth, requireSuper, async (req, res) => {
    try {
      await db.deleteWorkRecord(req.params.id);
      res.json({ code: 0, msg: '删除成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 批量更新/删除
  app.post('/api/work-records/batch', requireAuth, requireSuper, async (req, res) => {
    try {
      const { ids, updates } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json({ code: -1, msg: '请提供ID列表' });
      }
      await db.batchUpdateOrDeleteWorkRecords(ids, updates);
      res.json({ code: 0, msg: `批量操作成功，共${ids.length}条` });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 统计信息
  app.get('/api/work-records/stats', requireAuth, async (req, res) => {
    try {
      const filters = req.query;
      const stats = await db.getWorkRecordsStats(filters);
      res.json({ code: 0, data: stats });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 导出明细
  app.get('/api/export/details', async (req, res) => {
    try {
      const filters = req.query;
      const records = await db.exportDetailRecords(filters);

      if (records.length === 0) {
        return res.json({ code: -1, msg: '没有符合条件的数据可导出' });
      }

      const XLSX = require('xlsx');

      // 构建工作表数据
      const rows = records.map((r, i) => ({
        '序号': i + 1,
        '设备号': r.t_number,
        '作业日期': r.work_date || '',
        '作业类型': r.work_type_name || '',
        '作业面积(亩)': Number(r.acre || 0).toFixed(2),
        '达标面积(亩)': Number(r.ok_acre || 0).toFixed(2),
        '车牌号': r.plate_no || '',
        '机手姓名': r.driver_name || '',
        '合作社': r.org_name || '',
        'API接收时间': r.api_received_at || '',
        '是否修改': r.is_modified ? '是' : '否',
        '备注': r.remark || ''
      }));

      // 合计行
      const totalAcre = records.reduce((s, r) => s + Number(r.acre || 0), 0);
      const totalOkAcre = records.reduce((s, r) => s + Number(r.ok_acre || 0), 0);
      rows.push({
        '序号': '',
        '作业日期': '合计',
        '作业面积(亩)': totalAcre.toFixed(2),
        '达标面积(亩)': totalOkAcre.toFixed(2)
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '作业明细');

      // 设置列宽
      ws['!cols'] = [
        { wch: 6 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 10 },
        { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 30 }
      ];

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="作业明细_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.send(buffer);
    } catch (e) {
      console.error('[导出明细] 失败:', e.message);
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 管理员登录 =====================
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.json({ code: -1, msg: '请输入用户名和密码' });
      const admin = await db.loginAdmin(username, password);
      if (!admin) return res.json({ code: -1, msg: '用户名或密码错误' });
      // 生成安全的token（带HMAC签名和过期时间）
      const token = generateToken(admin.username);
      res.json({ code: 0, data: { ...admin, token } });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== Token 工具函数 =====================
  
  // Token密钥（从环境变量读取，如果没有则使用默认值）
  const TOKEN_SECRET = process.env.TOKEN_SECRET || 'agri-gateway-secret-key-2024';
  const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24小时过期
  
  /**
   * 生成安全的Token
   * @param {string} username - 用户名
   * @returns {string} 加密后的token
   */
  function generateToken(username) {
    const timestamp = Date.now();
    const data = `${username}:${timestamp}`;
    // 使用HMAC-SHA256签名
    const signature = crypto.createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('hex');
    // 格式: username:timestamp:signature (base64编码)
    return Buffer.from(`${data}:${signature}`).toString('base64');
  }
  
  /**
   * 验证Token并返回用户信息
   * @param {string} token - base64编码的token
   * @returns {object|null} 验证成功返回{username, timestamp}，失败返回null
   */
  function verifyToken(token) {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const parts = decoded.split(':');
      
      if (parts.length !== 3) {
        return null;
      }
      
      const [username, timestampStr, signature] = parts;
      const timestamp = parseInt(timestampStr);
      
      // 验证时间戳是否过期
      if (Date.now() - timestamp > TOKEN_EXPIRY) {
        console.log('[Token验证] Token已过期');
        return null;
      }
      
      // 重新计算签名并比对
      const data = `${username}:${timestamp}`;
      const expectedSignature = crypto.createHmac('sha256', TOKEN_SECRET)
        .update(data)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.log('[Token验证] 签名不匹配，可能被篡改');
        return null;
      }
      
      return { username, timestamp };
    } catch (e) {
      console.error('[Token验证] 解析失败:', e.message);
      return null;
    }
  }

  // ===================== 权限中间件 =====================
  // 验证管理员登录（从token或请求头获取）
  function requireAuth(req, res, next) {
    const token = req.headers.authorization || req.query.token;
    if (!token) return res.status(401).json({ code: 401, msg: '未登录' });
    
    // 验证token
    const tokenData = verifyToken(token);
    if (!tokenData) {
      return res.status(401).json({ code: 401, msg: 'Token无效或已过期，请重新登录' });
    }
    
    req.admin = { username: tokenData.username };
    next();
  }

  // 超管权限验证
  async function requireSuper(req, res, next) {
    const token = req.headers.authorization || req.query.token;
    if (!token) return res.status(403).json({ code: 403, msg: '无权限' });
    
    try {
      // 验证token
      const tokenData = verifyToken(token);
      if (!tokenData) {
        return res.status(401).json({ code: 401, msg: 'Token无效或已过期' });
      }
      
      // 查询管理员角色
      const admins = await db.getAdminList();
      const admin = admins.find(a => a.username === tokenData.username);
      
      if (!admin || admin.role !== 'super') {
        return res.status(403).json({ code: 403, msg: '无权限，需要超管角色' });
      }
      
      req.admin = admin;
      next();
    } catch (e) {
      console.error('[权限验证] 错误:', e.message);
      return res.status(403).json({ code: 403, msg: '权限验证失败' });
    }
  }

  // ===================== 管理员 CRUD（超管专属） =====================
  app.get('/api/admins', requireAuth, requireSuper, async (req, res) => {
    try {
      const admins = await db.getAdminList();
      res.json({ code: 0, data: admins, total: admins.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.post('/api/admins', requireAuth, requireSuper, async (req, res) => {
    try {
      const { username, password, name, role, status } = req.body;
      if (!username || !password) return res.json({ code: -1, msg: '用户名和密码不能为空' });
      
      // 检查用户名是否已存在
      const admins = await db.getAdminList();
      if (admins.find(a => a.username === username)) {
        return res.json({ code: -1, msg: '用户名已存在' });
      }
      
      const id = await db.createAdmin({ username, password, name, role, status });
      res.json({ code: 0, data: { id }, msg: '添加成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.put('/api/admins/:id', requireAuth, requireSuper, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = { ...req.body };
      if (data.status !== undefined) data.status = data.status ? 1 : 0;
      await db.updateAdmin(id, data);
      res.json({ code: 0, msg: '更新成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.delete('/api/admins/:id', requireAuth, requireSuper, async (req, res) => {
    try {
      await db.deleteAdmin(parseInt(req.params.id));
      res.json({ code: 0, msg: '删除成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 农户登录 =====================
  app.post('/api/farmer/login', async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) return res.json({ code: -1, msg: '请输入手机号和密码' });
      const farmer = await db.loginFarmer(phone, password);
      if (!farmer) return res.json({ code: -1, msg: '账号或密码错误' });
      // 生成安全的token（带HMAC签名和过期时间）
      const token = generateToken(farmer.phone);
      res.json({ code: 0, data: { ...farmer, token } });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 农户数据 =====================
  // 获取农户统计（本地旧供应商数据）
  app.get('/api/farmer/stats', async (req, res) => {
    try {
      const orgId = parseInt(req.query.orgId);
      if (!orgId) return res.json({ code: -1, msg: '缺少 orgId' });
      const { startDate, endDate } = req.query;
      const stats = await db.getFarmerStats(orgId, { startDate, endDate });
      res.json({ code: 0, data: stats });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取农户作业记录（本地旧供应商数据）
  app.get('/api/farmer/records', async (req, res) => {
    try {
      const orgId = parseInt(req.query.orgId);
      if (!orgId) return res.json({ code: -1, msg: '缺少 orgId' });
      const { tNumber, workType, startDate, endDate, limit } = req.query;
      const records = await db.getFarmerWorkRecords(orgId, { tNumber, workType, startDate, endDate, limit: limit ? parseInt(limit) : undefined });
      res.json({ code: 0, data: records, total: records.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 管理端 - 农户 CRUD =====================
  app.get('/api/farmers', async (req, res) => {
    try {
      const farmers = await db.getFarmerList();
      res.json({ code: 0, data: farmers, total: farmers.length });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.post('/api/farmers', async (req, res) => {
    try {
      const { phone, password, name, org_name, org_id, remark } = req.body;
      if (!phone) return res.json({ code: -1, msg: '手机号不能为空' });
      // 检查重复
      const farmers = await db.getFarmerList();
      const existing = farmers.find(f => f.phone === phone);
      if (existing) return res.json({ code: -1, msg: '该手机号已存在' });
      const id = await db.createFarmer({ phone, password, name, org_name, org_id: org_id ? parseInt(org_id) : 0, remark });
      res.json({ code: 0, data: { id }, msg: '添加成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.put('/api/farmers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = { ...req.body };
      if (data.org_id) data.org_id = parseInt(data.org_id);
      if (data.enabled !== undefined) data.enabled = data.enabled ? 1 : 0;
      await db.updateFarmer(id, data);
      res.json({ code: 0, msg: '更新成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  app.delete('/api/farmers/:id', async (req, res) => {
    try {
      await db.deleteFarmer(parseInt(req.params.id));
      res.json({ code: 0, msg: '删除成功' });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取合作社列表（用于下拉选择）
  app.get('/api/organizations', async (req, res) => {
    try {
      const orgs = await db.getOrganizations();
      res.json({ code: 0, data: orgs });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 数据核对（农业局） =====================

  // 同步状态查询
  app.get('/api/sync/status', async (req, res) => {
    try {
      const latest = await db.getLatestSyncLog();
      const history = await db.getSyncHistory(10);
      res.json({ code: 0, data: { latest, history } });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 手动触发同步云途安数据
  // POST body: { mode: 'all'|'recent' }  all=全量同步, recent=增量同步(默认)
  app.post('/api/sync/yuntinan', requireAuth, requireSuper, async (req, res) => {
    try {
      const { mode, date } = req.body; // 'all' / 'recent' / 'single'
      let syncMode = 'recent'; // 默认增量同步
      let syncDate = new Date().toISOString().substring(0, 10);
      
      if (mode === 'all') {
        syncMode = 'all';
      } else if (mode === 'single' && date) {
        syncMode = 'single';
        syncDate = date;
      }

      // 检查是否已在同步
      const existing = db.getLatestSyncLog();
      if (existing && existing.status === 'running') {
        return res.json({ code: -1, msg: '正在同步中，请稍后再试' });
      }

      // 创建同步日志
      db.createSyncLog(syncDate, syncMode);

      // 异步执行同步（不阻塞响应）
      setImmediate(async () => {
        try {
          const yt = require('./services/yunTinanService');
          let result;
          
          if (syncMode === 'single') {
            // 同步指定日期
            result = await yt.syncSingleDate(syncDate);
          } else {
            // 全量或增量同步
            result = await yt.syncData(syncMode, 7);
          }

          // 构建machineMap
          const machineMap = {};
          for (const [tNumber, m] of Object.entries(result.machineMap)) {
            machineMap[tNumber] = {
              plateNo: m.plateNo,
              driverName: m.driverName,
              orgName: m.orgName
            };
          }

          // 写入本地DB
          const dbResult = db.syncYuntinanRecords(result.records, machineMap);

          // 更新同步日志
          db.updateSyncLog(syncDate, {
            status: 'success',
            total_records: dbResult.totalRecords,
            new_records: dbResult.newRecords,
            update_records: dbResult.updateRecords,
            finished_at: new Date().toLocaleString('zh-CN')
          });

          let label;
          if (syncMode === 'all') label = '全量';
          else if (syncMode === 'single') label = `指定日期(${syncDate})`;
          else label = '增量';
          console.log(`[同步] ${label}同步完成: ${dbResult.newRecords} 新增, ${dbResult.updateRecords} 更新`);
        } catch (e) {
          db.updateSyncLog(syncDate, {
            status: 'failed',
            error: e.message,
            finished_at: new Date().toLocaleString('zh-CN')
          });
          console.error(`[同步] 失败:`, e.message);
        }
      });

      let label;
      if (syncMode === 'all') label = '全量';
      else if (syncMode === 'single') label = `指定日期(${syncDate})`;
      else label = '增量';
      res.json({ code: 0, msg: `已开始${label}同步`, data: { mode: syncMode, date: syncDate } });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 全县汇总统计（统一从本地DB读取）
  app.get('/api/agri/summary', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const summary = await db.getAgriSummaryAll({ startDate, endDate });
      res.json({ code: 0, data: summary });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // Excel 导出（统一从本地DB读取）
  app.get('/api/agri/export', async (req, res) => {
    try {
      const { startDate, endDate, orgId, workType } = req.query;
      const allRecords = await db.getExportRecordsAll({ startDate, endDate, orgId, workType });

      // 确保 allRecords 是数组
      if (!Array.isArray(allRecords)) {
        console.error('[导出] allRecords 不是数组:', typeof allRecords, allRecords);
        return res.json({ code: -1, msg: '数据格式错误' });
      }

      if (allRecords.length === 0) {
        return res.json({ code: -1, msg: '没有符合条件的数据可导出' });
      }

      const XLSX = require('xlsx');

      // 构建工作表数据
      const rows = allRecords.map((r, i) => ({
        '序号': i + 1,
        '数据来源': r.source === 'yuntinan' ? '云途安' : '旧供应商',
        '合作社': r.org_name || '未知',
        '机手姓名': r.driver_name || '',
        '车牌号': r.plate_no || r.t_number,
        '设备号': r.t_number,
        '作业日期': r.work_date || '',
        '作业类型': r.work_type_name || '',
        '作业面积(亩)': Number(r.acre || 0).toFixed(2),
        '达标面积(亩)': Number(r.ok_acre || 0).toFixed(2),
        '作业时长(分钟)': r.work_duration || ''
      }));

      // 合计行
      const totalAcre = allRecords.reduce((s, r) => s + Number(r.acre || 0), 0);
      const totalOkAcre = allRecords.reduce((s, r) => s + Number(r.ok_acre || 0), 0);
      const oldCount = allRecords.filter(r => r.source === 'old').length;
      const ytCount = allRecords.filter(r => r.source === 'yuntinan').length;
      rows.push({});
      rows.push({
        '序号': '',
        '数据来源': `旧供应商${oldCount}条 + 云途安${ytCount}条`,
        '合作社': '合计',
        '机手姓名': '',
        '车牌号': `${new Set(allRecords.map(r => r.t_number)).size}台设备`,
        '设备号': '',
        '作业日期': '',
        '作业类型': `${allRecords.length}条记录`,
        '作业面积(亩)': totalAcre.toFixed(2),
        '达标面积(亩)': totalOkAcre.toFixed(2),
        '作业时长(分钟)': ''
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // 设置列宽
      ws['!cols'] = [
        { wch: 6 },  // 序号
        { wch: 12 }, // 数据来源
        { wch: 14 }, // 合作社
        { wch: 10 }, // 机手姓名
        { wch: 12 }, // 车牌号
        { wch: 16 }, // 设备号
        { wch: 12 }, // 作业日期
        { wch: 10 }, // 作业类型
        { wch: 14 }, // 作业面积
        { wch: 14 }, // 达标面积
        { wch: 14 }  // 作业时长
      ];

      XLSX.utils.book_append_sheet(wb, ws, '作业明细');

      const dateStr = startDate && endDate ? `${startDate}_${endDate}` : '全部';
      const fileName = `农机作业数据核对_${dateStr}.xlsx`;

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.send(buf);
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 旧供应商数据抓取 API =====================
  
  // 手动触发抓取
  app.post('/api/old/crawl', requireAuth, requireSuper, async (req, res) => {
    try {
      const { days = 7, startDate, endDate } = req.body;
      
      console.log('[API] 收到手动抓取请求');
      
      // 异步执行抓取任务（不阻塞响应）
      setImmediate(async () => {
        try {
          const crawler = require('./services/oldSupplierCrawler');
          const result = await crawler.crawlOldSupplierData({ days, startDate, endDate });
          console.log('[API] 抓取任务完成:', result);
        } catch (e) {
          console.error('[API] 抓取任务失败:', e.message);
        }
      });
      
      res.json({ 
        code: 0, 
        msg: '抓取任务已启动，请稍后查看状态',
        data: { status: 'running' }
      });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 查询抓取状态
  app.get('/api/old/crawl/status', async (req, res) => {
    try {
      const { logId } = req.query;
      
      if (logId) {
        // 查询指定日志
        const log = await db.queryOne(`SELECT * FROM crawl_log WHERE id = ?`, [parseInt(logId)]);
        if (!log) {
          return res.json({ code: -1, msg: '日志不存在' });
        }
        
        // 计算持续时间
        let duration = null;
        if (log.started_at && log.finished_at) {
          const start = new Date(log.started_at);
          const end = new Date(log.finished_at);
          const diffMs = end - start;
          const diffMins = Math.round(diffMs / 60000);
          duration = `${diffMins}分钟`;
        }
        
        res.json({ 
          code: 0, 
          data: {
            ...log,
            duration
          }
        });
      } else {
        // 返回最近的日志
        const latest = await db.getLatestCrawlLog('old');
        res.json({ code: 0, data: latest });
      }
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 获取抓取历史
  app.get('/api/old/crawl/logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      
      const logs = await db.getCrawlHistory('old', limit);
      const total = await db.queryOne(`SELECT COUNT(*) as cnt FROM crawl_log WHERE source = 'old'`);
      
      res.json({ 
        code: 0, 
        data: logs,
        total: total.cnt,
        page,
        limit
      });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 全量数据导出 API =====================

  // 导出预览
  app.get('/api/export/preview', async (req, res) => {
    try {
      const filters = req.query;
      const preview = await db.getExportPreview(filters);
      res.json({ code: 0, data: preview });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 数据一致性检查
  app.get('/api/export/validate', requireAuth, requireSuper, async (req, res) => {
    try {
      const validation = await db.validateDataConsistency();
      res.json({ code: 0, data: validation });
    } catch (e) {
      res.json({ code: -1, msg: e.message });
    }
  });

  // 全量数据导出
  app.get('/api/export/all-records', requireAuth, async (req, res) => {
    try {
      const filters = req.query;
      
      // 获取合并后的数据
      const records = await db.getAllWorkRecords(filters);
      
      if (!records || records.length === 0) {
        return res.json({ code: -1, msg: '没有数据可导出' });
      }

      // 使用xlsx库生成Excel
      const XLSX = require('xlsx');
      
      // Sheet1: 明细数据
      const detailData = records.map((r, index) => ({
        '序号': index + 1,
        '数据来源': r.source === 'yuntinan' ? '云途安' : '旧供应商',
        '数据状态': r.data_status,
        '设备号': r.t_number,
        '车牌号': r.plate_no || '-',
        '作业日期': r.work_date || '-',
        '作业类型': r.work_type_name || '-',
        '作业面积(亩)': parseFloat(r.acre || 0).toFixed(2),
        '达标面积(亩)': parseFloat(r.ok_acre || 0).toFixed(2),
        '机手姓名': r.driver_name || '-',
        '合作社': r.org_name || '-',
        '修改备注': r.remark || '',
        '更新时间': r.updated_at || '-'
      }));

      // Sheet2: 按数据源统计
      const bySource = {};
      records.forEach(r => {
        const source = r.source === 'yuntinan' ? '云途安' : '旧供应商';
        if (!bySource[source]) {
          bySource[source] = { count: 0, totalAcre: 0 };
        }
        bySource[source].count++;
        bySource[source].totalAcre += parseFloat(r.acre || 0);
      });

      const sourceStatsData = Object.entries(bySource).map(([source, stats]) => ({
        '数据源': source,
        '记录数': stats.count,
        '作业面积(亩)': stats.totalAcre.toFixed(2)
      }));
      
      // 添加合计行
      sourceStatsData.push({
        '数据源': '合计',
        '记录数': records.length,
        '作业面积(亩)': records.reduce((sum, r) => sum + parseFloat(r.acre || 0), 0).toFixed(2)
      });

      // Sheet3: 按合作社统计
      const byOrg = {};
      records.forEach(r => {
        const org = r.org_name || '未知合作社';
        if (!byOrg[org]) {
          byOrg[org] = { count: 0, totalAcre: 0 };
        }
        byOrg[org].count++;
        byOrg[org].totalAcre += parseFloat(r.acre || 0);
      });

      const orgStatsData = Object.entries(byOrg)
        .map(([org, stats]) => ({
          '合作社': org,
          '记录数': stats.count,
          '作业面积(亩)': stats.totalAcre.toFixed(2)
        }))
        .sort((a, b) => b['记录数'] - a['记录数']);

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      const ws1 = XLSX.utils.json_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, ws1, '明细数据');
      
      const ws2 = XLSX.utils.json_to_sheet(sourceStatsData);
      XLSX.utils.book_append_sheet(wb, ws2, '按数据源统计');
      
      const ws3 = XLSX.utils.json_to_sheet(orgStatsData);
      XLSX.utils.book_append_sheet(wb, ws3, '按合作社统计');

      // 生成buffer
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // 设置响应头
      const startDate = filters.startDate || '开始';
      const endDate = filters.endDate || '结束';
      const filename = `全量作业数据_${startDate}_${endDate}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', excelBuffer.length);
      
      res.send(excelBuffer);

    } catch (e) {
      console.error('导出失败:', e);
      res.json({ code: -1, msg: e.message });
    }
  });

  // ===================== 静态文件 =====================
  app.use(express.static(path.join(__dirname, 'public')));

  // SPA fallback
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// 启动
startServer().catch(e => {
  console.error('启动失败:', e);
  process.exit(1);
});
