/**
 * 云途安API路由
 * @module routes/yunTinan
 * @description 处理云途安（新供应商）相关的API请求
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const yt = require('../services/yunTinanService');

/**
 * 面积统计
 * @route GET /api/stats
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // 从数据库快速获取云途安统计数据
    const stats = await db.getYuntinanStats({ startDate, endDate });
    res.json({ code: 0, data: stats });
  } catch (e) {
    console.error('[API] /api/stats error:', e);
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 农机列表
 * @route GET /api/machines
 */
router.get('/machines', async (req, res) => {
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

/**
 * 设备详情
 * @route GET /api/machines/:id
 */
router.get('/machines/:id', async (req, res) => {
  try {
    const machine = await yt.getMachineDetail(req.params.id);
    res.json({ code: 0, data: machine });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 设备作业记录
 * @route GET /api/machines/:id/acre
 * @query {string} workType - 作业类型
 * @query {string} tNumber - 终端编号
 */
router.get('/machines/:id/acre', async (req, res) => {
  try {
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

/**
 * 所有设备作业记录
 * @route GET /api/acre
 * @query {string} workType - 作业类型
 * @query {string} tNumber - 终端编号（可选）
 */
router.get('/acre', async (req, res) => {
  try {
    const { workType = '1', tNumber } = req.query;
    const records = await yt.getAcreList(workType, tNumber || null);
    res.json({ code: 0, data: records, total: records.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 实时监控
 * @route GET /api/monitor
 * @query {string} tNumber - 终端编号（可选）
 */
router.get('/monitor', async (req, res) => {
  try {
    const { tNumber } = req.query;
    const list = await yt.getMonitorList(tNumber || null);
    res.json({ code: 0, data: list, total: list.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 作业类型
 * @route GET /api/work-types
 */
router.get('/work-types', async (req, res) => {
  try {
    const types = await yt.getWorkTypes();
    res.json({ code: 0, data: types });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 手动同步（云途安 + 旧供应商API）
 * @route POST /api/sync/yuntinan
 * @body {string} mode - 同步模式：'all'(全量), 'recent'(增量，默认), 'single'(单日期)
 * @body {string} date - 单日期 YYYY-MM-DD（mode='single'时使用）
 */
router.post('/sync/yuntinan', async (req, res) => {
  try {
    const { mode = 'recent', date } = req.body;
    
    console.log(`[手动同步] 开始同步: mode=${mode}, date=${date || 'N/A'}`);
    
    const results = {
      yuntinan: null,
      oldApi: null,
      startTime: new Date().toISOString()
    };
    
    // 1. 同步云途安数据
    try {
      console.log('[手动同步] 1/2 同步云途安数据...');
      const scheduler = require('../services/scheduler');
      
      if (mode === 'single' && date) {
        // 单日期同步：使用 syncSingleDate
        const ytService = require('../services/yunTinanService');
        const result = await ytService.syncSingleDate(date);
        
        // 构建machineMap并保存到数据库
        const machineMap = {};
        for (const [tNumber, m] of Object.entries(result.machineMap)) {
          machineMap[tNumber] = {
            plateNo: m.plateNo,
            driverName: m.driverName,
            orgName: m.orgName
          };
        }
        
        const dbResult = await db.syncYuntinanRecords(result.records, machineMap);
        
        results.yuntinan = {
          success: true,
          mode: 'single',
          date,
          records: dbResult.totalRecords,
          newRecords: dbResult.newRecords,
          updateRecords: dbResult.updateRecords
        };
      } else {
        // 全量或增量同步
        await scheduler.runYuntinanSync(mode);
        
        results.yuntinan = {
          success: true,
          mode,
          message: '同步完成，请查看日志'
        };
      }
      
      console.log('[手动同步] 云途安同步完成');
    } catch (error) {
      console.error('[手动同步] 云途安同步失败:', error.message);
      results.yuntinan = {
        success: false,
        error: error.message
      };
    }
    
    // 2. 同步旧供应商API数据（昨天）
    try {
      console.log('[手动同步] 2/2 同步旧供应商API数据...');
      const oldService = require('../services/oldSupplierService');
      
      // 同步昨天的数据
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const oldResult = await oldService.syncDayData(yesterdayStr);
      
      results.oldApi = {
        success: oldResult.success,
        date: yesterdayStr,
        totalDevices: oldResult.totalDevices || 0,
        successCount: oldResult.successCount || 0,
        failCount: oldResult.failCount || 0,
        totalAcre: oldResult.totalAcre || 0,
        batchCount: oldResult.batchCount || 0,
        elapsedSeconds: oldResult.elapsedSeconds || 0
      };
      
      console.log('[手动同步] 旧供应商API同步完成');
    } catch (error) {
      console.error('[手动同步] 旧供应商API同步失败:', error.message);
      results.oldApi = {
        success: false,
        error: error.message
      };
    }
    
    results.endTime = new Date().toISOString();
    
    console.log('[手动同步] 全部同步完成');
    
    res.json({
      code: 0,
      data: results,
      msg: '同步完成'
    });
  } catch (error) {
    console.error('[手动同步] 总体失败:', error.message);
    res.json({
      code: -1,
      msg: error.message
    });
  }
});

module.exports = router;
