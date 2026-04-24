require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 检查设备号 863998043860478 ===\n');
  
  // 1. 检查是否在 machines 表中
  const inMachines = await db.queryOne(`
    SELECT * FROM machines WHERE t_number = '863998043860478'
  `);
  
  console.log('📊 在 machines 表中:', inMachines ? '✅ 存在' : '❌ 不存在');
  if (inMachines) {
    console.log('   ', inMachines);
  }
  console.log('');
  
  // 2. 检查是否在 work_records 中有数据
  const inRecords = await db.queryOne(`
    SELECT COUNT(*) as count, SUM(acre) as total_acre
    FROM work_records 
    WHERE t_number = '863998043860478'
  `);
  
  console.log('📊 在 work_records 中:');
  console.log('   记录数:', inRecords.count);
  console.log('   总面积:', inRecords.total_acre || 0, '亩');
  console.log('');
  
  // 3. 如果不在 machines 表中，添加它
  if (!inMachines && inRecords.count > 0) {
    console.log('🔧 正在添加到 machines 表...');
    
    await db.runSql(`
      INSERT INTO machines (t_number, source, plate_no, org_name, org_id, created_at, updated_at)
      VALUES ('863998043860478', 'yuntinan', '', '', '', NOW(), NOW())
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `);
    
    console.log('✅ 已添加设备 863998043860478 到 machines 表\n');
  } else if (inMachines) {
    console.log('ℹ️  设备已存在，无需添加\n');
  } else {
    console.log('ℹ️  该设备在 work_records 中没有数据，跳过添加\n');
  }
  
  // 4. 验证结果
  const verify = await db.queryOne(`
    SELECT * FROM machines WHERE t_number = '863998043860478'
  `);
  
  console.log('📊 最终状态:', verify ? '✅ 已在 machines 表中' : '❌ 仍不在 machines 表中');
  console.log('');
  
  process.exit(0);
})();
