// api-server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const jwtUtils = require('./auth/jwt');

const app = express();

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 模拟用户数据库
const users = [
  { id: '1', username: 'user1', password: 'password1' },
  { id: '2', username: 'user2', password: 'password2' }
];

// 登录路由 - 生成JWT令牌
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // 简单的身份验证
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // 生成JWT令牌
  const token = jwtUtils.generateToken({ userId: user.id });
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

// 受保护的路由 - 需要验证JWT令牌
app.get('/api/user', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = jwtUtils.verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const user = users.find(u => u.id === decoded.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    id: user.id,
    username: user.username
  });
});

// 启动服务器
app.listen(config.port.api, () => {
  console.log(`API server listening on port ${config.port.api}`);
});