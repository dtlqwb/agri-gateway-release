/**
 * 路由汇总
 * @module routes/index
 * @description 注册所有路由模块
 */

const express = require('express');
const router = express.Router();

// 导入所有路由模块
const oldSupplierRoutes = require('./oldSupplier');
const deviceManageRoutes = require('./deviceManage');
const yunTinanRoutes = require('./yunTinan');
const dataManageRoutes = require('./dataManage');
const adminRoutes = require('./admin');
const tracksRoutes = require('./tracks');
const agriSummaryRoutes = require('./agriSummary');
const workRecordsRoutes = require('./workRecords');

// ===================== 注册路由 =====================

// 旧供应商API（北斗设备）
router.use('/old', oldSupplierRoutes);
router.use('/old-api', oldSupplierRoutes);

// 设备管理
router.use('/device', deviceManageRoutes);
router.use('/devices', deviceManageRoutes);

// 云途安API
router.use('/', yunTinanRoutes);

// 数据导入和管理
router.use('/', dataManageRoutes);

// 管理员和农户管理
router.use('/', adminRoutes);

// 设备轨迹
router.use('/', tracksRoutes);

// 农业数据汇总和导出
router.use('/', agriSummaryRoutes);

// 作业记录管理
router.use('/', workRecordsRoutes);

// 健康检查
router.get('/health', (req, res) => {
  res.json({ 
    code: 0, 
    msg: 'ok', 
    time: new Date().toISOString()
  });
});

module.exports = router;
