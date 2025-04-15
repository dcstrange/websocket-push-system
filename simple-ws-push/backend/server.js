// server.js - 主服务器代码
// 集成HTTP API和WebSocket服务

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// 导入自定义模块
const auth = require('./auth');
const taskProcessor = require('./task-processor');

// 配置
const PORT = process.env.PORT || 3000;
const WS_HEARTBEAT_INTERVAL = 30000; // 心跳间隔，30秒

// 创建Express应用和HTTP服务器
const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 用户连接映射: userId -> Set(客户端对象)
const userConnections = new Map();

// API路由 - 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const authResult = auth.authenticateUser(username, password);
  
  if (!authResult) {
    return res.status(401).json({ error: '无效的凭据' });
  }
  
  res.json(authResult);
});

// WebSocket连接处理
wss.on('connection', (ws) => {
  // 为每个连接分配唯一ID
  const clientId = uuidv4();
  
  // 连接状态
  const clientState = {
    clientId,
    ws,
    userId: null,
    authenticated: false,
    lastHeartbeat: Date.now()
  };
  
  console.log(`新WebSocket连接: ${clientId}`);
  
  // 设置心跳检查定时器
  const heartbeatTimer = setInterval(() => {
    // 检查上次心跳时间
    const timeSinceLastHeartbeat = Date.now() - clientState.lastHeartbeat;
    
    // 如果超过两倍心跳间隔没有收到心跳，断开连接
    if (timeSinceLastHeartbeat > 2 * WS_HEARTBEAT_INTERVAL) {
      console.log(`客户端 ${clientId} 心跳超时，断开连接`);
      ws.terminate();
      clearInterval(heartbeatTimer);
      return;
    }
    
    // 如果连接仍然开启，发送ping
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }));
    }
  }, WS_HEARTBEAT_INTERVAL);
  
  // 发送欢迎消息
  sendToClient(ws, {
    type: 'welcome',
    message: '欢迎连接到WebSocket服务器',
    clientId
  });
  
  // 消息处理
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      // 更新最后心跳时间
      clientState.lastHeartbeat = Date.now();
      
      // 根据消息类型处理
      switch (message.type) {
        case 'auth':
          handleAuth(clientState, message);
          break;
          
        case 'pong':
          // 客户端心跳响应，已在上面更新了lastHeartbeat
          break;
          
        case 'request_data':
          handleDataRequest(clientState, message);
          break;
          
        default:
          console.log(`收到未知类型消息: ${message.type}`);
          sendToClient(ws, {
            type: 'error',
            message: '未知的消息类型'
          });
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
      sendToClient(ws, {
        type: 'error',
        message: '消息格式错误'
      });
    }
  });
  
  // 关闭连接处理
  ws.on('close', () => {
    console.log(`客户端 ${clientId} 关闭连接`);
    
    // 从用户连接映射中移除
    if (clientState.userId) {
      const connections = userConnections.get(clientState.userId);
      
      if (connections) {
        connections.delete(clientState);
        
        // 如果没有连接了，则移除用户
        if (connections.size === 0) {
          userConnections.delete(clientState.userId);
        }
      }
    }
    
    // 清除心跳定时器
    clearInterval(heartbeatTimer);
  });
  
  // 错误处理
  ws.on('error', (error) => {
    console.error(`WebSocket错误 (${clientId}):`, error);
  });
});

/**
 * 向客户端发送消息
 * @param {WebSocket} ws - WebSocket连接
 * @param {object} data - 要发送的数据
 * @returns {boolean} - 是否发送成功
 */
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('发送消息错误:', error);
      return false;
    }
  }
  return false;
}

/**
 * 向特定用户的所有连接发送消息
 * @param {string} userId - 用户ID
 * @param {object} data - 要发送的数据
 * @returns {number} - 成功发送的连接数
 */
function sendToUser(userId, data) {
  const connections = userConnections.get(userId);
  
  if (!connections || connections.size === 0) {
    console.log(`用户 ${userId} 没有活跃连接`);
    return 0;
  }
  
  let successCount = 0;
  
  for (const client of connections) {
    if (sendToClient(client.ws, data)) {
      successCount++;
    }
  }
  
  console.log(`向用户 ${userId} 的 ${successCount}/${connections.size} 个连接发送消息`);
  return successCount;
}

/**
 * 处理认证消息
 * @param {object} clientState - 客户端状态
 * @param {object} message - 收到的消息
 */
function handleAuth(clientState, message) {
  const { token } = message;
  
  if (!token) {
    return sendToClient(clientState.ws, {
      type: 'auth_failure',
      message: '没有提供认证令牌'
    });
  }
  
  // 验证令牌
  const decoded = auth.verifyToken(token);
  
  if (!decoded) {
    return sendToClient(clientState.ws, {
      type: 'auth_failure',
      message: '无效的认证令牌'
    });
  }
  
  const userId = decoded.userId;
  
  // 更新客户端状态
  clientState.userId = userId;
  clientState.authenticated = true;
  
  // 更新用户连接映射
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId).add(clientState);
  
  console.log(`客户端 ${clientState.clientId} 认证成功，用户ID: ${userId}`);
  
  sendToClient(clientState.ws, {
    type: 'auth_success',
    userId
  });
}

/**
 * 处理数据请求
 * @param {object} clientState - 客户端状态
 * @param {object} message - 收到的消息
 */
function handleDataRequest(clientState, message) {
  // 检查认证状态
  if (!clientState.authenticated) {
    return sendToClient(clientState.ws, {
      type: 'error',
      requestId: message.requestId,
      message: '需要先进行认证'
    });
  }
  
  console.log(`用户 ${clientState.userId} 请求数据:`, message);
  
  // 创建任务
  const task = taskProcessor.createTask(clientState.userId, message);
  
  // 告知客户端请求已接受
  sendToClient(clientState.ws, {
    type: 'request_accepted',
    requestId: message.requestId,
    taskId: task.taskId,
    message: '请求已接受，处理中...'
  });
  
  // 开始处理任务
  taskProcessor.processTask(task.taskId, (userId, result) => {
    // 任务完成后，向用户发送结果
    sendToUser(userId, {
      type: 'data',
      payload: result
    });
  });
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`WebSocket地址: ws://localhost:${PORT}`);
  console.log(`REST API地址: http://localhost:${PORT}`);
});