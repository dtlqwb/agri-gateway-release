/**
 * 数据一致性检查和修复工具
 * 通过重新从API获取数据来确保本地和服务器数据一致
 */

require('dotenv').config();
const db = require('../services/db');
const yunTinanService = require('../services/yunTinanService');
const oldSupplierService = require('../services/oldSupplierService');

(async () => {
  await db.init();
  
  console.log('\n=== 数据一致性检查与修复 ===\n');
  
  // 1. 检查当前数据统计
  console.log('📊 步骤1: 检查当前数据状态');
  console.log('-------------------------------------------');
  
  const currentStats = await db.queryOne(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN source = 'yuntinan' THEN 1 ELSE 0 END) as yuntinan_records,
      SUM(CASE WHEN source = 'old_api' THEN 1 ELSE 0 END) as old_api_records,
      SUM(CASE WHEN source = 'yuntinan' THEN acre ELSE 0 END) as yuntinan_acre,
      SUM(CASE WHEN source = 'old_api' THEN acre ELSE 0 END) as old_api_acre
    FROM work_records
  `);
  
  console.log(`  总记录数: ${currentStats.total_records}`);
  console.log(`  云途安: ${currentStats.yuntinan_records} 条, ${currentStats.yuntinan_acre} 亩`);
  console.log(`  旧供应商: ${currentStats.old_api_records} 条, ${currentStats.old_api_acre} 亩`);
  console.log('');
  
  // 2. 重新同步云途安数据
  console.log('🔄 步骤2: 重新同步云途安数据');
  console.log('-------------------------------------------');
  
  try {
    console.log('  正在登录云途安...');
    await yunTinanService.login();
    
    console.log('  正在执行全量同步...');
    const result = await yunTinanService.syncAllWorkRecords();
    
    console.log(`  ✅ 云途安同步完成:`);
    console.log(`     新增: ${result.inserted || 0} 条`);
    console.log(`     更新: ${result.updated || 0} 条`);
    console.log(`     总计: ${result.total || 0} 条`);
  } catch (error) {
    console.error('  ❌ 云途安同步失败:', error.message);
  }
  console.log('');
  
  // 3. 重新同步旧供应商数据（最近30天）
  console.log('🔄 步骤3: 重新同步旧供应商数据（最近30天）');
  console.log('-------------------------------------------');
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`  同步日期范围: ${startDateStr} 至 ${endDateStr}`);
    
    const results = await oldSupplierService.syncDateRange(startDateStr, endDateStr);
    
    const successCount = results.filter(r => r.success).length;
    const totalAcre = results.filter(r => r.success).reduce((sum, r) => sum + (r.totalAcre || 0), 0);
    
    console.log(`  ✅ 旧供应商同步完成:`);
    console.log(`     成功天数: ${successCount}/${results.length}`);
    console.log(`     总面积: ${totalAcre} 亩`);
  } catch (error) {
    console.error('  ❌ 旧供应商同步失败:', error.message);
  }
  console.log('');
  
  // 4. 验证同步结果
  console.log('📊 步骤4: 验证同步结果');
  console.log('-------------------------------------------');
  
  const newStats = await db.queryOne(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN source = 'yuntinan' THEN 1 ELSE 0 END) as yuntinan_records,
      SUM(CASE WHEN source = 'old_api' THEN 1 ELSE 0 END) as old_api_records,
      SUM(CASE WHEN source = 'yuntinan' THEN acre ELSE 0 END) as yuntinan_acre,
      SUM(CASE WHEN source = 'old_api' THEN acre ELSE 0 END) as old_api_acre
    FROM work_records
  `);
  
  console.log(`  总记录数: ${newStats.total_records}`);
  console.log(`  云途安: ${newStats.yuntinan_records} 条, ${newStats.yuntinan_acre} 亩`);
  console.log(`  旧供应商: ${newStats.old_api_records} 条, ${newStats.old_api_acre} 亩`);
  console.log('');
  
  // 5. 对比变化
  console.log('📈 步骤5: 数据变化对比');
  console.log('-------------------------------------------');
  
  const recordDiff = newStats.total_records - currentStats.total_records;
  const ytAcreDiff = parseFloat(newStats.yuntinan_acre) - parseFloat(currentStats.yuntinan_acre);
  const oldAcreDiff = parseFloat(newStats.old_api_acre) - parseFloat(currentStats.old_api_acre);
  
  console.log(`  记录数变化: ${recordDiff > 0 ? '+' : ''}${recordDiff}`);
  console.log(`  云途安面积变化: ${ytAcreDiff > 0 ? '+' : ''}${ytAcreDiff.toFixed(2)} 亩`);
  console.log(`  旧供应商面积变化: ${oldAcreDiff > 0 ? '+' : ''}${oldAcreDiff.toFixed(2)} 亩`);
  console.log('');
  
  console.log('✅ 数据一致性检查和修复完成！\n');
  
  process.exit(0);
})();
