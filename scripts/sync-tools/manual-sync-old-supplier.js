/**
 * 手动同步旧供应商API数据
 * @description 立即同步指定日期的作业数据，解决数据滞后问题
 */

require('dotenv').config();
const db = require('../services/db');
const oldService = require('../services/oldSupplierService');

// 配置要同步的日期
const DATES_TO_SYNC = [
  '2026-04-15',  // 昨天（相对于云途安最新日期）
  '2026-04-16'   // 今天
];

async function manualSync() {
  console.log('\n========== 开始手动同步旧供应商数据 ==========\n');
  
  // 先初始化数据库连接
  console.log('[初始化] 连接数据库...');
  await db.init();
  console.log('[初始化] 数据库连接成功\n');
  
  let totalSuccess = 0;
  let totalFail = 0;
  let totalAcre = 0;
  
  for (const date of DATES_TO_SYNC) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 同步日期: ${date}`);
    console.log('='.repeat(60));
    
    try {
      const result = await oldService.syncDayData(date);
      
      if (result.success) {
        console.log(`\n✅ 同步成功!`);
        console.log(`   - 设备总数: ${result.totalDevices}`);
        console.log(`   - 成功: ${result.successCount} 台`);
        console.log(`   - 失败: ${result.failCount} 台`);
        console.log(`   - 总面积: ${result.totalAcre.toFixed(2)} 亩`);
        
        totalSuccess += result.successCount;
        totalFail += result.failCount;
        totalAcre += result.totalAcre;
      } else {
        console.log(`\n❌ 同步失败: ${result.message}`);
      }
      
      // 每个日期间隔2秒，避免API压力过大
      if (DATES_TO_SYNC.indexOf(date) < DATES_TO_SYNC.length - 1) {
        console.log('\n⏳ 等待2秒后继续下一个日期...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`\n❌ 同步 ${date} 时发生错误:`, error.message);
      totalFail++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 同步汇总');
  console.log('='.repeat(60));
  console.log(`总成功: ${totalSuccess} 台次`);
  console.log(`总失败: ${totalFail} 台次`);
  console.log(`总面积: ${totalAcre.toFixed(2)} 亩`);
  console.log('='.repeat(60));
  
  console.log('\n💡 提示: 运行 node scripts/check-data-dates.js 查看最新状态\n');
}

// 执行
manualSync()
  .then(() => {
    console.log('\n✅ 全部完成\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 执行失败:', error);
    process.exit(1);
  });
