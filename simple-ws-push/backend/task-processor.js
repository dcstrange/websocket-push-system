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
    this.dataFilePath = path.join(__dirname, 'data/graph_transformed.json');
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
      
      // 处理JSONL格式（每行一个JSON对象）
      const lines = data.split('\n').filter(line => line.trim() !== '');
      const jsonData = [];
      let lineNumber = 0;
      
      console.log(`总共读取了 ${lines.length} 行JSON数据`);
      
      for (const line of lines) {
        lineNumber++;
        try {
          const obj = JSON.parse(line);
          jsonData.push(obj);
        } catch (e) {
          console.error(`【行 ${lineNumber} 解析失败】`);
          console.error(`错误类型: ${e.name}`);
          console.error(`错误消息: ${e.message}`);
          
          // 找出可能的错误位置
          if (e.message.includes('position')) {
            const posMatch = e.message.match(/position (\d+)/);
            if (posMatch && posMatch[1]) {
              const pos = parseInt(posMatch[1]);
              const start = Math.max(0, pos - 20);
              const end = Math.min(line.length, pos + 20);
              console.error(`错误位置附近: "${line.substring(start, pos)}👉${line.substring(pos, end)}"`);
            }
          }
          
          // 输出行内容片段，避免过长
          const previewLength = 200;
          const linePreview = line.length > previewLength 
            ? line.substring(0, previewLength) + "..." 
            : line;
          console.error(`行内容预览: ${linePreview}`);
          
          // 尝试检测常见JSON格式问题
          if (line.includes('\\"')) {
            console.warn("可能的问题: 字符串中包含转义的引号");
          }
          if ((line.match(/"/g) || []).length % 2 !== 0) {
            console.warn("可能的问题: 引号数量不匹配");
          }
          if (line.includes('\\')) {
            console.warn("可能的问题: 包含反斜杠，可能需要额外转义");
          }
          
          // 尝试简单修复并重新解析
          let fixedLine = line;
          
          // 尝试修复1: 处理结尾多余逗号
          fixedLine = fixedLine.replace(/,\s*}$/, '}').replace(/,\s*]$/, ']');
          
          // 尝试修复2: 处理JSON中的换行符
          fixedLine = fixedLine.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          
          // 检查是否修复成功
          try {
            const fixedObj = JSON.parse(fixedLine);
            console.log(`✅ 自动修复成功! 添加到数据集`);
            jsonData.push(fixedObj);
          } catch (fixError) {
            console.error(`❌ 自动修复失败: ${fixError.message}`);
            
            // 保存失败的行到日志文件，方便后续分析
            try {
              const logDir = path.join(__dirname, 'logs');
              if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir);
              }
              
              const logFile = path.join(logDir, 'json_parse_errors.log');
              fs.appendFileSync(
                logFile, 
                `--- 行 ${lineNumber} (${new Date().toISOString()}) ---\n${line}\n\n`,
                'utf8'
              );
              console.log(`已将失败的行保存到: ${logFile}`);
            } catch (logError) {
              console.error(`无法保存日志: ${logError.message}`);
            }
          }
        }
      }
      
      console.log(`成功解析了 ${jsonData.length}/${lines.length} 个JSON对象 (${(jsonData.length/lines.length*100).toFixed(2)}%)`);
      
      if (jsonData.length === 0) {
        console.error('没有有效的JSON对象');
        
        // 通知错误
        onComplete(task.userId, {
          taskId: task.taskId,
          status: 'error',
          requestId: task.requestData.requestId,
          error: '没有有效的JSON数据',
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