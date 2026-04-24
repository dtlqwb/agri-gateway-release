require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  const result = await db.queryOne(`
    SELECT t_number, ANY_VALUE(org_name) as org_name, COUNT(*) as cnt, SUM(acre) as total 
    FROM work_records 
    WHERE source = 'old_api' AND (org_name = '' OR org_name IS NULL) 
    GROUP BY t_number
  `);
  
  console.log('\n未关联合作社的设备:');
  console.log(result);
  console.log('');
  
  // 检查这台设备在 old_supplier_devices 表中的信息
  const deviceInfo = await db.queryOne(`
    SELECT macid, cooperative_name, driver_name, work_type_name
    FROM old_supplier_devices
    WHERE macid = '47072668048'
  `);
  
  console.log('设备 47072668048 的详细信息:');
  console.log(deviceInfo);
  console.log('');
  
  process.exit(0);
})();
