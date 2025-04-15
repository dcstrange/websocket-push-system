class WSClient {
    constructor(url, options = {}) {
      this.baseUrl = url;
      this.options = {
        reconnectInterval: options.reconnectInterval || 3000,
        heartbeatInterval: options.heartbeatInterval || 30000,
        authToken: options.authToken || null,
        onMessage: options.onMessage || this._defaultMessageHandler,
        onReconnect: options.onReconnect || (() => {}),
        onConnect: options.onConnect || (() => {}),
        onDisconnect: options.onDisconnect || (() => {}),
        onAuthSuccess: options.onAuthSuccess || (() => {}),
        onAuthFailure: options.onAuthFailure || (() => {})
      };
      
      this.socket = null;
      this.reconnectAttempts = 0;
      this.heartbeatTimer = null;
      this.authenticated = false;
      this.isConnecting = false;
      this.userId = null;
      
      // 保存每个请求的回调处理程序
      this.requestCallbacks = new Map();
      
      if (options.autoConnect !== false) {
        this.connect();
      }
    }
    
    connect() {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      
      if (this.isConnecting) {
        return;
      }
      
      this.isConnecting = true;
      this.socket = new WebSocket(this.baseUrl);
      
      this.socket.onopen = this._handleOpen.bind(this);
      this.socket.onmessage = this._handleMessage.bind(this);
      this.socket.onclose = this._handleClose.bind(this);
      this.socket.onerror = this._handleError.bind(this);
    }
    
    _handleOpen() {
      console.log('WebSocket connection established');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // 发送认证请求
      if (this.options.authToken) {
        this.authenticate(this.options.authToken);
      }
      
      // 开始心跳
      this._startHeartbeat();
      
      this.options.onConnect();
    }
    
    _handleMessage(event) {
      try {
        const data = JSON.parse(event.data);
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'auth_success':
            this.authenticated = true;
            this.userId = data.userId;
            console.log('Authentication successful');
            this.options.onAuthSuccess(data);
            break;
            
          case 'auth_failure':
            this.authenticated = false;
            console.error('Authentication failed:', data.message);
            this.options.onAuthFailure(data);
            break;
            
          case 'pong':
            // 心跳响应，不需要特殊处理
            break;
            
          case 'request_accepted':
            // 请求已接受，如果有回调则执行
            if (data.requestId && this.requestCallbacks.has(data.requestId)) {
              const callback = this.requestCallbacks.get(data.requestId);
              if (callback.onAccepted) {
                callback.onAccepted(data);
              }
            }
            break;
            
          case 'data':
            // 实际的业务数据，可能是针对特定请求的响应
            if (data.payload && data.payload.requestId && this.requestCallbacks.has(data.payload.requestId)) {
              const callback = this.requestCallbacks.get(data.payload.requestId);
              if (callback.onData) {
                callback.onData(data.payload);
                
                // 如果是一次性回调，则移除
                if (callback.once) {
                  this.requestCallbacks.delete(data.payload.requestId);
                }
              }
            }
            break;
            
          case 'error':
            // 错误消息，可能是针对特定请求的
            if (data.requestId && this.requestCallbacks.has(data.requestId)) {
              const callback = this.requestCallbacks.get(data.requestId);
              if (callback.onError) {
                callback.onError(data);
                
                // 错误通常表示请求结束
                if (callback.once) {
                  this.requestCallbacks.delete(data.requestId);
                }
              }
            }
            break;
            
          default:
            console.log('Received unknown message type:', data);
        }
        
        // 调用全局消息处理程序
        this.options.onMessage(data);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }
    
    _handleClose(event) {
      this.authenticated = false;
      this.isConnecting = false;
      this._stopHeartbeat();
      
      console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
      this.options.onDisconnect(event);
      
      // 自动重连
      this._reconnect();
    }
    
    _handleError(error) {
      console.error('WebSocket error:', error);
    }
    
    _startHeartbeat() {
      this._stopHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
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
    
    _reconnect() {
      // 逐步增加重连间隔
      const delay = Math.min(
        30000, // 最大30秒
        this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts)
      );
      
      console.log(`Attempting to reconnect in ${delay}ms...`);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        this.options.onReconnect(this.reconnectAttempts);
        this.connect();
      }, delay);
    }
    
    _defaultMessageHandler(data) {
      console.log('Received data:', data);
    }
    
    authenticate(token) {
      this.options.authToken = token;
      
      return this.send({
        type: 'auth',
        token: token
      });
    }
    
    requestData(requestId, params = {}, callbacks = {}) {
      if (!this.authenticated) {
        console.error('Cannot request data: not authenticated');
        if (callbacks.onError) {
          callbacks.onError({ message: 'Not authenticated' });
        }
        return false;
      }
      
      // 存储回调
      this.requestCallbacks.set(requestId, {
        onAccepted: callbacks.onAccepted,
        onData: callbacks.onData,
        onError: callbacks.onError,
        once: callbacks.once !== false
      });
      
      // 发送请求
      return this.send({
        type: 'request_data',
        requestId: requestId,
        params: params
      });
    }
    
    send(data) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.error('Cannot send message, WebSocket not connected');
        return false;
      }
      
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(message);
        return true;
      } catch (error) {
        console.error('Error sending message:', error);
        return false;
      }
    }
    
    disconnect() {
      this._stopHeartbeat();
      
      // 清理所有请求回调
      this.requestCallbacks.clear();
      
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      
      this.authenticated = false;
    }
  }