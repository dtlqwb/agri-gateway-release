/**
 * 旧供应商历史数据全量同步脚本
 * 用途：同步指定日期范围内的所有旧供应商数据
 */

require('dotenv').config();
const oldSupplierService = require('../services/oldSupplierService');
const db = require('../services/db');

// 配置同步日期范围
const START_DATE = '2026-01-01';  // 从今年1月1日开始
const END_DATE = '2026-04-23';    // 到今天

async function main() {
  console.log('\n========================================');
  console.log('  旧供应商历史数据全量同步');
  console.log('========================================\n');
  
  console.log(`同步范围: ${START_DATE} 至 ${END_DATE}`);
  console.log('');
  
  // 初始化数据库
  await db.init();
  console.log('[DB] 数据库连接成功\n');
  
  try {
    // 执行批量同步
    console.log('[开始] 正在同步历史数据，这可能需要几分钟...\n');
    const results = await oldSupplierService.syncDateRange(START_DATE, END_DATE);
    
    // 统计结果
    const totalSuccess = results.filter(r => r.success).reduce((sum, r) => sum + (r.successCount || 0), 0);
    const totalFail = results.filter(r => r.success).reduce((sum, r) => sum + (r.failCount || 0), 0);
    const totalAcre = results.filter(r => r.success).reduce((sum, r) => sum + (r.totalAcre || 0), 0);
    const syncedDays = results.filter(r => r.success).length;
    
    console.log('\n========================================');
    console.log('  同步完成');
    console.log('========================================\n');
    console.log(`同步天数: ${syncedDays} 天`);
    console.log(`成功记录: ${totalSuccess} 条`);
    console.log(`失败记录: ${totalFail} 条`);
    console.log(`总面积:   ${totalAcre.toFixed(2)} 亩`);
    console.log('');
    
    // 显示数据库中的最新统计
    console.log('[统计] 数据库中的旧供应商数据:');
    const stat = await db.queryOne(`
      SELECT COUNT(*) as count, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
      FROM work_records 
      WHERE source = 'old_api'
    `);
    console.log(`  记录数: ${stat.count} 条`);
    console.log(`  总面积: ${stat.total_acre} 亩`);
    console.log('');
    
    // 提示
    if (parseFloat(stat.total_acre || 0) >= 15686.26) {
      console.log('✅ 数据已完整！');
    } else {
      const diff = 15686.26 - parseFloat(stat.total_acre || 0);
      console.log(`⚠️  还差 ${diff.toFixed(2)} 亩，可能需要:`);
      console.log(`   1. 延长同步日期范围（同步更早的数据）`);
      console.log(`   2. 检查旧供应商 API 是否还有更多数据`);
    }
    
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
