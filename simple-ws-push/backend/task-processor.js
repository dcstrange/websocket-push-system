// task-processor.js - 处理长时间运行的任务

const { v4: uuidv4 } = require('uuid');

/**
 * 任务处理器类 - 模拟异步任务处理
 */
class TaskProcessor {
  constructor() {
    this.tasks = new Map(); // 存储正在进行的任务
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
    
    // 模拟随机处理时间（5-15秒）
    const processingTime = Math.floor(Math.random() * 10000) + 5000;
    
    // 使用setTimeout模拟异步处理
    setTimeout(() => {
      // 生成结果数据
      const result = this._generateResult(task, processingTime);
      
      // 更新任务状态
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
      
      console.log(`任务 ${taskId} 处理完成，耗时 ${processingTime}ms`);
      
      // 调用完成回调
      onComplete(task.userId, result);
      
      // 从Map中移除任务（可选，若需保留历史记录则不移除）
      // this.tasks.delete(taskId);
    }, processingTime);
    
    return true;
  }
  
  /**
   * 生成任务结果
   * @private
   * @param {object} task - 任务对象
   * @param {number} processingTime - 处理时间
   * @returns {object} - 任务结果
   */
  _generateResult(task, processingTime) {
    // 根据不同的请求类型返回不同的数据结构
    // 这里是示例数据，实际应用中可根据业务需求生成
    const { requestId, dataType, options } = task.requestData;
    
    return {
      taskId: task.taskId,
      status: 'completed',
      requestId: requestId,
      timestamp: Date.now(),
      data: {
        id: uuidv4(),
        message: `任务已完成，数据类型: ${dataType}`,
        processedAt: new Date().toISOString(),
        processingTime: `${processingTime}ms`,
        results: {
          totalItems: Math.floor(Math.random() * 100),
          processedItems: Math.floor(Math.random() * 100),
          status: 'success',
          type: dataType,
          detailLevel: options?.detail || 'basic',
          metrics: {
            score: Math.random() * 100,
            accuracy: Math.random() * 100
          }
        }
      }
    };
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