/**
 * 北斗设备（旧供应商API）全年数据同步脚本
 * @description 同步指定年份的所有日期数据
 * @example node scripts/sync-beidou-yearly.js 2026
 */

// 加载环境变量
require('dotenv').config();

const OldSupplierAPIService = require('../services/oldSupplierService');
const db = require('../services/db');

/**
 * 获取指定年份的所有日期
 * @param {number} year - 年份
 * @returns {string[]} 日期数组，格式 YYYY-MM-DD
 */
function getYearDates(year) {
  const dates = [];
  const startDate = new Date(year, 0, 1); // 1月1日
  const endDate = new Date(year, 11, 31); // 12月31日
  
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dates.push(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

/**
 * 延迟函数
 * @param {number} ms - 毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 同步全年数据
 * @param {number} year - 目标年份
 */
async function syncYearlyData(year) {
  console.log(`\n========== 开始同步 ${year} 年北斗设备数据 ==========\n`);
  
  try {
    // 初始化数据库
    await db.init();
    console.log('[数据库] 连接成功\n');
    
    // 检查是否启用同步
    const service = new OldSupplierAPIService();
    if (!service.enabled) {
      console.error('[错误] 旧供应商API同步功能未启用');
      console.error('请在 .env 文件中设置: ENABLE_OLD_SYNC=true');
      process.exit(1);
    }
    
    // 检查设备列表
    const devices = await db.queryAll('SELECT COUNT(*) as count FROM old_supplier_devices');
    const deviceCount = devices[0].count;
    
    if (deviceCount === 0) {
      console.error('[错误] 没有设备数据，请先导入设备映射表');
      console.error('运行: node scripts/import-old-devices.js');
      process.exit(1);
    }
    
    console.log(`[设备] 共 ${deviceCount} 台设备`);
    
    // 获取全年日期
    const dates = getYearDates(year);
    console.log(`[日期] ${year} 年共 ${dates.length} 天\n`);
    
    // 统计信息
    let totalSuccess = 0;
    let totalFail = 0;
    let totalAcre = 0;
    let syncedDays = 0;
    let skippedDays = 0;
    
    // 逐个日期同步
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const progress = ((i + 1) / dates.length * 100).toFixed(1);
      
      console.log(`\n[${progress}%] 正在同步: ${date} (${i + 1}/${dates.length})`);
      
      try {
        // 检查该日期是否已有数据
        const existing = await db.queryOne(
          `SELECT COUNT(*) as count FROM work_records 
           WHERE source = 'old_api' AND work_date = ?`,
          [date]
        );
        
        if (existing.count > 0) {
          console.log(`  ⚠️  该日期已有 ${existing.count} 条记录，跳过`);
          skippedDays++;
          continue;
        }
        
        // 同步该日期的数据
        const result = await service.syncDayData(date);
        
        if (result.success) {
          console.log(`  ✅ 成功: ${result.successCount} 台设备, 面积 ${result.totalAcre.toFixed(2)} 亩`);
          totalSuccess += result.successCount;
          totalFail += result.failCount;
          totalAcre += result.totalAcre;
          syncedDays++;
        } else {
          console.log(`  ❌ 失败: ${result.message}`);
          totalFail++;
        }
        
        // 避免请求过快，延迟200ms
        await sleep(200);
        
      } catch (error) {
        console.error(`  ❌ 异常: ${error.message}`);
        totalFail++;
      }
    }
    
    // 输出总结
    console.log('\n\n========== 同步完成 ==========\n');
    console.log(`📅 同步年份: ${year} 年`);
    console.log(`📊 总天数: ${dates.length} 天`);
    console.log(`✅ 成功同步: ${syncedDays} 天`);
    console.log(`⚠️  跳过天数: ${skippedDays} 天（已有数据）`);
    console.log(`🚜 设备总数: ${deviceCount} 台`);
    console.log(`✅ 成功次数: ${totalSuccess}`);
    console.log(`❌ 失败次数: ${totalFail}`);
    console.log(`📏 总面积: ${totalAcre.toFixed(2)} 亩`);
    console.log(`\n================================\n`);
    
  } catch (error) {
    console.error('\n[错误] 同步失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.close();
    console.log('[数据库] 连接已关闭\n');
  }
}

// 主程序
(async () => {
  // 从命令行参数获取年份，默认为今年
  const year = parseInt(process.argv[2]) || new Date().getFullYear();
  
  if (isNaN(year) || year < 2000 || year > 2100) {
    console.error('错误: 请提供有效的年份 (2000-2100)');
    console.error('用法: node scripts/sync-beidou-yearly.js [年份]');
    console.error('示例: node scripts/sync-beidou-yearly.js 2026');
    process.exit(1);
  }
  
  console.log(`准备同步 ${year} 年的北斗设备数据...`);
  console.log('按 Ctrl+C 可随时中断\n');
  
  await syncYearlyData(year);
})();
