require('dotenv').config();
const db = require('./services/db');

// 用户提供的设备列表
const userDevices = [
  '17075270727', '17075270453', '17070928642', '17070928626',
  '17070928618', '17070928485', '17070928436', '17070928410',
  '17070928386', '17070928345', '17070928295', '17070928253',
  '17070928204', '17070928170', '17070928162', '16052696013',
  '17075270610', '47072668048', '17075127869', '17075127315',
  '17070928311', '17075270487', '17070928196', '47072666406',
  '17070928451', '17070928238', '17070928535', '17070928352',
  '17070928212', '17070928501', '17070928402', '17070928287',
  '17070928634', '17070928600', '17070928337', '17070928303',
  '17070928154', '17070928493', '17070928550', '17070928378',
  '17070928329', '17070928311', '17070928279', '17070928261',
  '17070928246', '17070928188', '47072668642', '47072668303',
  '47072668295', '47072668089', '47072667909', '47072667560',
  '47072667545', '47072667339', '47072667081', '47072666935',
  '47072666455', '47072666448', '47072666307', '47072667503',
  '47072667396', '47072667230', '47072667214', '47072666851',
  '47072666745', '47072666729', '47072666695', '47072666653',
  '47072666646', '47072666638', '47072666620', '47072666554',
  '47072666497', '47072666489', '47072666471', '47072666463',
  '47072666414', '47072666281'
];

(async () => {
  await db.init();
  
  console.log('\n=== 检查用户提供的设备列表 ===\n');
  console.log(`用户提供的设备数量: ${userDevices.length} 台\n`);
  
  // 去重
  const uniqueDevices = [...new Set(userDevices)];
  console.log(`去重后: ${uniqueDevices.length} 台\n`);
  
  // 1. 检查这些设备是否在 old_supplier_devices 表中
  console.log('📊 1. 检查设备是否在数据库中');
  console.log('-------------------------------------------');
  
  const placeholders = uniqueDevices.map(() => '?').join(',');
  const dbDevices = await db.queryAll(`
    SELECT macid, cooperative_name, driver_name, work_type_name
    FROM old_supplier_devices
    WHERE macid IN (${placeholders})
  `, uniqueDevices);
  
  console.log(`  数据库中找到的设备: ${dbDevices.length} 台`);
  console.log(`  数据库中未找到的设备: ${uniqueDevices.length - dbDevices.length} 台\n`);
  
  if (dbDevices.length < uniqueDevices.length) {
    console.log('❌ 以下设备不在 old_supplier_devices 表中:');
    const dbMacids = dbDevices.map(d => d.macid);
    const missingDevices = uniqueDevices.filter(m => !dbMacids.includes(m));
    missingDevices.forEach(m => {
      console.log(`    - ${m}`);
    });
    console.log('');
    console.log('💡 需要先将这些设备添加到 old_supplier_devices 表');
  } else {
    console.log('✅ 所有设备都在数据库中\n');
  }
  
  // 2. 检查这些设备在 work_records 中有多少数据
  console.log('📊 2. 检查 work_records 中的数据');
  console.log('-------------------------------------------');
  
  const workRecordsStat = await db.queryOne(`
    SELECT COUNT(*) as count,
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api' AND t_number IN (${placeholders})
  `, uniqueDevices);
  
  console.log(`  记录数: ${workRecordsStat.count} 条`);
  console.log(`  总面积: ${workRecordsStat.total_acre} 亩\n`);
  
  // 3. 按设备统计
  console.log('📊 3. 按设备统计（前10个）');
  console.log('-------------------------------------------');
  
  const byDevice = await db.queryAll(`
    SELECT t_number, COUNT(*) as count,
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api' AND t_number IN (${placeholders})
    GROUP BY t_number
    ORDER BY total_acre DESC
    LIMIT 10
  `, uniqueDevices);
  
  byDevice.forEach(row => {
    console.log(`  ${row.t_number}: ${row.count} 条, ${row.total_acre} 亩`);
  });
  
  console.log('\n=== 检查完成 ===\n');
  
  process.exit(0);
})();
