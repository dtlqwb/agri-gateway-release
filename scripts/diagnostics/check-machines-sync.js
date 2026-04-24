require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 检查 machines 表中的旧供应商设备 ===\n');
  
  // 统计总数
  const totalResult = await db.queryOne(
    "SELECT COUNT(*) as count FROM machines WHERE source IN ('old', 'old_api')"
  );
  console.log('machines表中旧供应商设备总数:', totalResult.count);
  
  // 按source分组统计
  const bySource = await db.queryAll(
    "SELECT source, COUNT(*) as count FROM machines WHERE source IN ('old', 'old_api') GROUP BY source"
  );
  console.log('\n按数据源分组:');
  bySource.forEach(row => {
    console.log(`  ${row.source}: ${row.count} 台`);
  });
  
  // 检查那20台缺失的设备
  const missingDevices = await db.queryAll(`
    SELECT wr.t_number, wr.org_name, wr.source
    FROM work_records wr
    WHERE wr.source IN ('old', 'old_api')
      AND wr.t_number NOT IN (SELECT t_number FROM machines WHERE source IN ('old', 'old_api'))
    GROUP BY wr.t_number, wr.org_name, wr.source
  `);
  
  console.log(`\n在work_records中但不在machines表中的设备数: ${missingDevices.length}`);
  if (missingDevices.length > 0) {
    console.log('\n缺失设备列表:');
    missingDevices.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.t_number} (${d.source}) - ${d.org_name}`);
    });
  } else {
    console.log('✅ 所有设备都已同步到machines表');
  }
  
  process.exit(0);
})();
