// tests/ws-client.js
const WebSocket = require('ws');
const uuidv4 = require('uuid').v4;

class TestWSClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      debug: options.debug || false,
      autoReconnect: options.autoReconnect || true,
      reconnectInterval: options.reconnectInterval || 3000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      onOpen: options.onOpen || (() => {}),
      onMessage: options.onMessage || (() => {}),
      onClose: options.onClose || (() => {}),
      onError: options.onError || (() => {})
    };
    
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.heartbeatTimer = null;
    this.token = options.token || null;
    this.userId = null;
    
    this.messageHandlers = new Map();
    
    if (options.autoConnect !== false) {
      this.connect();
    }
  }
  
  connect() {
    this._log('Connecting to WebSocket server...');
    
    this.ws = new WebSocket(this.url);
    
    this.ws.on('open', () => {
      this.connected = true;
      this._log('Connected to WebSocket server');
      
      // 开始心跳
      this._startHeartbeat();
      
      // 如果有令牌，则自动认证
      if (this.token) {
        this.authenticate(this.token);
      }
      
      this.options.onOpen();
    });
    
    this.ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch (e) {
        this._log('Received non-JSON message:', data);
        return;
      }
      
      this._log('Received message:', message);
      
      // 处理不同类型的消息
      switch (message.type) {
        case 'welcome':
          this._log(`Received welcome message, client ID: ${message.clientId}`);
          break;
          
        case 'auth_success':
          this.authenticated = true;
          this.userId = message.userId;
          this._log(`Authentication successful, user ID: ${this.userId}`);
          break;
          
        case 'auth_failure':
          this.authenticated = false;
          this._log(`Authentication failed: ${message.message}`);
          break;
          
        case 'pong':
          // 心跳响应，不需要特殊处理
          break;
          
        default:
          // 处理自定义消息处理程序
          if (message.requestId && this.messageHandlers.has(message.requestId)) {
            const handler = this.messageHandlers.get(message.requestId);
            handler(message);
            
            // 如果是一次性处理程序，则移除
            if (handler.once) {
              this.messageHandlers.delete(message.requestId);
            }
          }
      }
      
      this.options.onMessage(message);
    });
    
    this.ws.on('close', (code, reason) => {
      this.connected = false;
      this.authenticated = false;
      this._stopHeartbeat();
      
      this._log(`WebSocket connection closed: ${code} ${reason}`);
      
      if (this.options.autoReconnect) {
        this._log(`Reconnecting in ${this.options.reconnectInterval}ms...`);
        setTimeout(() => this.connect(), this.options.reconnectInterval);
      }
      
      this.options.onClose(code, reason);
    });
    
    this.ws.on('error', (error) => {
      this._log('WebSocket error:', error);
      this.options.onError(error);
    });
  }
  
  authenticate(token) {
    this.token = token;
    
    if (!this.connected) {
      this._log('Cannot authenticate: not connected');
      return false;
    }
    
    this._log('Sending authentication request');
    
    return this.send({
      type: 'auth',
      token
    });
  }
  
  requestData(params = {}) {
    if (!this.connected || !this.authenticated) {
      this._log('Cannot request data: not connected or not authenticated');
      return Promise.reject(new Error('Not connected or not authenticated'));
    }
    
    const requestId = uuidv4();
    
    // 创建一个Promise，在收到响应时解析
    const promise = new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.messageHandlers.has(requestId)) {
          this.messageHandlers.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30秒超时
      
      // 创建消息处理程序
      const handler = (message) => {
        clearTimeout(timeout);
        
        if (message.type === 'error') {
          reject(new Error(message.message));
        } else {
          resolve(message);
        }
      };
      
      // 标记为一次性处理程序
      handler.once = true;
      
      // 注册处理程序
      this.messageHandlers.set(requestId, handler);
    });
    
    // 发送请求
    this.send({
      type: 'request_data',
      requestId,
      params
    });
    
    return promise;
  }
  
  send(data) {
    if (!this.connected) {
      this._log('Cannot send: not connected');
      return false;
    }
    
    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
      this._log('Sent message:', data);
      return true;
    } catch (error) {
      this._log('Error sending message:', error);
      return false;
    }
  }
  
  close() {
    this._stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.authenticated = false;
  }
  
  _startHeartbeat() {
    this._stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, this.options.heartbeatInterval);
  }
  
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  _log(...args) {
    if (this.options.debug) {
      console.log('[TestWSClient]', ...args);
    }
  }
}

module.exports = TestWSClient;