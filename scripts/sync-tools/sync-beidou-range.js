/**
 * 
 * 
 * 
 * 北斗设备数据同步 - 从4月1日到昨天
 * 用于首次全量同步，之后使用增量更新
 */

require('dotenv').config();
const service = require('../services/oldSupplierService');
const db = require('../services/db');

/**
 * 获取日期范围（从4月1日到昨天）
 * @param {number} year - 年份
 * @returns {{startDate: string, endDate: string, dates: string[]}}
 */
function getDateRange(year) {
  const startDate = new Date(year, 3, 1); // 4月1日
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  // 如果昨天早于4月1日，则不需要同步
  if (yesterday < startDate) {
    console.log('[提示] 昨天早于4月1日，无需同步');
    return { startDate: null, endDate: null, dates: [] };
  }
  
  const dates = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= yesterday) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dates.push(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: yesterday.toISOString().split('T')[0],
    dates
  };
}

/**
 * 同步指定日期范围的数据
 * @param {string} startDate - 开始日期 YYYY-MM-DD
 * @param {string} endDate - 结束日期 YYYY-MM-DD
 */
async function syncDateRange(startDate, endDate) {
  console.log(`\n========== 开始同步北斗设备数据 ==========`);
  console.log(`[日期范围] ${startDate} 至 ${endDate}`);
  
  try {
    // 生成日期数组
    const dates = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`[总天数] ${dates.length} 天`);
    console.log(`按 Ctrl+C 可随时中断\n`);
    
    let totalSuccess = 0;
    let totalFail = 0;
    let totalAcre = 0;
    let daysWithData = 0;
    
    // 逐天同步
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const progress = ((i + 1) / dates.length * 100).toFixed(1);
      
      console.log(`[${progress}%] 正在同步: ${date} (${i + 1}/${dates.length})`);
      
      try {
        const result = await service.syncDayData(date);
        
        if (result.success) {
          totalSuccess += result.successCount;
          totalFail += result.failCount;
          totalAcre += result.totalAcre;
          
          if (result.totalAcre > 0) {
            daysWithData++;
            console.log(`  ✅ 该日期有数据: ${result.successCount} 台设备, 总面积 ${result.totalAcre.toFixed(2)} 亩\n`);
          } else {
            console.log(`  ⚪ 该日期无作业数据\n`);
          }
        }
      } catch (error) {
        console.error(`  ❌ 同步失败: ${error.message}\n`);
        totalFail++;
      }
      
      // 每天之间等待500ms，避免API限流
      if (i < dates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 输出统计信息
    console.log('\n========== 同步完成统计 ==========');
    console.log(`[日期范围] ${startDate} 至 ${endDate}`);
    console.log(`[总天数] ${dates.length} 天`);
    console.log(`[有数据的天数] ${daysWithData} 天`);
    console.log(`[成功同步] ${totalSuccess} 条记录`);
    console.log(`[失败次数] ${totalFail} 次`);
    console.log(`[总面积] ${totalAcre.toFixed(2)} 亩`);
    console.log('==================================\n');
    
    return {
      success: true,
      totalDays: dates.length,
      daysWithData,
      totalSuccess,
      totalFail,
      totalAcre
    };
    
  } catch (error) {
    console.error('\n❌ 同步过程出错:', error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

// 主函数
async function main() {
  console.log('准备同步北斗设备数据（从4月1日到昨天）...\n');
  
  // 初始化数据库连接
  await db.init();
  console.log('[DB] 数据库就绪');
  
  // 检查是否启用同步
  if (!service.enabled) {
    console.error('[错误] 旧供应商API同步功能未启用');
    console.error('请在 .env 文件中设置 ENABLE_OLD_SYNC=true');
    process.exit(1);
  }
  
  // 获取今年的日期范围
  const currentYear = new Date().getFullYear();
  const range = getDateRange(currentYear);
  
  if (range.dates.length === 0) {
    console.log('[提示] 没有需要同步的日期');
    process.exit(0);
  }
  
  console.log(`准备同步 ${currentYear} 年 ${range.startDate} 至 ${range.endDate}`);
  console.log(`共 ${range.dates.length} 天\n`);
  
  // 执行同步
  const result = await syncDateRange(range.startDate, range.endDate);
  
  if (result.success) {
    console.log('✅ 同步完成！');
    process.exit(0);
  } else {
    console.error('❌ 同步失败！');
    process.exit(1);
  }
}

// 运行
main().catch(error => {
  console.error('❌ 程序异常:', error.message);
  console.error(error.stack);
  process.exit(1);
});
