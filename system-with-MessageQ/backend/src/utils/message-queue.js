// utils/message-queue.js
const amqp = require('amqplib');
const config = require('../config');

class MessageQueue {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.connected = false;
  }
  
  async connect() {
    try {
      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();
      
      // 声明队列
      await this.channel.assertQueue(config.rabbitmq.taskQueue, { durable: true });
      await this.channel.assertQueue(config.rabbitmq.resultQueue, { durable: true });
      
      this.connected = true;
      console.log('Connected to RabbitMQ');
      
      // 设置连接关闭监听器
      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        this.connected = false;
        // 尝试重新连接
        setTimeout(() => this.connect(), 5000);
      });
      
      return true;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      this.connected = false;
      // 尝试重新连接
      setTimeout(() => this.connect(), 5000);
      return false;
    }
  }
  
  async sendTask(task) {
    if (!this.connected) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    return this.channel.sendToQueue(
      config.rabbitmq.taskQueue,
      Buffer.from(JSON.stringify(task)),
      { persistent: true }
    );
  }
  
  async sendResult(userId, result) {
    if (!this.connected) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    return this.channel.sendToQueue(
      config.rabbitmq.resultQueue,
      Buffer.from(JSON.stringify({
        userId,
        result
      })),
      { persistent: true }
    );
  }
  
  async consumeTasks(callback) {
    if (!this.connected) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    // 设置QoS，每次只处理一个消息
    this.channel.prefetch(1);
    
    return this.channel.consume(config.rabbitmq.taskQueue, async (msg) => {
      if (msg !== null) {
        try {
          const task = JSON.parse(msg.content.toString());
          await callback(task);
          this.channel.ack(msg);
        } catch (error) {
          console.error('Error processing task:', error);
          // 重新入队
          this.channel.nack(msg);
        }
      }
    });
  }
  
  async consumeResults(callback) {
    if (!this.connected) {
      throw new Error('Not connected to RabbitMQ');
    }
    
    return this.channel.consume(config.rabbitmq.resultQueue, (msg) => {
      if (msg !== null) {
        try {
          const data = JSON.parse(msg.content.toString());
          callback(data);
          this.channel.ack(msg);
        } catch (error) {
          console.error('Error processing result:', error);
          this.channel.nack(msg);
        }
      }
    });
  }
  
  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }
    
    this.connected = false;
    console.log('Closed connection to RabbitMQ');
  }
}

module.exports = new MessageQueue();