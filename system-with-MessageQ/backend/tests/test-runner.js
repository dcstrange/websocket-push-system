// tests/test-runner.js
const axios = require('axios');
const TestWSClient = require('./ws-client');
const config = require('../src/config');

const apiUrl = `http://localhost:${config.port.api}`;
const wsUrl = `ws://localhost:${config.port.ws}`;

// 测试用户
const testUser = {
  username: 'user1',
  password: 'password1'
};

// 控制台颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  let prefix = '';
  
  switch (type) {
    case 'success':
      prefix = `${colors.green}[SUCCESS]${colors.reset} `;
      break;
    case 'error':
      prefix = `${colors.red}[ERROR]${colors.reset} `;
      break;
    case 'warn':
      prefix = `${colors.yellow}[WARNING]${colors.reset} `;
      break;
    case 'info':
    default:
      prefix = `${colors.blue}[INFO]${colors.reset} `;
  }
  
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${prefix}${message}`);
}

async function login() {
  try {
    log('Attempting to login...');
    const response = await axios.post(`${apiUrl}/api/login`, testUser);
    log(`Login successful, received token: ${response.data.token.substring(0, 20)}...`, 'success');
    return response.data.token;
  } catch (error) {
    log(`Login failed: ${error.message}`, 'error');
    throw error;
  }
}

function runTests() {
  log(`Starting WebSocket push system tests...`);
  log(`API Server: ${apiUrl}`);
  log(`WebSocket Server: ${wsUrl}`);
  
  // 测试步骤
  return login()
    .then(token => {
      log('Creating WebSocket client...');
      
      // 创建WebSocket客户端
      const client = new TestWSClient(wsUrl, {
        debug: true,
        token,
        onOpen: () => {
          log('WebSocket connection established', 'success');
        },
        onMessage: (message) => {
          if (message.type === 'data') {
            log(`Received push data: ${JSON.stringify(message.payload)}`, 'success');
          }
        },
        onClose: () => {
          log('WebSocket connection closed', 'warn');
        },
        onError: (error) => {
          log(`WebSocket error: ${error}`, 'error');
        }
      });
      
      // 等待连接并认证
      return new Promise(resolve => {
        setTimeout(() => {
          if (client.authenticated) {
            log('Client authenticated automatically', 'success');
            resolve(client);
          } else {
            log('Authentication timeout', 'error');
            process.exit(1);
          }
        }, 3000);
      });
    })
    .then(client => {
      // 发送数据请求
      log('Sending data request...');
      
      return client.requestData({
        dataType: 'analysis',
        options: {
          detail: 'full'
        }
      })
      .then(response => {
        log(`Received request acceptance: ${JSON.stringify(response)}`, 'success');
        
        // 等待推送数据
        log('Waiting for push data (30 seconds timeout)...');
        
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for push data'));
          }, 30000);
          
          // 设置一次性消息处理程序来捕获推送数据
          const originalOnMessage = client.options.onMessage;
          
          client.options.onMessage = (message) => {
            originalOnMessage(message);
            
            if (message.type === 'data' && message.payload.requestId === response.requestId) {
              clearTimeout(timeout);
              resolve({ client, pushData: message.payload });
            }
          };
        });
      });
    })
    .then(({ client, pushData }) => {
      log(`Test completed successfully! Received push data: ${JSON.stringify(pushData)}`, 'success');
      client.close();
      return true;
    })
    .catch(error => {
      log(`Test failed: ${error.message}`, 'error');
      return false;
    });
}

// 执行测试
runTests()
  .then(success => {
    if (success) {
      log('All tests passed!', 'success');
      process.exit(0);
    } else {
      log('Tests failed', 'error');
      process.exit(1);
    }
  });