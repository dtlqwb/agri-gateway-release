/**
 * 农业数据汇总路由
 * @module routes/agriSummary
 * @description 提供农业数据汇总、导出等功能
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');

/**
 * 获取农业数据汇总（云途安 + 旧供应商）
 * @route GET /api/agri/summary
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/agri/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = await db.getAgriSummaryAll({ startDate, endDate });
    res.json({ code: 0, data: summary });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * Excel 导出（统一从本地DB读取）
 * @route GET /api/agri/export
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 * @query {number} orgId - 合作社ID
 * @query {string} workType - 作业类型
 */
router.get('/agri/export', async (req, res) => {
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
    const oldCount = allRecords.filter(r => r.source === 'old' || r.source === 'old_api').length;
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

/**
 * 全量数据导出（兼容旧路径 /api/export/all-records）
 * @route GET /api/export/all-records
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 * @query {number} orgId - 合作社ID
 * @query {string} workType - 作业类型
 */
router.get('/export/all-records', async (req, res) => {
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
      '数据状态': r.data_status || '正常',
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

    // 合计行
    const totalAcre = records.reduce((sum, r) => sum + parseFloat(r.acre || 0), 0);
    const totalOkAcre = records.reduce((sum, r) => sum + parseFloat(r.ok_acre || 0), 0);
    const oldCount = records.filter(r => r.source !== 'yuntinan').length;
    const ytCount = records.filter(r => r.source === 'yuntinan').length;
    
    detailData.push({});
    detailData.push({
      '序号': '',
      '数据来源': `旧供应商${oldCount}条 + 云途安${ytCount}条`,
      '数据状态': '合计',
      '设备号': `${new Set(records.map(r => r.t_number)).size}台设备`,
      '车牌号': '',
      '作业日期': '',
      '作业类型': `${records.length}条记录`,
      '作业面积(亩)': totalAcre.toFixed(2),
      '达标面积(亩)': totalOkAcre.toFixed(2),
      '机手姓名': '',
      '合作社': '',
      '修改备注': '',
      '更新时间': ''
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(detailData);

    // 设置列宽
    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 12 },  // 数据来源
      { wch: 10 },  // 数据状态
      { wch: 16 },  // 设备号
      { wch: 14 },  // 车牌号
      { wch: 12 },  // 作业日期
      { wch: 12 },  // 作业类型
      { wch: 14 },  // 作业面积
      { wch: 14 },  // 达标面积
      { wch: 12 },  // 机手姓名
      { wch: 20 },  // 合作社
      { wch: 20 },  // 修改备注
      { wch: 20 }   // 更新时间
    ];

    XLSX.utils.book_append_sheet(wb, ws, '作业明细');

    const { startDate, endDate } = filters;
    const dateStr = startDate && endDate ? `${startDate}_${endDate}` : '全量';
    const fileName = `农机作业数据_全量导出_${dateStr}.xlsx`;

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buf);
  } catch (e) {
    console.error('[全量导出] 失败:', e.message);
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
