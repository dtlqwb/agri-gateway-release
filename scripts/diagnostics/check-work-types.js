require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 旧供应商作业类型分析 ===\n');
  
  // 1. 检查所有 work_type_name
  console.log('📊 1. 所有作业类型分布');
  console.log('-------------------------------------------');
  
  const byTypeName = await db.queryAll(`
    SELECT work_type_name, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY work_type_name
    ORDER BY total_acre DESC
  `);
  
  byTypeName.forEach(row => {
    console.log(`  ${row.work_type_name || '(空)'}: ${row.count} 条, ${row.total_acre} 亩`);
  });
  
  const totalAcre1 = byTypeName.reduce((sum, r) => sum + parseFloat(r.total_acre || 0), 0);
  console.log(`\n  总计: ${totalAcre1.toFixed(2)} 亩\n`);
  
  // 2. 检查 work_type 字段
  console.log('📊 2. work_type 代码分布');
  console.log('-------------------------------------------');
  
  const byTypeCode = await db.queryAll(`
    SELECT work_type, work_type_name, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY work_type, work_type_name
    ORDER BY work_type
  `);
  
  byTypeCode.forEach(row => {
    console.log(`  ${row.work_type || '(空)'} - ${row.work_type_name || '(空)'}: ${row.count} 条, ${row.total_acre} 亩`);
  });
  console.log('');
  
  // 3. 检查 old_supplier_devices 表中的作业类型
  console.log('📊 3. old_supplier_devices 表中的作业类型');
  console.log('-------------------------------------------');
  
  const deviceTypes = await db.queryAll(`
    SELECT work_type_name, COUNT(*) as count
    FROM old_supplier_devices
    GROUP BY work_type_name
    ORDER BY count DESC
  `);
  
  deviceTypes.forEach(row => {
    console.log(`  ${row.work_type_name || '(空)'}: ${row.count} 台设备`);
  });
  console.log('');
  
  // 4. 检查是否有"其他"类型的数据
  console.log('📊 4. "其他"类型详细数据');
  console.log('-------------------------------------------');
  
  const otherData = await db.queryAll(`
    SELECT t_number, org_name, work_type_name, acre, work_date
    FROM work_records 
    WHERE source = 'old_api' AND (work_type_name = '其他' OR work_type_name = '' OR work_type_name IS NULL)
    LIMIT 10
  `);
  
  if (otherData.length > 0) {
    console.log(`  找到 ${otherData.length} 条"其他"类型的记录:`);
    otherData.forEach(row => {
      console.log(`    ${row.t_number} | ${row.org_name} | ${row.work_type_name || '(空)'} | ${row.acre} 亩 | ${row.work_date}`);
    });
  } else {
    console.log('  ✅ 没有"其他"类型的记录');
  }
  console.log('');
  
  console.log('=== 分析完成 ===\n');
  
  process.exit(0);
})();
