/**
 * WebSocket客户端封装类
 * 负责管理WebSocket连接、认证、心跳和重连
 */
class WSClient {
    /**
     * 创建WebSocket客户端
     * @param {string} url - WebSocket服务器地址
     * @param {object} options - 配置选项
     */
    constructor(url, options = {}) {
      // WebSocket服务器地址
      this.baseUrl = url;
      
      // 配置选项，使用默认值合并
      this.options = {
        reconnectInterval: options.reconnectInterval || 3000, // 重连间隔（毫秒）
        heartbeatInterval: options.heartbeatInterval || 30000, // 心跳间隔（毫秒）
        authToken: options.authToken || null, // 认证令牌
        onMessage: options.onMessage || this._defaultMessageHandler, // 消息回调
        onReconnect: options.onReconnect || (() => {}), // 重连回调
        onConnect: options.onConnect || (() => {}), // 连接回调
        onDisconnect: options.onDisconnect || (() => {}), // 断开回调
        onAuthSuccess: options.onAuthSuccess || (() => {}), // 认证成功回调
        onAuthFailure: options.onAuthFailure || (() => {}) // 认证失败回调
      };
      
      // 内部状态
      this.socket = null; // WebSocket实例
      this.reconnectAttempts = 0; // 重连尝试次数
      this.heartbeatTimer = null; // 心跳定时器
      this.authenticated = false; // 是否已认证
      this.isConnecting = false; // 是否正在连接
      this.userId = null; // 用户ID
      
      // 保存请求回调的映射
      this.requestCallbacks = new Map();
      
      // 如果没有明确禁用自动连接，则立即连接
      if (options.autoConnect !== false) {
        this.connect();
      }
    }
    
    /**
     * 建立WebSocket连接
     */
    connect() {
      // 如果已经连接或正在连接中，则不重复连接
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      
      if (this.isConnecting) {
        return;
      }
      
      this.isConnecting = true;
      
      // 创建新的WebSocket连接
      this.socket = new WebSocket(this.baseUrl);
      
      // 设置事件处理器
      this.socket.onopen = this._handleOpen.bind(this);
      this.socket.onmessage = this._handleMessage.bind(this);
      this.socket.onclose = this._handleClose.bind(this);
      this.socket.onerror = this._handleError.bind(this);
    }
    
    /**
     * 处理连接打开事件
     * @private
     */
    _handleOpen() {
      console.log('WebSocket连接已建立');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // 如果有认证令牌，自动进行认证
      if (this.options.authToken) {
        this.authenticate(this.options.authToken);
      }
      
      // 开始心跳
      this._startHeartbeat();
      
      // 调用连接回调
      this.options.onConnect();
    }
    
    /**
     * 处理收到消息事件
     * @private
     * @param {MessageEvent} event - WebSocket消息事件
     */
    _handleMessage(event) {
      try {
        const data = JSON.parse(event.data);
        
        // 根据消息类型处理
        switch (data.type) {
          case 'auth_success':
            // 认证成功
            this.authenticated = true;
            this.userId = data.userId;
            console.log('认证成功，用户ID:', data.userId);
            this.options.onAuthSuccess(data);
            break;
            
          case 'auth_failure':
            // 认证失败
            this.authenticated = false;
            console.error('认证失败:', data.message);
            this.options.onAuthFailure(data);
            break;
            
          case 'ping':
            // 收到服务器心跳，回应pong
            this.send({
              type: 'pong',
              timestamp: Date.now(),
              echo: data.timestamp
            });
            break;
            
          case 'request_accepted':
            // 请求已被接受
            if (data.requestId && this.requestCallbacks.has(data.requestId)) {
              const callback = this.requestCallbacks.get(data.requestId);
              if (callback.onAccepted) {
                callback.onAccepted(data);
              }
            }
            break;
            
          case 'data':
            // 收到推送数据
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
            // 错误消息
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
            console.log('收到未知类型消息:', data);
        }
        
        // 调用全局消息处理回调
        this.options.onMessage(data);
      } catch (error) {
        console.error('处理消息时出错:', error);
      }
    }
    
    /**
     * 处理连接关闭事件
     * @private
     * @param {CloseEvent} event - WebSocket关闭事件
     */
    _handleClose(event) {
      this.authenticated = false;
      this.isConnecting = false;
      this._stopHeartbeat();
      
      console.log(`WebSocket连接已关闭: ${event.code} ${event.reason}`);
      this.options.onDisconnect(event);
      
      // 自动重连
      this._reconnect();
    }
    
    /**
     * 处理连接错误事件
     * @private
     * @param {Event} error - WebSocket错误事件
     */
    _handleError(error) {
      console.error('WebSocket错误:', error);
    }
    
    /**
     * 开始心跳定时器
     * @private
     */
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
    
    /**
     * 停止心跳定时器
     * @private
     */
    _stopHeartbeat() {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }
    
    /**
     * 尝试重新连接
     * @private
     */
    _reconnect() {
      // 计算重连延迟，使用指数退避算法
      const delay = Math.min(
        30000, // 最大30秒
        this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts)
      );
      
      console.log(`尝试在 ${delay}ms 后重新连接...`);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        this.options.onReconnect(this.reconnectAttempts);
        this.connect();
      }, delay);
    }
    
    /**
     * 默认消息处理函数
     * @private
     * @param {object} data - 收到的消息数据
     */
    _defaultMessageHandler(data) {
      console.log('收到数据:', data);
    }
    
    /**
     * 发送认证请求
     * @param {string} token - JWT认证令牌
     * @returns {boolean} - 是否成功发送请求
     */
    authenticate(token) {
      this.options.authToken = token;
      
      return this.send({
        type: 'auth',
        token: token
      });
    }
    
    /**
     * 请求数据
     * @param {string} requestId - 请求ID
     * @param {object} params - 请求参数
     * @param {object} callbacks - 回调函数集合
     * @returns {boolean} - 是否成功发送请求
     */
    requestData(requestId, params = {}, callbacks = {}) {
      if (!this.authenticated) {
        console.error('无法请求数据: 未认证');
        if (callbacks.onError) {
          callbacks.onError({ message: '未认证' });
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
        dataType: params.dataType || 'default',
        options: params.options || {}
      });
    }
    
    /**
     * 发送消息到服务器
     * @param {object|string} data - 要发送的数据
     * @returns {boolean} - 是否成功发送
     */
    send(data) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.error('无法发送消息，WebSocket未连接');
        return false;
      }
      
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(message);
        return true;
      } catch (error) {
        console.error('发送消息时出错:', error);
        return false;
      }
    }
    
    /**
     * 断开WebSocket连接
     */
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