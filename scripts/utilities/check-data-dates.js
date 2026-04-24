require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 数据更新日期检查 ==========\n');
  
  // 1. 云途安设备
  console.log('【云途安设备】');
  const [yt] = await c.execute(
    'SELECT MAX(updated_at) as max_date, COUNT(*) as total FROM machines WHERE source = ?',
    ['yuntinan']
  );
  console.log('  最新更新日期:', yt[0].max_date);
  console.log('  设备总数:', yt[0].total);
  
  // 2. 旧供应商设备
  console.log('\n【旧供应商设备】');
  const [old] = await c.execute(
    'SELECT MAX(updated_at) as max_date, COUNT(*) as total FROM old_supplier_devices'
  );
  console.log('  最新更新日期:', old[0].max_date);
  console.log('  设备总数:', old[0].total);
  
  // 3. 云途安作业记录
  console.log('\n【作业记录 - 云途安】');
  const [ytWr] = await c.execute(
    'SELECT MAX(work_date) as max_date, COUNT(*) as total FROM work_records WHERE source = ?',
    ['yuntinan']
  );
  console.log('  最新作业日期:', ytWr[0].max_date);
  console.log('  记录总数:', ytWr[0].total);
  
  // 4. 旧供应商作业记录
  console.log('\n【作业记录 - 旧供应商】');
  const [oldWr] = await c.execute(
    'SELECT MAX(work_date) as max_date, COUNT(*) as total FROM work_records WHERE source IN (?, ?)',
    ['old', 'old_api']
  );
  console.log('  最新作业日期:', oldWr[0].max_date);
  console.log('  记录总数:', oldWr[0].total);
  
  // 5. 详细对比
  console.log('\n========== 详细分析 ==========\n');
  
  const ytDate = new Date(ytWr[0].max_date);
  const oldDate = new Date(oldWr[0].max_date);
  const diffDays = Math.floor((ytDate - oldDate) / (1000 * 60 * 60 * 24));
  
  console.log(`云途安最新作业日期: ${ytWr[0].max_date}`);
  console.log(`旧供应商最新作业日期: ${oldWr[0].max_date}`);
  console.log(`\n⚠️  日期差异: ${diffDays} 天`);
  
  if (diffDays > 2) {
    console.log('\n❌ 警告: 旧供应商数据滞后超过2天！');
    console.log('\n可能原因:');
    console.log('  1. 旧供应商API同步任务未执行或失败');
    console.log('  2. CSV导入的作业记录只到13日');
    console.log('  3. 定时同步任务配置问题');
  } else {
    console.log('\n✅ 数据日期差异在正常范围内');
  }
  
  // 6. 检查最近几天的记录数
  console.log('\n========== 最近7天记录分布 ==========\n');
  
  const [recentOld] = await c.execute(`
    SELECT work_date, COUNT(*) as count 
    FROM work_records 
    WHERE source IN ('old', 'old_api')
      AND work_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY work_date 
    ORDER BY work_date DESC
  `);
  
  console.log('旧供应商最近7天记录:');
  recentOld.forEach(r => {
    console.log(`  ${r.work_date}: ${r.count} 条`);
  });
  
  const [recentYt] = await c.execute(`
    SELECT work_date, COUNT(*) as count 
    FROM work_records 
    WHERE source = 'yuntinan'
      AND work_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY work_date 
    ORDER BY work_date DESC
  `);
  
  console.log('\n云途安最近7天记录:');
  recentYt.forEach(r => {
    console.log(`  ${r.work_date}: ${r.count} 条`);
  });
  
  await c.end();
  console.log('\n========================================\n');
})();
