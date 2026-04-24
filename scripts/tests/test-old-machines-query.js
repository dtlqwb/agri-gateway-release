require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  console.log('\n=== 测试旧设备查询 ===\n');
  
  const [r] = await c.execute(`
    SELECT 
      COALESCE(dm.old_t_number, osd.macid) as t_number,
      COALESCE(dm.plate_no, '') as plate_no,
      COALESCE(dm.driver_name, osd.driver_name, '') as driver_name,
      COALESCE(dm.org_name, osd.cooperative_name, '') as org_name,
      '其他' as machine_type,
      COALESCE(wr.year_acre, 0) as year_acre,
      COALESCE(wr.record_count, 0) as record_count,
      osd.updated_at
    FROM old_supplier_devices osd
    LEFT JOIN device_mapping dm ON dm.old_t_number = osd.macid
    LEFT JOIN (
      SELECT t_number, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as year_acre,
             COUNT(*) as record_count
      FROM work_records
      WHERE source = 'old' OR source = 'old_api'
      GROUP BY t_number
    ) wr ON wr.t_number = osd.macid
    ORDER BY osd.cooperative_name, osd.macid
    LIMIT 3
  `);

  console.log('Result:', JSON.stringify(r, null, 2));
  console.log(`\nTotal rows: ${r.length}`);
  
  await c.end();
})();
