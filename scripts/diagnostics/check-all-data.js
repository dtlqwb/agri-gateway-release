require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 全面数据检查 ===\n');
  
  // 1. 检查所有可能的旧供应商相关表
  console.log('📊 1. 检查所有表中的旧供应商数据');
  console.log('-------------------------------------------');
  
  // work_records 表
  const workRecordsStat = await db.queryOne(`
    SELECT COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source IN ('old', 'old_api')
  `);
  console.log(`  work_records (old + old_api): ${workRecordsStat.count} 条, ${workRecordsStat.total_acre} 亩`);
  
  // 单独检查 old 和 old_api
  const oldStat = await db.queryOne(`
    SELECT COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old'
  `);
  console.log(`    - source='old': ${oldStat.count} 条, ${oldStat.total_acre} 亩`);
  
  const oldApiStat = await db.queryOne(`
    SELECT COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api'
  `);
  console.log(`    - source='old_api': ${oldApiStat.count} 条, ${oldApiStat.total_acre} 亩`);
  console.log('');
  
  // 2. 检查 machines 表
  console.log('📊 2. machines 表统计');
  console.log('-------------------------------------------');
  
  const machinesStat = await db.queryOne(`
    SELECT COUNT(*) as count, 
           SUM(year_acre) as total_acre
    FROM machines 
    WHERE source = 'old'
  `);
  console.log(`  machines (source='old'): ${machinesStat.count} 台, ${machinesStat.total_acre} 亩`);
  console.log('');
  
  // 3. 检查 old_supplier_devices 表
  console.log('📊 3. old_supplier_devices 表');
  console.log('-------------------------------------------');
  
  const oldDevicesStat = await db.queryOne(`
    SELECT COUNT(*) as count
    FROM old_supplier_devices
  `);
  console.log(`  old_supplier_devices: ${oldDevicesStat.count} 台设备`);
  console.log('');
  
  // 4. 检查是否有 Excel 导入的历史数据
  console.log('📊 4. 检查 imports 表（Excel导入记录）');
  console.log('-------------------------------------------');
  
  const imports = await db.queryAll(`
    SELECT id, file_name, row_count, success_count, created_at
    FROM imports
    WHERE import_type LIKE '%旧%' OR import_type LIKE '%old%' OR file_name LIKE '%旧%'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  
  if (imports.length > 0) {
    console.log('  找到旧供应商相关的导入记录:');
    imports.forEach(imp => {
      console.log(`    ${imp.file_name}: ${imp.success_count}/${imp.row_count} 条, ${imp.created_at}`);
    });
  } else {
    console.log('  没有找到旧供应商相关的导入记录');
  }
  console.log('');
  
  // 5. 检查是否有其他 source 值
  console.log('📊 5. 所有可能的 source 值');
  console.log('-------------------------------------------');
  
  const allSources = await db.queryAll(`
    SELECT source, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    GROUP BY source
    ORDER BY total_acre DESC
  `);
  
  allSources.forEach(row => {
    console.log(`  ${row.source}: ${row.count} 条, ${row.total_acre} 亩`);
  });
  console.log('');
  
  // 6. 计算差异
  console.log('📊 6. 数据差异分析');
  console.log('-------------------------------------------');
  
  const expectedAcre = 15686.26;
  const actualAcre = parseFloat(workRecordsStat.total_acre || 0);
  const difference = expectedAcre - actualAcre;
  
  console.log(`  旧供应商网页显示: ${expectedAcre} 亩`);
  console.log(`  项目数据库统计:   ${actualAcre.toFixed(2)} 亩`);
  console.log(`  差异:             ${difference.toFixed(2)} 亩 ❌`);
  console.log(`  缺失比例:         ${((difference / expectedAcre) * 100).toFixed(1)}%`);
  console.log('');
  
  // 7. 检查是否有未同步的设备
  console.log('📊 7. 检查数据完整性');
  console.log('-------------------------------------------');
  
  // 检查 work_records 中是否有 acre 为 NULL 或异常值的记录
  const nullAcreCheck = await db.queryOne(`
    SELECT COUNT(*) as count
    FROM work_records 
    WHERE source IN ('old', 'old_api') 
      AND (acre IS NULL OR acre < 0)
  `);
  console.log(`  acre 为 NULL 或负数的记录: ${nullAcreCheck.count} 条`);
  
  // 检查是否有重复记录
  const duplicates = await db.queryOne(`
    SELECT COUNT(*) as duplicate_groups
    FROM (
      SELECT t_number, work_date, COUNT(*) as cnt
      FROM work_records 
      WHERE source IN ('old', 'old_api')
      GROUP BY t_number, work_date
      HAVING cnt > 1
    ) as dup
  `);
  console.log(`  重复记录组数: ${duplicates.duplicate_groups} 组`);
  
  console.log('\n=== 分析完成 ===\n');
  console.log('💡 建议:');
  console.log('  1. 检查旧供应商 API 是否还有未同步的历史数据');
  console.log('  2. 确认是否有 Excel 导入的数据未被计入');
  console.log('  3. 检查是否有其他数据源（如 CSV 文件）包含旧供应商数据');
  console.log('');
  
  process.exit(0);
})();
