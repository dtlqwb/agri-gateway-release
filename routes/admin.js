/**
 * 管理员和农户管理路由
 * @module routes/admin
 * @description 处理管理员登录、CRUD、农户管理等功能
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireSuper } = require('../middleware/auth');
const { generateToken } = require('../utils/token');
const db = require('../services/db');
const yt = require('../services/yunTinanService');

// ===================== 管理员登录 =====================

/**
 * 管理员登录
 * @route POST /api/admin/login
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ code: -1, msg: '请输入用户名和密码' });
    }
    const admin = await db.loginAdmin(username, password);
    if (!admin) {
      return res.json({ code: -1, msg: '用户名或密码错误' });
    }
    // 生成安全的token
    const token = generateToken(admin.username);
    res.json({ code: 0, data: { ...admin, token } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ===================== 管理员 CRUD（超管专属） =====================

/**
 * 获取管理员列表
 * @route GET /api/admins
 * @access Super Admin
 */
router.get('/admins', requireAuth, requireSuper, async (req, res) => {
  try {
    const admins = await db.getAdminList();
    res.json({ code: 0, data: admins, total: admins.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 创建管理员
 * @route POST /api/admins
 * @access Super Admin
 */
router.post('/admins', requireAuth, requireSuper, async (req, res) => {
  try {
    const { username, password, name, role, status } = req.body;
    if (!username || !password) {
      return res.json({ code: -1, msg: '用户名和密码不能为空' });
    }
    
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

/**
 * 更新管理员
 * @route PUT /api/admins/:id
 * @access Super Admin
 */
router.put('/admins/:id', requireAuth, requireSuper, async (req, res) => {
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

/**
 * 删除管理员
 * @route DELETE /api/admins/:id
 * @access Super Admin
 */
router.delete('/admins/:id', requireAuth, requireSuper, async (req, res) => {
  try {
    await db.deleteAdmin(parseInt(req.params.id));
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ===================== 农户登录 =====================

/**
 * 农户登录
 * @route POST /api/farmer/login
 */
router.post('/farmer/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.json({ code: -1, msg: '请输入手机号和密码' });
    }
    const farmer = await db.loginFarmer(phone, password);
    if (!farmer) {
      return res.json({ code: -1, msg: '账号或密码错误' });
    }
    const token = generateToken(farmer.phone);
    res.json({ code: 0, data: { ...farmer, token } });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ===================== 农户数据 =====================

/**
 * 获取农户统计
 * @route GET /api/farmer/stats
 * @query {number} orgId - 合作社ID
 * @query {string} startDate - 开始日期
 * @query {string} endDate - 结束日期
 */
router.get('/farmer/stats', async (req, res) => {
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

/**
 * 获取农户作业记录
 * @route GET /api/farmer/records
 * @query {number} orgId - 合作社ID
 */
router.get('/farmer/records', async (req, res) => {
  try {
    const orgId = parseInt(req.query.orgId);
    if (!orgId) return res.json({ code: -1, msg: '缺少 orgId' });
    const { tNumber, workType, startDate, endDate, limit } = req.query;
    const records = await db.getFarmerWorkRecords(orgId, { 
      tNumber, workType, startDate, endDate, 
      limit: limit ? parseInt(limit) : undefined 
    });
    res.json({ code: 0, data: records, total: records.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

// ===================== 管理端 - 农户 CRUD =====================

/**
 * 获取农户列表
 * @route GET /api/farmers
 */
router.get('/farmers', async (req, res) => {
  try {
    const farmers = await db.getFarmerList();
    res.json({ code: 0, data: farmers, total: farmers.length });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 创建农户
 * @route POST /api/farmers
 */
router.post('/farmers', async (req, res) => {
  try {
    const { phone, password, name, org_name, org_id, remark } = req.body;
    if (!phone) return res.json({ code: -1, msg: '手机号不能为空' });
    
    // 检查重复
    const farmers = await db.getFarmerList();
    const existing = farmers.find(f => f.phone === phone);
    if (existing) return res.json({ code: -1, msg: '该手机号已存在' });
    
    const id = await db.createFarmer({ 
      phone, password, name, org_name, 
      org_id: org_id ? parseInt(org_id) : 0, remark 
    });
    res.json({ code: 0, data: { id }, msg: '添加成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 更新农户
 * @route PUT /api/farmers/:id
 */
router.put('/farmers/:id', async (req, res) => {
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

/**
 * 删除农户
 * @route DELETE /api/farmers/:id
 */
router.delete('/farmers/:id', async (req, res) => {
  try {
    await db.deleteFarmer(parseInt(req.params.id));
    res.json({ code: 0, msg: '删除成功' });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

/**
 * 获取合作社列表
 * @route GET /api/organizations
 */
router.get('/organizations', async (req, res) => {
  try {
    const orgs = await db.getOrganizations();
    res.json({ code: 0, data: orgs });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});

module.exports = router;
