/**
 * 前端应用主逻辑
 * 负责UI交互和WebSocket通信
 */
document.addEventListener('DOMContentLoaded', function() {
    // 应用配置
    const config = {
      apiUrl: 'http://localhost:3000', // API服务器地址
      wsUrl: 'ws://localhost:3000'     // WebSocket服务器地址（与API同端口）
    };
    
    // DOM元素引用
    const elements = {
      connectionStatus: document.getElementById('connection-status'),
      loginForm: document.getElementById('login-form'),
      requestForm: document.getElementById('request-form'),
      requestCard: document.getElementById('request-card'),
      loggedUser: document.getElementById('logged-user'),
      messages: document.getElementById('messages'),
      clearMessages: document.getElementById('clear-messages'),
      pushData: document.getElementById('push-data')
    };
    
    // 应用状态
    const state = {
      token: localStorage.getItem('auth_token'), // 从本地存储获取令牌
      wsClient: null, // WebSocket客户端实例
      userId: null    // 用户ID
    };
    
    /**
     * 初始化WebSocket客户端
     */
    function initWebSocketClient() {
      state.wsClient = new WSClient(config.wsUrl, {
        heartbeatInterval: 25000, // 25秒发送一次心跳
        authToken: state.token,  // 自动使用令牌认证
        
        // 连接成功回调
        onConnect: () => {
          updateConnectionStatus('connected', '已连接');
          logMessage('已连接到WebSocket服务器', 'success');
        },
        
        // 连接断开回调
        onDisconnect: () => {
          updateConnectionStatus('disconnected', '已断开');
          logMessage('已断开WebSocket连接', 'error');
        },
        
        // 重连尝试回调
        onReconnect: (attempt) => {
          updateConnectionStatus('reconnecting', `重连中 (${attempt})`);
          logMessage(`正在尝试重连 (${attempt})`, 'info');
        },
        
        // 认证成功回调
        onAuthSuccess: (data) => {
          logMessage(`认证成功，用户ID: ${data.userId}`, 'success');
          state.userId = data.userId;
          elements.loggedUser.textContent = `用户ID: ${data.userId}`;
          elements.requestCard.style.display = 'block'; // 显示请求表单
        },
        
        // 认证失败回调
        onAuthFailure: (data) => {
          logMessage(`认证失败: ${data.message}`, 'error');
          // 清除无效的令牌
          localStorage.removeItem('auth_token');
          state.token = null;
        },
        
        // 消息接收回调
        onMessage: (data) => {
          // 只记录非心跳消息
          if (data.type !== 'ping' && data.type !== 'pong') {
            logMessage(`收到消息: ${JSON.stringify(data)}`, 'info');
          }
        }
      });
    }
    
    /**
     * 更新连接状态显示
     * @param {string} className - 状态类名
     * @param {string} text - 状态文本
     */
    function updateConnectionStatus(className, text) {
      elements.connectionStatus.className = 'status ' + className;
      elements.connectionStatus.textContent = text;
    }
    
    /**
     * 记录消息到UI日志
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 (info|success|error|warn)
     */
    function logMessage(message, type = 'info') {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${type}`;
      
      const timestamp = document.createElement('span');
      timestamp.className = 'timestamp';
      timestamp.textContent = new Date().toLocaleTimeString();
      
      messageElement.appendChild(timestamp);
      messageElement.appendChild(document.createTextNode(message));
      
      elements.messages.appendChild(messageElement);
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
    
    /**
     * 处理登录表单提交
     * @param {Event} event - 表单提交事件
     */
    async function handleLogin(event) {
      event.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        logMessage(`尝试登录用户: ${username}...`, 'info');
        
        // 发送登录请求到API
        const response = await fetch(`${config.apiUrl}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
          throw new Error(`登录失败: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        logMessage('登录成功', 'success');
        
        // 保存令牌
        state.token = data.token;
        localStorage.setItem('auth_token', data.token);
        
        // 如果WebSocket客户端已存在，则进行认证
        if (state.wsClient) {
          state.wsClient.authenticate(data.token);
        } else {
          // 否则初始化WebSocket客户端
          initWebSocketClient();
        }
        
      } catch (error) {
        logMessage(`登录错误: ${error.message}`, 'error');
      }
    }
    
    /**
     * 处理数据请求表单提交
     * @param {Event} event - 表单提交事件
     */
    function handleRequestData(event) {
      event.preventDefault();
      
      const dataType = document.getElementById('data-type').value;
      const detailLevel = document.getElementById('detail-level').value;
      
      // 生成请求ID
      const requestId = 'req-' + Date.now();
      
      logMessage(`发送数据请求 (${requestId})...`, 'info');
      
      // 发送请求
      state.wsClient.requestData(requestId, {
        dataType,
        options: {
          detail: detailLevel
        }
      }, {
        // 请求接受回调
        onAccepted: (data) => {
          logMessage(`请求已接受: ${data.message} (任务ID: ${data.taskId})`, 'success');
        },
        
        // 数据接收回调
        // 在app.js中的onData回调中添加以下逻辑
        onData: (data) => {
          // 显示这批数据
          logMessage(`收到批次 ${data.batchNumber}，进度: ${data.data.progress}%`, 'success');
          
          // 更新UI显示
          if (data.data.isFinal) {
            // 最终批次
            elements.pushData.textContent = JSON.stringify(data, null, 2);
          } else {
            // 非最终批次，追加或更新显示
            try {
              const currentData = JSON.parse(elements.pushData.textContent);
              // 合并数据
              elements.pushData.textContent = JSON.stringify({
                ...data,
                data: {
                  ...data.data,
                  // 合并之前的结果
                  results: [...(currentData.data?.results || []), ...data.data.results]
                }
              }, null, 2);
            } catch (e) {
              // 如果之前没有数据或解析错误，直接显示当前批次
              elements.pushData.textContent = JSON.stringify(data, null, 2);
            }
          }
        },
        
        // 错误回调
        onError: (data) => {
          logMessage(`请求错误: ${data.message}`, 'error');
        },
        
        once: true // 一次性回调
      });
    }
    
    /**
     * 处理清除消息按钮点击
     */
    function handleClearMessages() {
      elements.messages.innerHTML = '';
      logMessage('已清除消息', 'info');
    }
    
    // 注册事件监听器
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.requestForm.addEventListener('submit', handleRequestData);
    elements.clearMessages.addEventListener('click', handleClearMessages);
    
    /**
     * 应用初始化
     */
    function init() {
      if (state.token) {
        // 如果有保存的令牌，则直接初始化WebSocket客户端
        initWebSocketClient();
      } else {
        updateConnectionStatus('disconnected', '未连接');
      }
    }
    
    // 启动应用
    init();
  });