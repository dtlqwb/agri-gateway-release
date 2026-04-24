/**
 * 添加缺失的旧供应商设备并同步历史数据
 */

require('dotenv').config();
const oldSupplierService = require('../services/oldSupplierService');
const db = require('../services/db');

// 缺失的4台设备（需要手动填写合作社和机手信息）
const missingDevices = [
  { macid: '47072668048', cooperative_name: '', driver_name: '' },
  { macid: '17070928196', cooperative_name: '', driver_name: '' },
  { macid: '17070928634', cooperative_name: '', driver_name: '' },
  { macid: '47072668642', cooperative_name: '', driver_name: '' }
];

async function main() {
  console.log('\n========================================');
  console.log('  添加缺失设备并同步数据');
  console.log('========================================\n');
  
  await db.init();
  console.log('[DB] 数据库连接成功\n');
  
  try {
    // 1. 添加缺失的设备到 old_supplier_devices 表
    console.log('📊 步骤1: 添加缺失设备');
    console.log('-------------------------------------------');
    
    for (const device of missingDevices) {
      // 检查是否已存在
      const exists = await db.queryOne(
        'SELECT id FROM old_supplier_devices WHERE macid = ?',
        [device.macid]
      );
      
      if (exists) {
        console.log(`  ⏭️  ${device.macid} 已存在，跳过`);
      } else {
        // 插入新设备
        await db.runSql(
          `INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name, created_at, updated_at)
           VALUES (?, ?, ?, '其他', NOW(), NOW())`,
          [device.macid, device.cooperative_name || '', device.driver_name || '']
        );
        console.log(`  ✅ ${device.macid} 已添加`);
      }
    }
    
    console.log('');
    
    // 2. 获取这些设备的历史数据
    console.log('📊 步骤2: 同步历史数据（2026-01-01 至 2026-04-23）');
    console.log('-------------------------------------------');
    
    const startDate = '2026-01-01';
    const endDate = '2026-04-23';
    
    // 单独同步这4台设备
    let totalAcre = 0;
    let totalRecords = 0;
    
    for (const device of missingDevices) {
      console.log(`\n  同步设备: ${device.macid}`);
      
      // 遍历每一天
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        
        try {
          const result = await oldSupplierService.getAreaData(device.macid, dateStr);
          const area = oldSupplierService.parseAreaResult(result);
          
          if (area > 0) {
            // 插入数据
            await db.runSql(
              `INSERT INTO work_records 
               (t_number, work_date, work_type_name, acre, ok_acre, source, created_at, updated_at)
               VALUES (?, ?, '其他', ?, 0, 'old_api', NOW(), NOW())
               ON DUPLICATE KEY UPDATE 
               acre = VALUES(acre),
               ok_acre = VALUES(ok_acre),
               work_type_name = VALUES(work_type_name),
               updated_at = NOW()`,
              [device.macid, dateStr, area]
            );
            totalAcre += area;
            totalRecords++;
          }
        } catch (error) {
          // 忽略错误，继续下一个
        }
      }
      
      console.log(`    完成: ${device.macid}`);
    }
    
    console.log('');
    console.log('========================================');
    console.log('  同步完成');
    console.log('========================================\n');
    console.log(`新增记录: ${totalRecords} 条`);
    console.log(`新增面积: ${totalAcre.toFixed(2)} 亩`);
    console.log('');
    
    // 3. 显示最终统计
    console.log('📊 最终统计');
    console.log('-------------------------------------------');
    
    const stat = await db.queryOne(`
      SELECT COUNT(*) as count, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
      FROM work_records 
      WHERE source = 'old_api'
    `);
    
    console.log(`  总记录数: ${stat.count} 条`);
    console.log(`  总面积:   ${stat.total_acre} 亩`);
    console.log('');
    
  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
