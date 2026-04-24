require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n========== 模拟前端导出请求 ==========\n');
  
  // 模拟前端传递的参数：sources=yuntinan,old,old_api
  const sources = ['yuntinan', 'old', 'old_api'];
  const startDate = '2026-04-10';
  const endDate = '2026-04-16';
  
  console.log('请求参数:');
  console.log(`  sources: ${sources.join(',')}`);
  console.log(`  startDate: ${startDate}`);
  console.log(`  endDate: ${endDate}`);
  
  // 执行查询
  const sql = `
    SELECT 
      wr.t_number,
      wr.work_date,
      wr.work_type_name,
      wr.acre,
      wr.ok_acre,
      wr.plate_no,
      wr.driver_name,
      wr.org_name,
      wr.source,
      '原始' as data_status,
      '' as remark,
      wr.created_at as updated_at
    FROM work_records wr
    WHERE wr.source IN (${sources.map(() => '?').join(',')})
      AND wr.work_date >= ?
      AND wr.work_date <= ?
    ORDER BY wr.work_date DESC, wr.org_name
  `;
  
  const params = [...sources, startDate, endDate];
  const [records] = await c.execute(sql, params);
  
  console.log(`\n查询结果: ${records.length} 条记录\n`);
  
  // 按source分组统计
  const grouped = {};
  records.forEach(r => {
    if (!grouped[r.source]) {
      grouped[r.source] = { count: 0, totalAcre: 0 };
    }
    grouped[r.source].count++;
    grouped[r.source].totalAcre += parseFloat(r.acre || 0);
  });
  
  console.log('数据分布:');
  Object.entries(grouped).forEach(([source, stats]) => {
    const sourceName = source === 'yuntinan' ? '云途安' : 
                       source === 'old_api' ? '旧供应商(API)' : '旧供应商';
    console.log(`  ${sourceName} (${source}): ${stats.count} 条, ${stats.totalAcre.toFixed(2)} 亩`);
  });
  
  const totalRecords = records.length;
  const totalAcre = records.reduce((sum, r) => sum + parseFloat(r.acre || 0), 0);
  
  console.log(`\n总计: ${totalRecords} 条记录, ${totalAcre.toFixed(2)} 亩`);
  
  // 检查是否包含旧设备
  const hasOldDevices = grouped['old_api'] || grouped['old'];
  if (hasOldDevices) {
    console.log('\n✅ 确认: 导出数据中包含旧设备数据!');
    if (grouped['old_api']) {
      console.log(`   - 旧供应商(API): ${grouped['old_api'].count} 条记录`);
    }
    if (grouped['old']) {
      console.log(`   - 旧供应商(CSV): ${grouped['old'].count} 条记录`);
    }
  } else {
    console.log('\n❌ 警告: 导出数据中未找到旧设备数据!');
  }
  
  // 显示前5条旧设备记录
  const oldRecords = records.filter(r => r.source === 'old_api' || r.source === 'old');
  if (oldRecords.length > 0) {
    console.log('\n旧设备示例（前5条）:');
    oldRecords.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i+1}. ${r.t_number} | ${r.work_date} | ${r.acre}亩 | ${r.org_name}`);
    });
  }
  
  console.log('\n========================================\n');
  
  await c.end();
})();
