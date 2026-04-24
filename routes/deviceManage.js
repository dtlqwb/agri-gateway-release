/**
 * 设备管理路由
 * @module routes/deviceManage
 * @description 处理设备作业类型管理和设备列表查询
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireSuper } = require('../middleware/auth');
const db = require('../services/db');

/**
 * 农户修改设备作业类型
 * @route POST /api/device/work-type
 * @body {string} macid - 设备MAC地址
 * @body {string} workTypeName - 作业类型名称
 */
router.post('/work-type', async (req, res) => {
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

/**
 * 获取设备列表（含作业类型）
 * @route GET /api/devices/list
 * @query {string} orgId - 合作社ID（可选）
 */
router.get('/list', async (req, res) => {
  try {
    const { orgId } = req.query;
    let sql = `SELECT * FROM old_supplier_devices`;
    const params = [];
    
    if (orgId) {
      // 根据合作社ID查找合作社名称
      const org = await db.queryOne(
        `SELECT name FROM organizations WHERE id = ?`, 
        [orgId]
      );
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

/**
 * 批量更新设备作业类型
 * @route POST /api/device/work-type/batch
 * @access Super Admin
 * @body {string[]} macids - 设备MAC地址数组
 * @body {string} workTypeName - 作业类型名称
 */
router.post('/work-type/batch', requireAuth, requireSuper, async (req, res) => {
  try {
    const { macids, workTypeName } = req.body;
    
    if (!macids || !macids.length || !workTypeName) {
      return res.json({ code: -1, msg: '参数不完整' });
    }
    
    const affectedRows = await db.batchUpdateDeviceWorkType(macids, workTypeName);
    res.json({ 
      code: 0, 
      data: { affectedRows }, 
      msg: `已更新 ${affectedRows} 台设备` 
    });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
