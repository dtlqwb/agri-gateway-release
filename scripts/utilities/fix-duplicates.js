/**
 * 修复重复记录和设备关联问题
 */

require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 修复数据问题 ===\n');
  
  // 1. 删除重复记录，保留最早插入的
  console.log('🔧 步骤1: 删除重复记录');
  console.log('-------------------------------------------');
  
  // 找出重复的记录
  const duplicates = await db.queryAll(`
    SELECT t_number, work_date, MIN(id) as keep_id, COUNT(*) as cnt
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY t_number, work_date
    HAVING cnt > 1
  `);
  
  console.log(`  发现 ${duplicates.length} 组重复记录\n`);
  
  let deletedCount = 0;
  
  for (const dup of duplicates) {
    // 删除重复的记录（保留id最小的那条）
    const result = await db.runSql(
      `DELETE FROM work_records 
       WHERE source = 'old_api' 
         AND t_number = ? 
         AND work_date = ? 
         AND id > ?`,
      [dup.t_number, dup.work_date, dup.keep_id]
    );
    deletedCount += result.affectedRows || 0;
  }
  
  console.log(`  ✅ 已删除 ${deletedCount} 条重复记录\n`);
  
  // 2. 修复未关联合作社的设备
  console.log('🔧 步骤2: 修复未关联合作社的设备');
  console.log('-------------------------------------------');
  
  // 检查 old_supplier_devices 表中该设备的合作社信息
  const deviceInfo = await db.queryOne(`
    SELECT macid, cooperative_name, driver_name 
    FROM old_supplier_devices 
    WHERE macid = '47072668048'
  `);
  
  if (deviceInfo && deviceInfo.cooperative_name) {
    console.log(`  设备 47072668048 的合作社: ${deviceInfo.cooperative_name}`);
    
    // 更新 work_records 中的合作社信息
    // 首先查找合作社的org_id
    const orgInfo = await db.queryOne(`
      SELECT id, name FROM organizations WHERE name = ?
    `, [deviceInfo.cooperative_name]);
    
    if (orgInfo) {
      await db.runSql(`
        UPDATE work_records 
        SET org_id = ?, org_name = ?
        WHERE source = 'old_api' AND t_number = '47072668048'
      `, [orgInfo.id, orgInfo.name]);
      console.log(`  ✅ 已更新合作社: ${orgInfo.name} (ID: ${orgInfo.id})`);
    } else {
      console.log(`  ⚠️  合作社 "${deviceInfo.cooperative_name}" 在 organizations 表中不存在`);
    }
  } else {
    console.log(`  ⚠️  设备 47072668048 在 old_supplier_devices 表中没有合作社信息`);
  }
  console.log('');
  
  // 3. 验证修复结果
  console.log('📊 步骤3: 验证修复结果');
  console.log('-------------------------------------------');
  
  // 检查是否还有重复记录
  const remainingDups = await db.queryOne(`
    SELECT COUNT(*) as dup_groups
    FROM (
      SELECT t_number, work_date
      FROM work_records 
      WHERE source = 'old_api'
      GROUP BY t_number, work_date
      HAVING COUNT(*) > 1
    ) as dup
  `);
  console.log(`  剩余重复组数: ${remainingDups.dup_groups}`);
  
  // 检查未关联合作社的设备
  const noOrgCount = await db.queryOne(`
    SELECT COUNT(DISTINCT t_number) as count
    FROM work_records 
    WHERE source = 'old_api' 
      AND (org_name = '' OR org_name IS NULL)
  `);
  console.log(`  未关联合作社设备数: ${noOrgCount.count}`);
  
  // 统计最终数据
  const finalStat = await db.queryOne(`
    SELECT COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api'
  `);
  console.log(`  最终记录数: ${finalStat.count} 条`);
  console.log(`  最终总面积: ${finalStat.total_acre} 亩`);
  console.log('');
  
  console.log('=== 修复完成 ===\n');
  
  process.exit(0);
})();
