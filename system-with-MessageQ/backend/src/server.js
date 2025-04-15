// server.js
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const jwtUtils = require('./auth/jwt');
const messageQueue = require('./utils/message-queue');

class WebSocketServer {
  constructor() {
    this.server = http.createServer();
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Map(); // clientId -> {ws, userId, lastHeartbeat, ...}
    this.userConnections = new Map(); // userId -> Set(clientId)
    
    this._setupWSServer();
    messageQueue.connect().then(() => {
      this._setupMessageQueueConsumer();
    });
  }
  
  _setupMessageQueueConsumer() {
    // 消费结果队列中的消息
    messageQueue.consumeResults((data) => {
      const { userId, result } = data;
      
      // 向指定用户的所有连接推送消息
      this._sendToUser(userId, {
        type: 'data',
        payload: result
      });
    });
  }
  
  _setupWSServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const clientIp = req.socket.remoteAddress;
      
      console.log(`New WebSocket connection: ${clientId} from ${clientIp}`);
      
      // 初始化客户端状态
      const clientState = {
        ws,
        clientId,
        ip: clientIp,
        userId: null,
        authenticated: false,
        lastHeartbeat: Date.now(),
        connectionTime: Date.now()
      };
      
      this.clients.set(clientId, clientState);
      
      // 设置连接超时检查
      const heartbeatCheck = setInterval(() => {
        const client = this.clients.get(clientId);
        if (!client) {
          clearInterval(heartbeatCheck);
          return;
        }
        
        const timeSinceLastHeartbeat = Date.now() - client.lastHeartbeat;
        if (timeSinceLastHeartbeat > config.ws.heartbeatTimeout) {
          console.log(`Client ${clientId} heartbeat timeout, closing connection`);
          ws.terminate();
          clearInterval(heartbeatCheck);
        }
      }, 10000); // 每10秒检查一次心跳
      
      // 消息处理
      ws.on('message', (message) => {
        this._handleMessage(message, clientState);
      });
      
      // 连接关闭处理
      ws.on('close', () => {
        console.log(`WebSocket connection closed: ${clientId}`);
        
        // 清理用户连接映射
        if (clientState.userId) {
          const userConnections = this.userConnections.get(clientState.userId);
          if (userConnections) {
            userConnections.delete(clientId);
            
            if (userConnections.size === 0) {
              this.userConnections.delete(clientState.userId);
            }
          }
        }
        
        // 清理客户端状态
        this.clients.delete(clientId);
        clearInterval(heartbeatCheck);
      });
      
      // 错误处理
      ws.on('error', (error) => {
        console.error(`WebSocket error (${clientId}):`, error);
      });
      
      // 发送欢迎消息
      this._sendToClient(clientState, {
        type: 'welcome',
        message: 'Welcome to the WebSocket server',
        clientId
      });
    });
  }
  
  _handleMessage(message, clientState) {
    let parsedMessage;
    
    try {
      parsedMessage = JSON.parse(message);
    } catch (error) {
      return this._sendToClient(clientState, {
        type: 'error',
        message: 'Invalid JSON message'
      });
    }
    
    // 更新最后心跳时间
    clientState.lastHeartbeat = Date.now();
    
    // 根据消息类型处理
    switch (parsedMessage.type) {
      case 'auth':
        this._handleAuth(parsedMessage, clientState);
        break;
        
      case 'ping':
        this._handlePing(parsedMessage, clientState);
        break;
        
      case 'request_data':
        // 只允许已认证的客户端请求数据
        if (!clientState.authenticated) {
          return this._sendToClient(clientState, {
            type: 'error',
            message: 'Authentication required'
          });
        }
        
        this._handleDataRequest(parsedMessage, clientState);
        break;
        
      default:
        console.log(`Received unknown message type (${clientState.clientId}):`, parsedMessage);
    }
  }
  
  _handleAuth(message, clientState) {
    const { token } = message;
    
    if (!token) {
      return this._sendToClient(clientState, {
        type: 'auth_failure',
        message: 'No authentication token provided'
      });
    }
    
    // 验证JWT令牌
    const decoded = jwtUtils.verifyToken(token);
    
    if (!decoded) {
      return this._sendToClient(clientState, {
        type: 'auth_failure',
        message: 'Invalid authentication token'
      });
    }
    
    const userId = decoded.userId || decoded.sub;
    
    if (!userId) {
      return this._sendToClient(clientState, {
        type: 'auth_failure',
        message: 'Invalid token: no user ID'
      });
    }
    
    // 更新客户端状态
    clientState.userId = userId;
    clientState.authenticated = true;
    
    // 更新用户连接映射
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(clientState.clientId);
    
    console.log(`Client ${clientState.clientId} authenticated, user ID: ${userId}`);
    
    // 发送认证成功消息
    this._sendToClient(clientState, {
      type: 'auth_success',
      userId
    });
  }
  
  _handlePing(message, clientState) {
    // 响应心跳
    this._sendToClient(clientState, {
      type: 'pong',
      timestamp: Date.now(),
      echo: message.timestamp
    });
  }
  
  _handleDataRequest(message, clientState) {
    console.log(`User ${clientState.userId} requested data:`, message);
    
    // 将请求发送到任务队列
    if (messageQueue.connected) {
      const task = {
        taskId: uuidv4(),
        userId: clientState.userId,
        requestData: message,
        timestamp: Date.now()
      };
      
      messageQueue.sendTask(task)
        .then(() => {
          // 告知客户端任务已提交
          this._sendToClient(clientState, {
            type: 'request_accepted',
            requestId: message.requestId,
            taskId: task.taskId,
            message: 'Request accepted, processing...'
          });
        })
        .catch(error => {
          console.error('Failed to send task to queue:', error);
          this._sendToClient(clientState, {
            type: 'error',
            requestId: message.requestId,
            message: 'Server error: Failed to process request'
          });
        });
    } else {
      this._sendToClient(clientState, {
        type: 'error',
        requestId: message.requestId,
        message: 'Server error: Message queue not connected'
      });
    }
  }
  
  _sendToClient(clientState, data) {
    if (clientState.ws.readyState === WebSocket.OPEN) {
      try {
        clientState.ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        console.error(`Error sending message to client ${clientState.clientId}:`, error);
        return false;
      }
    }
    return false;
  }
  
  _sendToUser(userId, data) {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections || userConnections.size === 0) {
      console.log(`User ${userId} has no active connections, cannot send message`);
      return 0;
    }
    
    let successCount = 0;
    
    for (const clientId of userConnections) {
      const clientState = this.clients.get(clientId);
      if (clientState && this._sendToClient(clientState, data)) {
        successCount++;
      }
    }
    
    console.log(`Sent message to ${successCount}/${userConnections.size} connections for user ${userId}`);
    return successCount;
  }
  
  start() {
    this.server.listen(config.port.ws, () => {
      console.log(`WebSocket server started, listening on port ${config.port.ws}`);
    });
  }
  
  stop() {
    // 关闭所有WebSocket连接
    for (const [clientId, clientState] of this.clients.entries()) {
      clientState.ws.close();
    }
    
    // 清空映射
    this.clients.clear();
    this.userConnections.clear();
    
    // 关闭消息队列连接
    messageQueue.close();
    
    // 关闭HTTP服务器
    this.server.close(() => {
      console.log('WebSocket server closed');
    });
  }
}

// 创建并启动服务器
const wsServer = new WebSocketServer();
wsServer.start();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('Received SIGINT signal, shutting down server...');
  wsServer.stop();
  process.exit(0);
});