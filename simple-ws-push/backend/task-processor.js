// task-processor.js - 处理长时间运行的任务

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * 任务处理器类 - 模拟异步任务处理
 */
class TaskProcessor {
  constructor() {
    this.tasks = new Map(); // 存储正在进行的任务
    // 示例数据文件路径（你需要创建这个文件）
    this.dataFilePath = path.join(__dirname, 'sample-data.json');
  }
  
  /**
   * 创建新任务
   * @param {string} userId - 用户ID
   * @param {object} requestData - 请求数据
   * @returns {object} - 任务信息
   */
  createTask(userId, requestData) {
    const taskId = uuidv4();
    
    const task = {
      taskId,
      userId,
      requestData,
      status: 'pending',
      createdAt: Date.now()
    };
    
    this.tasks.set(taskId, task);
    
    return {
      taskId,
      status: 'pending'
    };
  }
  
  /**
   * 开始处理任务
   * @param {string} taskId - 任务ID
   * @param {function} onComplete - 任务完成时的回调函数
   */
  processTask(taskId, onComplete) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return false;
    }
    
    console.log(`开始处理任务 ${taskId} (用户 ${task.userId})`);
    
    // 更新任务状态
    task.status = 'processing';
    
    // 读取JSON文件
    this._processJsonFile(task, onComplete);
    
    return true;
  }
  
  /**
   * 处理JSON文件并分批发送数据
   * @private
   * @param {object} task - 任务对象
   * @param {function} onComplete - 回调函数
   */
  _processJsonFile(task, onComplete) {
    // 检查文件是否存在，如果不存在则创建示例数据
    if (!fs.existsSync(this.dataFilePath)) {
      this._createSampleData();
    }
    
    // 读取JSON文件
    fs.readFile(this.dataFilePath, 'utf8', (err, data) => {
      if (err) {
        console.error('读取JSON文件失败:', err);
        
        // 通知错误
        onComplete(task.userId, {
          taskId: task.taskId,
          status: 'error',
          requestId: task.requestData.requestId,
          error: '读取数据文件失败',
          timestamp: Date.now()
        });
        
        return;
      }
      
      let jsonData;
      try {
        jsonData = JSON.parse(data);
      } catch (e) {
        console.error('解析JSON文件失败:', e);
        
        // 通知错误
        onComplete(task.userId, {
          taskId: task.taskId,
          status: 'error',
          requestId: task.requestData.requestId,
          error: 'JSON解析失败',
          timestamp: Date.now()
        });
        
        return;
      }
      
      // 开始分批处理数据
      this._sendDataInBatches(task, jsonData, onComplete);
    });
  }
  
  /**
   * 分批发送数据
   * @private
   * @param {object} task - 任务对象
   * @param {object} data - JSON数据
   * @param {function} onComplete - 回调函数
   */
  _sendDataInBatches(task, data, onComplete) {
    // 如果数据是数组，直接使用；否则将其变成数组
    const items = Array.isArray(data) ? data : [data];
    const totalItems = items.length;
    
    if (totalItems === 0) {
      // 没有数据，直接完成
      onComplete(task.userId, {
        taskId: task.taskId,
        status: 'completed',
        requestId: task.requestData.requestId,
        message: '没有数据需要处理',
        timestamp: Date.now(),
        data: {
          totalItems: 0,
          processedItems: 0,
          results: []
        }
      });
      return;
    }
    
    let processedItems = 0;
    let batchNumber = 0;
    
    // 发送第一批数据的函数
    const sendNextBatch = () => {
      // 随机决定这一批处理多少项
      const batchSize = Math.min(
        totalItems - processedItems,
        Math.floor(Math.random() * 10) + 1 // 每批1-10个项目
      );
      
      // 提取这一批的数据
      const batchItems = items.slice(processedItems, processedItems + batchSize);
      processedItems += batchSize;
      batchNumber++;
      
      // 构建结果对象
      const result = {
        taskId: task.taskId,
        status: processedItems >= totalItems ? 'completed' : 'processing',
        requestId: task.requestData.requestId,
        timestamp: Date.now(),
        batchNumber,
        data: {
          totalItems,
          processedItems,
          progress: Math.round((processedItems / totalItems) * 100),
          isFinal: processedItems >= totalItems,
          results: batchItems
        }
      };
      
      // 发送这一批数据
      onComplete(task.userId, result);
      
      // 如果还有更多数据，设置超时继续发送
      if (processedItems < totalItems) {
        // 随机等待时间，模拟处理时间
        const delay = Math.floor(Math.random() * 2000) + 500; // 500-2500ms
        setTimeout(sendNextBatch, delay);
      } else {
        // 所有数据已处理完成，更新任务状态
        task.status = 'completed';
        task.completedAt = Date.now();
      }
    };
    
    // 开始发送第一批
    sendNextBatch();
  }
  
  /**
   * 创建示例JSON数据文件
   * @private
   */
  _createSampleData() {
    console.log('创建示例数据文件...');
    
    // 创建一个包含100项的示例数据数组
    const sampleData = [];
    for (let i = 0; i < 100; i++) {
      sampleData.push({
        id: uuidv4(),
        name: `项目 ${i + 1}`,
        value: Math.round(Math.random() * 1000),
        timestamp: new Date().toISOString(),
        status: ['进行中', '已完成', '已暂停', '已取消'][Math.floor(Math.random() * 4)],
        metrics: {
          accuracy: Math.random().toFixed(2),
          performance: Math.random().toFixed(2),
          reliability: Math.random().toFixed(2)
        }
      });
    }
    
    // 写入文件
    fs.writeFileSync(
      this.dataFilePath,
      JSON.stringify(sampleData, null, 2),
      'utf8'
    );
    
    console.log(`示例数据文件已创建: ${this.dataFilePath}`);
  }
  
  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {object|null} - 任务状态，不存在返回null
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return null;
    }
    
    return {
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt
    };
  }
}

module.exports = new TaskProcessor();