// task-processor.js
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const messageQueue = require('./utils/message-queue');

class TaskProcessor {
  constructor() {
    this.processing = false;
  }
  
  async start() {
    if (this.processing) {
      return;
    }
    
    await messageQueue.connect();
    
    this.processing = true;
    
    // 开始消费任务队列
    await messageQueue.consumeTasks(async (task) => {
      console.log('Received new task');
      // 处理任务
      await this.processTask(task);
    });
    
    console.log('Task processor started');
  }
  
  async processTask(task) {
    const { taskId, userId, requestData } = task;
    
    console.log(`Starting to process task ${taskId} (user ${userId})`);
    
    // 模拟长时间运行的处理 - 这里可以是您的实际业务逻辑
    // 例如数据分析、报表生成等耗时操作
    const processingTime = Math.floor(Math.random() * 10000) + 5000; // 5-15秒
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // 生成任务结果 - 替换为您的实际结果数据
    const result = {
      taskId,
      status: 'completed',
      requestId: requestData.requestId,
      timestamp: Date.now(),
      data: {
        // 示例数据，根据实际业务替换
        id: uuidv4(),
        message: `Task ${taskId} completed`,
        processedAt: new Date().toISOString(),
        processingTime: `${processingTime}ms`,
        results: {
          totalItems: Math.floor(Math.random() * 100),
          processedItems: Math.floor(Math.random() * 100),
          status: 'success',
          // 其他业务数据...
          metrics: {
            score: Math.random() * 100,
            accuracy: Math.random() * 100
          }
        }
      }
    };
    
    // 将结果发送到结果队列
    await messageQueue.sendResult(userId, result);
    
    console.log(`Task ${taskId} completed, result sent to result queue`);
    return result;
  }
  
  async stop() {
    this.processing = false;
    await messageQueue.close();
    console.log('Task processor stopped');
  }
}

// 创建并启动任务处理器
const taskProcessor = new TaskProcessor();
taskProcessor.start().catch(console.error);

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('Received SIGINT signal, shutting down task processor...');
  await taskProcessor.stop();
  process.exit(0);
});