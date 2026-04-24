/**
 * 手动同步今天和昨天的数据
 */
require('dotenv').config();
const yunTinanService = require('../services/yunTinanService');
const db = require('../services/db');

async function manualSyncToday() {
  console.log('=== 手动同步今天和昨天的数据 ===\n');
  
  const today = new Date().toISOString().substring(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
  
  console.log(`当前日期: ${today}`);
  console.log(`昨天日期: ${yesterday}\n`);
  
  try {
    // 初始化数据库
    console.log('[初始化] 正在连接数据库...');
    await db.init();
    console.log('[初始化] 数据库连接成功\n');
    
    // 1. 同步云途安最近7天数据
    console.log('[1/2] 开始同步云途安数据（最近7天）...');
    
    const result = await yunTinanService.syncData('recent', 7);
    
    console.log(`  API返回: ${result.records.length} 条记录`);
    console.log(`  设备数量: ${Object.keys(result.machineMap).length} 台\n`);
    
    // 构建machineMap
    const machineMap = {};
    for (const [tNumber, m] of Object.entries(result.machineMap)) {
      machineMap[tNumber] = {
        plateNo: m.plateNo,
        driverName: m.driverName,
        orgName: m.orgName
      };
    }
    
    // 同步到数据库
    const dbResult = await db.syncYuntinanRecords(result.records, machineMap);
    
    console.log(`[1/2] 云途安同步完成:`);
    console.log(`  新增: ${dbResult.newRecords} 条`);
    console.log(`  更新: ${dbResult.updateRecords} 条`);
    console.log(`  总计: ${dbResult.totalRecords} 条\n`);
    
    // 2. 验证同步结果
    console.log('[2/2] 验证同步结果...');
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });
    
    const [yuntinanCheck] = await conn.execute(
      'SELECT MAX(work_date) as max_date, COUNT(*) as count FROM work_records WHERE source="yuntinan"'
    );
    
    const maxDate = yuntinanCheck[0].max_date ? 
      new Date(yuntinanCheck[0].max_date).toISOString().split('T')[0] : '无数据';
    
    console.log(`  云途安最新日期: ${maxDate}`);
    console.log(`  总记录数: ${yuntinanCheck[0].count} 条`);
    
    if (maxDate === today || maxDate === yesterday) {
      console.log('  ✅ 日期正常');
    } else {
      console.log('  ❌ 日期滞后，期望: ' + today);
    }
    
    // 检查最近3天的数据量
    console.log('\n  最近3天数据分布:');
    const [recentDays] = await conn.execute(`
      SELECT work_date, COUNT(*) as count, SUM(acre) as total_acre
      FROM work_records
      WHERE source='yuntinan' AND work_date >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
      GROUP BY work_date
      ORDER BY work_date DESC
    `);
    
    recentDays.forEach(r => {
      const dateStr = new Date(r.work_date).toISOString().split('T')[0];
      const acre = r.total_acre ? parseFloat(r.total_acre).toFixed(2) : '0.00';
      console.log(`    ${dateStr}: ${r.count} 条, ${acre} 亩`);
    });
    
    await conn.end();
    
    console.log('\n✅ 同步完成！');
    console.log('\n提示: 如果日期仍然滞后，可能是时区转换问题。');
    console.log('请检查 MySQL 连接的时区配置。');
    
  } catch (error) {
    console.error('同步失败:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

manualSyncToday();
