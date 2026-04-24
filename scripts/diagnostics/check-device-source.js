require('dotenv').config();
const db = require('../../services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 检查旧供应商设备数据来源 ===\n');
  
  // 1. 统计设备数量
  const count = await db.queryOne(`
    SELECT COUNT(*) as total FROM old_supplier_devices
  `);
  
  console.log('📊 old_supplier_devices 表中的设备总数:', count.total);
  console.log('');
  
  // 2. 查看前10条设备数据
  const devices = await db.queryAll(`
    SELECT macid, cooperative_name, driver_name, work_type_name, created_at
    FROM old_supplier_devices
    ORDER BY created_at ASC
    LIMIT 10
  `);
  
  console.log('📋 前10条设备记录（按创建时间排序）:');
  devices.forEach((device, index) => {
    console.log(`  ${index + 1}. ${device.macid}`);
    console.log(`     合作社: ${device.cooperative_name || '(空)'}`);
    console.log(`     机手: ${device.driver_name || '(空)'}`);
    console.log(`     作业类型: ${device.work_type_name || '(空)'}`);
    console.log(`     创建时间: ${device.created_at}`);
    console.log('');
  });
  
  // 3. 检查是否有来自不同导入源的设备
  const sourceCheck = await db.queryAll(`
    SELECT 
      COUNT(*) as count,
      MIN(created_at) as first_import,
      MAX(created_at) as last_import
    FROM old_supplier_devices
  `);
  
  console.log('📅 导入时间范围:');
  console.log(`  最早导入: ${sourceCheck[0].first_import}`);
  console.log(`  最晚导入: ${sourceCheck[0].last_import}`);
  console.log(`  总记录数: ${sourceCheck[0].count}`);
  console.log('');
  
  // 4. 对比CSV文件
  const fs = require('fs');
  const path = require('path');
  
  const csvFile1 = path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv');
  
  if (fs.existsSync(csvFile1)) {
    const content = fs.readFileSync(csvFile1, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    console.log('📄 CSV文件统计:');
    console.log(`  文件: templates/旧供应商终端映射表.csv`);
    console.log(`  行数: ${lines.length - 1} (不含表头)`);
    console.log('');
    
    // 显示CSV前5条
    console.log('📋 CSV文件前5条记录:');
    for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
      console.log(`  ${i}. ${lines[i]}`);
    }
    console.log('');
  }
  
  // 5. 检查是否有"终端映射表_清理版.csv"
  const csvFile2 = path.join(__dirname, '..', '终端映射表_清理版.csv');
  if (fs.existsSync(csvFile2)) {
    console.log('⚠️  发现文件: 终端映射表_清理版.csv (在根目录)');
    const content = fs.readFileSync(csvFile2, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    console.log(`  行数: ${lines.length - 1} (不含表头)`);
  } else {
    console.log('ℹ️  未找到: 终端映射表_清理版.csv');
  }
  console.log('');
  
  console.log('✅ 检查完成\n');
  
  process.exit(0);
})();
