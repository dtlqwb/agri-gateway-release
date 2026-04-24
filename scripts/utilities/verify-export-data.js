require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 验证导出查询结果 ==========\n');
  
  const [records] = await c.execute(`
    SELECT wr.source, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre,0)=0 THEN COALESCE(ok_acre,0) ELSE acre END) as total_acre 
    FROM work_records wr 
    WHERE wr.source IN ('yuntinan','old','old_api') 
      AND wr.work_date >= ? 
      AND wr.work_date <= ? 
    GROUP BY wr.source
  `, ['2026-04-10', '2026-04-16']);
  
  console.log('导出数据分布 (2026-04-10 至 2026-04-16):');
  records.forEach(r => {
    const sourceName = r.source === 'yuntinan' ? '云途安' : 
                       r.source === 'old_api' ? '旧供应商(API)' : '旧供应商';
    console.log(`  ${sourceName} (${r.source}): ${r.count} 条, ${parseFloat(r.total_acre).toFixed(2)} 亩`);
  });
  
  const totalRecords = records.reduce((sum, r) => sum + parseInt(r.count), 0);
  const totalAcre = records.reduce((sum, r) => sum + parseFloat(r.total_acre), 0);
  
  console.log(`\n总计: ${totalRecords} 条记录, ${totalAcre.toFixed(2)} 亩`);
  
  // 检查是否有旧设备数据
  const oldApiRecord = records.find(r => r.source === 'old_api');
  if (oldApiRecord && parseInt(oldApiRecord.count) > 0) {
    console.log('\n✅ 确认: 导出数据中包含旧设备数据!');
    console.log(`   - 旧供应商(API): ${oldApiRecord.count} 条记录`);
  } else {
    console.log('\n❌ 警告: 导出数据中未找到旧设备数据!');
  }
  
  console.log('\n========================================\n');
  
  await c.end();
})();
