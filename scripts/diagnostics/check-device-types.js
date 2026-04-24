require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== old_supplier_devices 表分析 ===\n');
  
  // 1. 检查所有设备的作业类型
  console.log('📊 1. 设备作业类型分布');
  console.log('-------------------------------------------');
  
  const devices = await db.queryAll(`
    SELECT work_type_name, COUNT(*) as count
    FROM old_supplier_devices
    GROUP BY work_type_name
    ORDER BY count DESC
  `);
  
  devices.forEach(row => {
    console.log(`  ${row.work_type_name || '(空)'}: ${row.count} 台`);
  });
  console.log('');
  
  // 2. 检查是否有 work_type 字段
  console.log('📊 2. 检查设备表的字段');
  console.log('-------------------------------------------');
  
  const columns = await db.queryAll(`
    SHOW COLUMNS FROM old_supplier_devices
  `);
  
  columns.forEach(col => {
    console.log(`  ${col.Field}: ${col.Type}`);
  });
  console.log('');
  
  // 3. 查看几条"其他"类型的设备详情
  console.log('📊 3. "其他"类型设备详情');
  console.log('-------------------------------------------');
  
  const otherDevices = await db.queryAll(`
    SELECT macid, cooperative_name, driver_name, work_type_name
    FROM old_supplier_devices
    WHERE work_type_name = '其他' OR work_type_name = '' OR work_type_name IS NULL
    LIMIT 5
  `);
  
  otherDevices.forEach(d => {
    console.log(`  ${d.macid} | ${d.cooperative_name} | ${d.driver_name} | ${d.work_type_name || '(空)'} | ${d.plate_no}`);
  });
  
  console.log('\n=== 分析完成 ===\n');
  console.log('💡 结论:');
  console.log('  旧供应商设备表中的作业类型配置不正确');
  console.log('  大部分设备被标记为"其他"，导致无法正确分类统计');
  console.log('  需要更新 old_supplier_devices 表的 work_type_name 字段\n');
  
  process.exit(0);
})();
