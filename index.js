/**
 * 农机定位聚合平台 - 主入口文件（精简版）
 * @module index
 * @description Express应用启动入口，负责初始化、中间件注册和路由挂载
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

// ===================== 全局异常处理 =====================
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[未处理Promise拒绝]', reason);
});

// ===================== 导入自定义模块 =====================
const corsMiddleware = require('./middleware/cors');
const upload = require('./middleware/upload');
const db = require('./services/db');
const routes = require('./routes');
const scheduler = require('./services/scheduler');

// ===================== 创建Express应用 =====================
const app = express();

// JSON解析中间件
app.use(express.json({ limit: '50mb' }));

// CORS中间件
app.use(corsMiddleware);

// ===================== 数据库初始化 =====================
let dbReady = false;

async function startServer() {
  try {
    // 初始化数据库
    await db.init();
    dbReady = true;
    console.log('[DB] 数据库就绪');

    // 修复旧数据：acre=0 的记录用 ok_acre 回填
    db.repairAcreData();

    // 修复旧数据：从作业记录提取设备信息写入 machines 表
    db.repairMachineData();

    // ===================== 注册路由 =====================
    app.use('/api', routes);

    // 静态文件服务
    app.use(express.static(path.join(__dirname, 'public')));
    
    // 前端页面路由
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    app.get('/farmer', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'farmer.html'));
    });

    // ===================== 启动定时任务 =====================
    // 注意：本地开发时建议禁用定时任务，避免影响云端数据
    const enableScheduler = process.env.ENABLE_SCHEDULER === 'true';
    
    if (enableScheduler) {
      console.log('[定时任务] ✅ 已启用（云端服务器模式）');
      scheduler.startYuntinanScheduler(dbReady);
      scheduler.startOldSupplierCrawler();
      scheduler.startOldAPISync();
    } else {
      console.log('[定时任务] ⚠️  已禁用（本地开发模式，避免影响云端数据）');
      console.log('[定时任务] 💡 如需启用，设置 ENABLE_SCHEDULER=true');
    }

    // ===================== 启动服务器 =====================
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`\n🚀 聚合平台已启动: http://localhost:${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api/health`);
      console.log(`   前端: http://localhost:${PORT}\n`);
    });

  } catch (error) {
    console.error('[启动失败]', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();

// ===================== 优雅关闭 =====================
process.on('SIGTERM', () => {
  console.log('\n收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});

module.exports = app;
