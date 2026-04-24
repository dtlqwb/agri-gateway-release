/**
 * 作业记录管理路由
 * @module routes/workRecords
 * @description 提供作业记录的查询、编辑、删除等管理功能
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireSuper } = require('../middleware/auth');
const db = require('../services/db');

/**
 * 查询作业记录列表
 * @route GET /api/work-records
 * @access Authenticated
 * @query {string} tNumber - 设备号
 * @query {string} workType - 作业类型
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 * @query {number} orgId - 合作社ID
 * @query {number} page - 页码
 * @query {number} pageSize - 每页数量
 */
router.get('/work-records', requireAuth, async (req, res) => {
  try {
    const filters = req.query;
    const result = await db.getWorkRecords(filters);
    
    res.json({ code: 0, data: result });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 查询单条作业记录
 * @route GET /api/work-records/:id
 * @access Authenticated
 */
router.get('/work-records/:id', requireAuth, async (req, res) => {
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

/**
 * 更新作业记录
 * @route PUT /api/work-records/:id
 * @access Super Admin
 */
router.put('/work-records/:id', requireAuth, requireSuper, async (req, res) => {
  try {
    const updates = req.body;
    await db.updateWorkRecord(req.params.id, updates);
    res.json({ code: 0, msg: '更新成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 删除作业记录
 * @route DELETE /api/work-records/:id
 * @access Super Admin
 */
router.delete('/work-records/:id', requireAuth, requireSuper, async (req, res) => {
  try {
    await db.deleteWorkRecord(req.params.id);
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 批量更新/删除作业记录
 * @route POST /api/work-records/batch
 * @access Super Admin
 * @body {number[]} ids - 记录ID数组
 * @body {Object} updates - 更新字段（可选，不提供则删除）
 */
router.post('/work-records/batch', requireAuth, requireSuper, async (req, res) => {
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

/**
 * 获取作业记录统计信息
 * @route GET /api/work-records/stats
 * @access Authenticated
 * @query {string} tNumber - 设备号
 * @query {string} workType - 作业类型
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/work-records/stats', requireAuth, async (req, res) => {
  try {
    const filters = req.query;
    const stats = await db.getWorkRecordsStats(filters);
    res.json({ code: 0, data: stats });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 导出作业记录明细
 * @route GET /api/export/details
 * @query {string} tNumber - 设备号
 * @query {string} workType - 作业类型
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/export/details', async (req, res) => {
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
      '合作社': r.org_name || '',
      '机手': r.driver_name || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    
    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 16 },  // 设备号
      { wch: 12 },  // 作业日期
      { wch: 12 },  // 作业类型
      { wch: 14 },  // 作业面积
      { wch: 14 },  // 达标面积
      { wch: 20 },  // 合作社
      { wch: 10 }   // 机手
    ];

    XLSX.utils.book_append_sheet(wb, ws, '作业明细');

    const fileName = `作业记录明细_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buf);
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
