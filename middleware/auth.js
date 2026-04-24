/**
 * 认证和权限中间件
 * @module middleware/auth
 * @description 提供管理员认证和权限验证功能
 */

const { verifyToken } = require('../utils/token');
const db = require('../services/db');

/**
 * 验证管理员登录中间件
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件
 * @description 从请求头或查询参数中获取token并验证
 */
function requireAuth(req, res, next) {
  const token = req.headers.authorization || req.query.token;
  
  if (!token) {
    return res.status(401).json({ code: 401, msg: '未登录' });
  }
  
  // 验证token
  const tokenData = verifyToken(token);
  if (!tokenData) {
    return res.status(401).json({ 
      code: 401, 
      msg: 'Token无效或已过期，请重新登录' 
    });
  }
  
  req.admin = { username: tokenData.username };
  next();
}

/**
 * 验证超级管理员权限中间件
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件
 * @description 验证用户是否具有超级管理员角色
 */
async function requireSuper(req, res, next) {
  const token = req.headers.authorization || req.query.token;
  
  if (!token) {
    return res.status(403).json({ code: 403, msg: '无权限' });
  }
  
  try {
    // 验证token
    const tokenData = verifyToken(token);
    if (!tokenData) {
      return res.status(401).json({ 
        code: 401, 
        msg: 'Token无效或已过期' 
      });
    }
    
    // 查询管理员角色
    const admins = await db.getAdminList();
    const admin = admins.find(a => a.username === tokenData.username);
    
    if (!admin || admin.role !== 'super') {
      return res.status(403).json({ 
        code: 403, 
        msg: '无权限，需要超管角色' 
      });
    }
    
    req.admin = admin;
    next();
  } catch (e) {
    console.error('[权限验证] 错误:', e.message);
    return res.status(403).json({ 
      code: 403, 
      msg: '权限验证失败' 
    });
  }
}

module.exports = {
  requireAuth,
  requireSuper
};
