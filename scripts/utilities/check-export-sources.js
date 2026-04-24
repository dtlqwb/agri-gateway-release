require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 检查work_records表中的source值 ==========\n');
  
  const [sources] = await c.execute(
    'SELECT source, COUNT(*) as count FROM work_records GROUP BY source ORDER BY count DESC'
  );
  console.log('Source分布:');
  sources.forEach(s => {
    console.log(`  ${s.source}: ${s.count} 条`);
  });
  
  console.log('\n========== 检查最近7天的旧供应商记录 ==========\n');
  
  const [oldRecent] = await c.execute(`
    SELECT source, work_date, COUNT(*) as count 
    FROM work_records 
    WHERE source LIKE 'old%' 
      AND work_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
    GROUP BY source, work_date 
    ORDER BY work_date DESC, source
  `);
  
  console.log('旧供应商最近7天:');
  oldRecent.forEach(r => {
    console.log(`  ${r.work_date} | ${r.source}: ${r.count} 条`);
  });
  
  console.log('\n========== 测试导出查询 ==========\n');
  
  // 模拟导出查询
  const testSql = `
    SELECT wr.source, wr.t_number, wr.work_date, wr.acre
    FROM work_records wr
    WHERE wr.source IN ('yuntinan', 'old')
      AND wr.work_date >= ?
      AND wr.work_date <= ?
    LIMIT 5
  `;
  
  const [test1] = await c.execute(testSql, ['2026-04-10', '2026-04-16']);
  console.log('当前查询 (yuntinan, old):');
  console.log(`  返回 ${test1.length} 条记录`);
  if (test1.length > 0) {
    test1.forEach(r => {
      console.log(`    - ${r.source} | ${r.t_number} | ${r.work_date}`);
    });
  }
  
  // 修改为包含 old_api
  const testSql2 = `
    SELECT wr.source, wr.t_number, wr.work_date, wr.acre
    FROM work_records wr
    WHERE wr.source IN ('yuntinan', 'old', 'old_api')
      AND wr.work_date >= ?
      AND wr.work_date <= ?
    LIMIT 5
  `;
  
  const [test2] = await c.execute(testSql2, ['2026-04-10', '2026-04-16']);
  console.log('\n修改后查询 (yuntinan, old, old_api):');
  console.log(`  返回 ${test2.length} 条记录`);
  if (test2.length > 0) {
    test2.forEach(r => {
      console.log(`    - ${r.source} | ${r.t_number} | ${r.work_date}`);
    });
  }
  
  console.log('\n========================================\n');
  
  await c.end();
})();
