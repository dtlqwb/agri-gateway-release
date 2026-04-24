require('dotenv').config();
const mysql = require('mysql2/promise');
const ytService = require('../services/yunTinanService');
const db = require('../services/db');

(async () => {
  console.log('\n========== 手动同步云途安最新数据 ==========\n');
  
  await db.init();
  
  // 直接调用云途安API获取最近数据
  console.log('[步骤1] 调用云途安API获取最近数据...');
  const result = await ytService.syncData('recent', 3);
  
  console.log(`\nAPI返回数据:`);
  console.log(`  总记录数: ${result.records.length} 条`);
  console.log(`  涉及设备: ${Object.keys(result.machineMap).length} 台`);
  
  // 分析数据日期分布
  const dateStats = {};
  result.records.forEach(r => {
    const date = r.workDate ? r.workDate.substring(0, 10) : '未知';
    if (!dateStats[date]) {
      dateStats[date] = { count: 0, acre: 0 };
    }
    dateStats[date].count++;
    dateStats[date].acre += r.acre || 0;
  });
  
  console.log('\n数据日期分布:');
  Object.entries(dateStats)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([date, stats]) => {
      console.log(`  ${date}: ${stats.count} 条, ${stats.acre.toFixed(2)} 亩`);
    });
  
  // 同步到数据库
  console.log('\n[步骤2] 同步到数据库...');
  const dbResult = await db.syncYuntinanRecords(result.records, result.machineMap);
  
  console.log(`\n数据库同步结果:`);
  console.log(`  新增: ${dbResult.newRecords} 条`);
  console.log(`  更新: ${dbResult.updateRecords} 条`);
  console.log(`  总计: ${dbResult.totalRecords} 条`);
  
  // 验证数据库中的最新数据
  console.log('\n[步骤3] 验证数据库数据...');
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });
  
  const [latest] = await c.execute(`
    SELECT MAX(work_date) as max_date, COUNT(*) as count 
    FROM work_records 
    WHERE source = 'yuntinan'
  `);
  
  console.log(`\n数据库验证结果:`);
  latest.forEach(r => {
    const maxDate = r.max_date ? new Date(r.max_date).toISOString().split('T')[0] : '无数据';
    console.log(`  云途安最新日期: ${maxDate}`);
    console.log(`  云途安总记录数: ${r.count} 条`);
  });
  
  const [recent3days] = await c.execute(`
    SELECT work_date, COUNT(*) as count, SUM(acre) as total_acre
    FROM work_records
    WHERE source = 'yuntinan' AND work_date >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
    GROUP BY work_date
    ORDER BY work_date DESC
  `);
  
  console.log('\n最近3天数据:');
  recent3days.forEach(r => {
    const dateStr = new Date(r.work_date).toISOString().split('T')[0];
    console.log(`  ${dateStr}: ${r.count} 条, ${parseFloat(r.total_acre || 0).toFixed(2)} 亩`);
  });
  
  await c.end();
  
  console.log('\n========================================\n');
  
  if (dbResult.newRecords === 0 && dbResult.updateRecords === 0) {
    console.log('⚠️  提示: API没有返回新数据');
    console.log('可能原因:');
    console.log('  1. 云途安平台还未上传最新数据（通常延迟1-2天）');
    console.log('  2. 4月16日、17日农机未作业');
    console.log('  3. 请明天凌晨2点后再检查（定时同步会自动执行）');
  } else {
    console.log('✅ 同步完成！请刷新浏览器页面查看最新数据。');
  }
  
  console.log('\n');
})();
