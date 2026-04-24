/**
 * 定时任务调度服务
 * @module services/scheduler
 * @description 管理所有定时同步任务（云途安、旧供应商API）
 */

const db = require('./db');

// ===================== 云途安数据自动同步 =====================

/**
 * 执行云途安数据同步（核心函数）
 * @param {'all'|'recent'} mode - all=全量同步(首次), recent=增量同步(每日,拉最近7天)
 */
async function runYuntinanSync(mode = 'recent') {
  const today = new Date().toISOString().substring(0, 10);

  try {
    // 检查是否已在同步
    const existing = db.getLatestSyncLog();
    if (existing && existing.status === 'running') {
      console.log(`[自动同步] 正在同步中，跳过`);
      return;
    }

    // 全量模式：只在没有任何成功记录时自动触发
    if (mode === 'all') {
      console.log(`[自动同步] 首次启动，执行全量同步...`);
    } else {
      console.log(`[自动同步] 每日增量同步，拉取最近7天数据...`);
    }

    db.createSyncLog(today, mode);

    const yt = require('./yunTinanService');
    const result = await yt.syncData(mode === 'all' ? 'all' : 'recent', 7);

    // 构建machineMap
    const machineMap = {};
    for (const [tNumber, m] of Object.entries(result.machineMap)) {
      machineMap[tNumber] = {
        plateNo: m.plateNo,
        driverName: m.driverName,
        orgName: m.orgName
      };
    }

    // 写入本地DB（靠唯一索引去重）
    const dbResult = await db.syncYuntinanRecords(result.records, machineMap);

    db.updateSyncLog(today, {
      status: 'success',
      total_records: dbResult.totalRecords,
      new_records: dbResult.newRecords,
      update_records: dbResult.updateRecords,
      finished_at: new Date().toLocaleString('zh-CN')
    });

    const label = mode === 'all' ? '全量' : '增量';
    console.log(`[自动同步] ${label}同步完成: ${dbResult.newRecords} 新增, ${dbResult.updateRecords} 更新, 共处理 ${dbResult.totalRecords} 条`);
  } catch (e) {
    console.error(`[自动同步] 同步失败:`, e.message);
    try {
      db.updateSyncLog(today, {
        status: 'failed',
        error: e.message,
        finished_at: new Date().toLocaleString('zh-CN')
      });
    } catch (_) {}
  }
}

/**
 * 启动云途安同步任务
 * @param {boolean} dbReady - 数据库是否就绪
 */
function startYuntinanScheduler(dbReady) {
  if (!dbReady) {
    console.warn('[云途安同步] 数据库未就绪，跳过定时任务');
    return;
  }

  // 启动后10秒：检查是否需要全量同步，否则增量同步
  setTimeout(() => {
    const hasSuccess = (() => {
      try { 
        const l = db.getLatestSyncLog(); 
        return l && l.status === 'success'; 
      } catch(_) { 
        return false; 
      }
    })();
    const mode = hasSuccess ? 'recent' : 'all';
    console.log(`[自动同步] 10秒后将执行${mode === 'all' ? '全量' : '增量'}同步...`);
    runYuntinanSync(mode).catch(e => console.error('[自动同步] 启动同步失败:', e.message));
  }, 10000);

  // 每天凌晨 2:00 自动增量同步（拉最近7天，靠去重避免重复）
  function scheduleNextSync() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next - now;
    console.log(`[自动同步] 下次定时同步: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

    setTimeout(() => {
      runYuntinanSync('recent').catch(e => console.error('[定时同步] 失败:', e.message));
      // 注册下一天的定时
      scheduleNextSync();
    }, delay);
  }

  scheduleNextSync();
}

// ===================== 旧供应商数据自动抓取（已禁用）=====================

/**
 * 启动旧供应商爬虫定时任务（已禁用）
 * @description 由于新I日供应商API已启用，旧的Playwright爬虫方式已不再需要
 */
function startOldSupplierCrawler() {
  if (process.env.ENABLE_OLD_CRAWLER === 'true') {
    // 每天凌晨 3:00 自动抓取旧供应商数据（最近7天）
    function scheduleOldSupplierCrawl() {
      const now = new Date();
      const next = new Date(now);
      next.setHours(3, 0, 0, 0); // 凌晨3点
      if (next <= now) next.setDate(next.getDate() + 1);

      const delay = next - now;
      console.log(`[旧供应商抓取] 下次定时抓取: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

      setTimeout(async () => {
        try {
          console.log('[定时任务] 开始抓取旧供应商数据...');
          const crawler = require('./oldSupplierCrawler');
          const result = await crawler.crawlOldSupplierData({ days: 7 });
          console.log('[定时任务] 旧供应商抓取完成:', result);
        } catch (e) {
          console.error('[定时任务] 旧供应商抓取失败:', e.message);
        }
        // 注册下一天的定时
        scheduleOldSupplierCrawl();
      }, delay);
    }

    scheduleOldSupplierCrawl();
  } else {
    console.log('[旧供应商抓取] 已禁用（使用新I日供应商API替代）');
  }
}

// ===================== 新I日供应商API自动同步 =====================

/**
 * 启动新I日供应商API同步任务
 */
function startOldAPISync() {
  // 检查是否启用
  if (process.env.ENABLE_OLD_SYNC !== 'true') {
    console.log('[新I日供应商API] 同步功能未启用（设置 ENABLE_OLD_SYNC=true 以启用）');
    return;
  }

  // 每天凌晨 4:00 自动同步新I日供应商API数据（昨天）
  function scheduleOldAPISync() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(4, 0, 0, 0); // 凌晨4点
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next - now;
    console.log(`[新I日供应商API] 下次定时同步: ${next.toLocaleString('zh-CN')} (${Math.round(delay / 60000)} 分钟后)`);

    setTimeout(async () => {
      try {
        console.log('[定时任务] 开始同步新I日供应商API数据...');
        const oldService = require('./oldSupplierService');
        const path = require('path');
        
        // 启动时先导入CSV映射表（优先使用templates目录）
        const csvPath = path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv');
        await oldService.importDeviceMapping(csvPath);
        
        // 同步昨天的数据
        const result = await oldService.syncDayData();
        console.log('[定时任务] 新I日供应商API同步完成:', result);
      } catch (e) {
        console.error('[定时任务] 新I日供应商API同步失败:', e.message);
      }
      // 注册下一天的定时
      scheduleOldAPISync();
    }, delay);
  }

  scheduleOldAPISync();
}

// ===================== 导出 =====================

module.exports = {
  runYuntinanSync,
  startYuntinanScheduler,
  startOldSupplierCrawler,
  startOldAPISync
};
