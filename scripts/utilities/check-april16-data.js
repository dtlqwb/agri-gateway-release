require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 检查4月16日数据 ==========\n');
  
  // 云途安 4月16日
  const [yt] = await c.execute(
    'SELECT COUNT(*) as count, SUM(CASE WHEN COALESCE(acre,0)=0 THEN COALESCE(ok_acre,0) ELSE acre END) as total_acre FROM work_records WHERE source = ? AND work_date = ?',
    ['yuntinan', '2026-04-16']
  );
  console.log('【云途安 2026-04-16】');
  console.log('  记录数:', yt[0].count);
  console.log('  总面积:', yt[0].total_acre ? parseFloat(yt[0].total_acre).toFixed(2) : '0.00', '亩');
  
  // 旧供应商 4月16日
  const [old] = await c.execute(
    'SELECT COUNT(*) as count, SUM(CASE WHEN COALESCE(acre,0)=0 THEN COALESCE(ok_acre,0) ELSE acre END) as total_acre FROM work_records WHERE source IN (?, ?) AND work_date = ?',
    ['old', 'old_api', '2026-04-16']
  );
  console.log('\n【旧供应商 2026-04-16】');
  console.log('  记录数:', old[0].count);
  console.log('  总面积:', old[0].total_acre ? parseFloat(old[0].total_acre).toFixed(2) : '0.00', '亩');
  
  // 详细列出旧供应商4月16日的记录
  if (old[0].count > 0) {
    console.log('\n  详细记录:');
    const [details] = await c.execute(
      'SELECT t_number, work_type_name, CASE WHEN COALESCE(acre,0)=0 THEN COALESCE(ok_acre,0) ELSE acre END as acre FROM work_records WHERE source IN (?, ?) AND work_date = ? ORDER BY acre DESC LIMIT 10',
      ['old', 'old_api', '2026-04-16']
    );
    details.forEach((r, i) => {
      console.log(`    ${i+1}. 终端: ${r.t_number} | 类型: ${r.work_type_name || '-'} | 面积: ${parseFloat(r.acre).toFixed(2)} 亩`);
    });
  }
  
  // 对比最近3天
  console.log('\n========== 最近3天对比 ==========\n');
  
  const dates = ['2026-04-14', '2026-04-15', '2026-04-16'];
  
  for (const date of dates) {
    const [ytDay] = await c.execute(
      'SELECT COUNT(*) as count FROM work_records WHERE source = ? AND work_date = ?',
      ['yuntinan', date]
    );
    const [oldDay] = await c.execute(
      'SELECT COUNT(*) as count FROM work_records WHERE source IN (?, ?) AND work_date = ?',
      ['old', 'old_api', date]
    );
    
    console.log(`${date}:`);
    console.log(`  云途安: ${ytDay[0].count} 条`);
    console.log(`  旧供应商: ${oldDay[0].count} 条`);
  }
  
  console.log('\n========================================\n');
  
  await c.end();
})();
