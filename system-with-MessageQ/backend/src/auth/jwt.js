// auth/jwt.js
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * 生成JWT令牌
 * @param {Object} payload - 令牌的有效载荷
 * @return {String} JWT令牌
 */
function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
}

/**
 * 验证JWT令牌
 * @param {String} token - JWT令牌
 * @return {Object|null} 解码后的有效载荷或null(如果验证失败)
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};