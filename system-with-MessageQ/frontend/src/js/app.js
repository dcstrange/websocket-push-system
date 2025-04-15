document.addEventListener('DOMContentLoaded', function() {
    // 配置
    const config = {
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:8080'
    };
    
    // DOM元素
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
      token: localStorage.getItem('auth_token'),
      wsClient: null,
      userId: null
    };
    
    // 初始化WebSocket客户端
    function initWebSocketClient() {
      state.wsClient = new WSClient(config.wsUrl, {
        heartbeatInterval: 25000, // 25秒发送一次心跳
        authToken: state.token,
        onConnect: () => {
          updateConnectionStatus('connected', 'Connected');
          logMessage('Connected to WebSocket server', 'success');
        },
        onDisconnect: () => {
          updateConnectionStatus('disconnected', 'Disconnected');
          logMessage('Disconnected from WebSocket server', 'error');
        },
        onReconnect: (attempt) => {
          updateConnectionStatus('reconnecting', `Reconnecting (${attempt})`);
          logMessage(`Attempting to reconnect (${attempt})`, 'info');
        },
        onAuthSuccess: (data) => {
          logMessage(`Authentication successful, user ID: ${data.userId}`, 'success');
          state.userId = data.userId;
          elements.loggedUser.textContent = `User ID: ${data.userId}`;
          elements.requestCard.style.display = 'block';
        },
        onAuthFailure: (data) => {
          logMessage(`Authentication failed: ${data.message}`, 'error');
          // 清除无效的令牌
          localStorage.removeItem('auth_token');
          state.token = null;
        },
        onMessage: (data) => {
          // 只记录非心跳消息
          if (data.type !== 'pong') {
            logMessage(`Received message: ${JSON.stringify(data)}`, 'info');
          }
        }
      });
    }
    
    // 更新连接状态显示
    function updateConnectionStatus(className, text) {
      elements.connectionStatus.className = 'status ' + className;
      elements.connectionStatus.textContent = text;
    }
    
    // 记录消息
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
    
    // 登录处理
    async function handleLogin(event) {
      event.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        logMessage(`Attempting to login as ${username}...`, 'info');
        
        const response = await fetch(`${config.apiUrl}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
          throw new Error(`Login failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        logMessage('Login successful', 'success');
        
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
        logMessage(`Login error: ${error.message}`, 'error');
      }
    }
    
    // 请求数据处理
    function handleRequestData(event) {
      event.preventDefault();
      
      const dataType = document.getElementById('data-type').value;
      const detailLevel = document.getElementById('detail-level').value;
      
      // 生成请求ID
      const requestId = 'req-' + Date.now();
      
      logMessage(`Sending data request (${requestId})...`, 'info');
      
      // 发送请求
      state.wsClient.requestData(requestId, {
        dataType,
        options: {
          detail: detailLevel
        }
      }, {
        onAccepted: (data) => {
          logMessage(`Request accepted: ${data.message} (Task ID: ${data.taskId})`, 'success');
        },
        onData: (data) => {
          logMessage(`Received data for request ${requestId}`, 'success');
          // 更新显示
          elements.pushData.textContent = JSON.stringify(data, null, 2);
        },
        onError: (data) => {
          logMessage(`Request error: ${data.message}`, 'error');
        },
        once: true // 一次性回调
      });
    }
    
    // 清除消息
    function handleClearMessages() {
      elements.messages.innerHTML = '';
      logMessage('Messages cleared', 'info');
    }
    
    // 事件监听器
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.requestForm.addEventListener('submit', handleRequestData);
    elements.clearMessages.addEventListener('click', handleClearMessages);
    
    // 初始化
    function init() {
      if (state.token) {
        // 如果有保存的令牌，则直接初始化WebSocket客户端
        initWebSocketClient();
      } else {
        updateConnectionStatus('disconnected', 'Not Connected');
      }
    }
    
    // 启动应用
    init();
  });