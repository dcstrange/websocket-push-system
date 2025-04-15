// auth.js - 处理认证相关功能

const jwt = require('jsonwebtoken');

// 认证密钥 - 生产环境应使用环境变量存储
const JWT_SECRET = 'your-secret-key';

// 模拟用户数据库 - 实际应用中应连接到真实数据库
const users = [
  { id: '1', username: 'user1', password: 'password1' },
  { id: '2', username: 'user2', password: 'password2' }
];

/**
 * 验证用户凭据并生成JWT令牌
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {object|null} - 包含令牌和用户信息的对象，验证失败返回null
 */
function authenticateUser(username, password) {
  // 在"数据库"中查找用户
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return null;
  }
  
  // 生成JWT令牌 - 有效期1小时
  const token = jwt.sign(
    { userId: user.id }, 
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  return {
    token,
    user: {
      id: user.id,
      username: user.username
    }
  };
}

/**
 * 验证JWT令牌
 * @param {string} token - JWT令牌
 * @returns {object|null} - 解码后的令牌有效载荷，验证失败返回null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

module.exports = {
  authenticateUser,
  verifyToken
};