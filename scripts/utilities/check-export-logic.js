require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 检查api_raw_records表 ==========\n');
  
  const [apiCount] = await c.execute(
    'SELECT source, COUNT(*) as count FROM api_raw_records WHERE status=1 GROUP BY source'
  );
  console.log('已修复记录分布:');
  apiCount.forEach(r => console.log(`  ${r.source}: ${r.count} 条`));
  
  console.log('\n========== 检查work_records表 ==========\n');
  
  const [wrCount] = await c.execute(
    'SELECT source, COUNT(*) as count FROM work_records WHERE work_date >= ? AND work_date <= ? GROUP BY source',
    ['2026-04-10', '2026-04-16']
  );
  console.log('原始记录分布 (4/10-4/16):');
  wrCount.forEach(r => console.log(`  ${r.source}: ${r.count} 条`));
  
  console.log('\n========== 测试当前导出逻辑 ==========\n');
  
  // 模拟当前的NOT EXISTS逻辑
  const currentSql = `
    SELECT wr.source, COUNT(*) as count
    FROM work_records wr
    WHERE wr.source IN ('yuntinan', 'old', 'old_api')
      AND wr.work_date >= ?
      AND wr.work_date <= ?
      AND NOT EXISTS (
        SELECT 1 FROM api_raw_records ar
        WHERE ar.api_t_number = wr.t_number
          AND ar.api_work_date = wr.work_date
          AND ar.api_work_type_name = wr.work_type_name
          AND ar.source = wr.source
          AND ar.status = 1
      )
    GROUP BY wr.source
  `;
  
  const [currentResult] = await c.execute(currentSql, ['2026-04-10', '2026-04-16']);
  console.log('当前逻辑（排除已修复）:');
  currentResult.forEach(r => console.log(`  ${r.source}: ${r.count} 条`));
  
  // 不使用NOT EXISTS
  const simpleSql = `
    SELECT wr.source, COUNT(*) as count
    FROM work_records wr
    WHERE wr.source IN ('yuntinan', 'old', 'old_api')
      AND wr.work_date >= ?
      AND wr.work_date <= ?
    GROUP BY wr.source
  `;
  
  const [simpleResult] = await c.execute(simpleSql, ['2026-04-10', '2026-04-16']);
  console.log('\n简单查询（不排除）:');
  simpleResult.forEach(r => console.log(`  ${r.source}: ${r.count} 条`));
  
  console.log('\n========================================\n');
  
  await c.end();
})();
