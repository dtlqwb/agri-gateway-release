/**
 * Token 工具函数
 * @module utils/token
 * @description 提供Token生成和验证功能，使用HMAC-SHA256签名
 */

const crypto = require('crypto');

// Token密钥（从环境变量读取，如果没有则使用默认值）
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'agri-gateway-secret-key-2024';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24小时过期

/**
 * 生成安全的Token
 * @param {string} username - 用户名
 * @returns {string} 加密后的token（base64编码）
 * @example
 * const token = generateToken('admin');
 * // 返回: "YWRtaW46MTcxMzI0NDgwMDAwMDphYmNkZWYxMjM0NTY3ODkw"
 */
function generateToken(username) {
  const timestamp = Date.now();
  const data = `${username}:${timestamp}`;
  
  // 使用HMAC-SHA256签名
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('hex');
  
  // 格式: username:timestamp:signature (base64编码)
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/**
 * 验证Token并返回用户信息
 * @param {string} token - base64编码的token
 * @returns {object|null} 验证成功返回{username, timestamp}，失败返回null
 * @example
 * const result = verifyToken(token);
 * if (result) {
 *   console.log('用户:', result.username);
 * }
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
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
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

module.exports = {
  generateToken,
  verifyToken,
  TOKEN_EXPIRY,
  TOKEN_SECRET
};
