/**
 * 旧供应商API路由
 * @module routes/oldSupplier
 * @description 处理旧供应商（北斗设备）相关的API请求
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { requireAuth, requireSuper } = require('../middleware/auth');
const db = require('../services/db');
const oldService = require('../services/oldSupplierService');

// ===================== 旧供应商数据查询 API =====================

/**
 * 获取旧供应商统计
 * @route GET /api/old/stats
 */
router.get('/stats', (req, res) => {
  try {
    const stats = db.getOldStats();
    res.json({ code: 0, data: stats });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 获取旧供应商设备列表
 * @route GET /api/old/machines
 */
router.get('/machines', async (req, res) => {
  try {
    const machines = await db.getOldMachines();
    const result = machines || [];
    res.json({ code: 0, data: result, total: result.length });
  } catch (e) {
    console.error('[旧供应商设备] 查询失败:', e.message);
    res.json({ code: -1, msg: e.message, data: [], total: 0 });
  }
});

/**
 * 获取旧供应商作业记录
 * @route GET /api/old/records
 */
router.get('/records', (req, res) => {
  try {
    const { tNumber, workType, startDate, endDate, limit } = req.query;
    const records = db.getOldWorkRecords({
      tNumber, 
      workType, 
      startDate, 
      endDate,
      limit: limit ? parseInt(limit) : undefined
    });
    res.json({ code: 0, data: records, total: records.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ===================== 新I日供应商API集成 =====================

/**
 * 导入设备映射表
 * @route POST /api/old-api/import-devices
 * @access Super Admin
 */
router.post('/import-devices', requireAuth, requireSuper, async (req, res) => {
  try {
    const csvPath = path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv');
    const result = await oldService.importDeviceMapping(csvPath);
    res.json({ code: 0, data: result, msg: '导入成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 手动同步指定日期
 * @route POST /api/old-api/sync
 * @access Super Admin
 * @body {string} date - 单天日期 YYYY-MM-DD
 * @body {string} startDate - 开始日期（批量同步）
 * @body {string} endDate - 结束日期（批量同步）
 */
router.post('/sync', requireAuth, requireSuper, async (req, res) => {
  try {
    const { date, startDate, endDate } = req.body;
    
    let result;
    if (startDate && endDate) {
      // 批量同步日期范围
      result = await oldService.syncDateRange(startDate, endDate);
      res.json({ 
        code: 0, 
        data: result, 
        msg: `批量同步完成，共处理 ${result.length} 天` 
      });
    } else {
      // 同步单天
      result = await oldService.syncDayData(date);
      
      if (result.success) {
        res.json({ 
          code: 0, 
          data: result,
          msg: `同步完成: 总设备${result.totalDevices}台, 成功${result.successCount}台, 失败${result.failCount}台, 面积${result.totalAcre.toFixed(2)}亩, 批次${result.batchCount}, 耗时${result.elapsedSeconds}秒`
        });
      } else {
        res.json({ 
          code: -1, 
          msg: result.message || '同步失败' 
        });
      }
    }
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 获取新I日供应商API统计
 * @route GET /api/old-api/stats
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await oldService.getStats(startDate, endDate);
    res.json({ code: 0, data: stats });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 获取设备列表
 * @route GET /api/old-api/devices
 */
router.get('/devices', requireAuth, async (req, res) => {
  try {
    const devices = await db.queryAll(
      'SELECT * FROM old_supplier_devices ORDER BY macid'
    );
    res.json({ code: 0, data: devices, total: devices.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
