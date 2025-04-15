// config.js
require('dotenv').config();

module.exports = {
  port: {
    ws: process.env.WS_PORT || 8080,
    api: process.env.API_PORT || 3000
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    taskQueue: 'task_queue',
    resultQueue: 'task_results'
  },
  ws: {
    heartbeatInterval: 30000,
    heartbeatTimeout: 60000
  }
};