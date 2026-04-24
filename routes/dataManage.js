/**
 * 数据导入和管理路由
 * @module routes/dataManage
 * @description 处理Excel导入、导入历史、聚合统计等功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const { requireAuth, requireSuper } = require('../middleware/auth');
const upload = require('../middleware/upload');
const db = require('../services/db');
const excelImport = require('../services/excelImport');
const yt = require('../services/yunTinanService');

/**
 * 获取导入历史
 * @route GET /api/imports
 */
router.get('/imports', (req, res) => {
  try {
    const history = db.getImportHistory();
    res.json({ code: 0, data: history });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * Excel 预览（上传后先预览，不写入数据库）
 * @route POST /api/import/preview
 * @access Super Admin
 */
router.post('/import/preview', requireAuth, requireSuper, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.json({ code: -1, msg: '请上传文件' });
    const importType = req.body.importType || 'work_records';
    
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

/**
 * Excel 确认导入（写入数据库）
 * @route POST /api/import/confirm
 * @access Super Admin
 */
router.post('/import/confirm', requireAuth, requireSuper, upload.single('file'), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) return res.json({ code: -1, msg: '请上传文件' });
    
    filePath = req.file.path;
    const importType = req.body.importType || 'work_records';
    const mappingOverrides = req.body.mapping ? JSON.parse(req.body.mapping) : {};

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

/**
 * 聚合统计（云途安 + 旧供应商）
 * @route GET /api/stats/all
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/stats/all', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // 云途安实时数据
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

module.exports = router;
