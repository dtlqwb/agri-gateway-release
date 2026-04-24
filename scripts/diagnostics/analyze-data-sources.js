require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 详细数据源分析 ===\n');
  
  // 1. 检查 work_records 中所有旧供应商相关数据
  console.log('📊 1. work_records 表中的旧供应商数据');
  console.log('-------------------------------------------');
  
  const allOldRecords = await db.queryAll(`
    SELECT source, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source IN ('old', 'old_api')
    GROUP BY source
  `);
  
  allOldRecords.forEach(row => {
    console.log(`  ${row.source}: ${row.count} 条记录, ${row.total_acre} 亩`);
  });
  
  const totalOldAcre = allOldRecords.reduce((sum, r) => sum + parseFloat(r.total_acre || 0), 0);
  console.log(`  总计: ${totalOldAcre.toFixed(2)} 亩\n`);
  
  // 2. 检查是否有其他可能的数据源
  console.log('📊 2. 所有数据源统计');
  console.log('-------------------------------------------');
  
  const allSources = await db.queryAll(`
    SELECT source, COUNT(*) as count, 
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    GROUP BY source
    ORDER BY total_acre DESC
  `);
  
  allSources.forEach(row => {
    console.log(`  ${row.source}: ${row.count} 条记录, ${row.total_acre} 亩`);
  });
  console.log('');
  
  // 3. 检查是否有重复记录
  console.log('📊 3. 检查重复记录');
  console.log('-------------------------------------------');
  
  const duplicates = await db.queryAll(`
    SELECT t_number, work_date, work_type, work_type_name, COUNT(*) as cnt
    FROM work_records 
    WHERE source IN ('old', 'old_api')
    GROUP BY t_number, work_date, work_type, work_type_name
    HAVING cnt > 1
    LIMIT 10
  `);
  
  if (duplicates.length > 0) {
    console.log(`  ⚠️  发现 ${duplicates.length} 组重复记录:`);
    duplicates.forEach(d => {
      console.log(`    ${d.t_number} | ${d.work_date} | ${d.work_type_name} | 重复 ${d.cnt} 次`);
    });
  } else {
    console.log('  ✅ 没有发现重复记录');
  }
  console.log('');
  
  // 4. 检查 acre 和 ok_acre 的差异
  console.log('📊 4. acre vs ok_acre 对比');
  console.log('-------------------------------------------');
  
  const acreStats = await db.queryOne(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN acre = 0 THEN 1 ELSE 0 END) as zero_acre_count,
      SUM(CASE WHEN ok_acre = 0 THEN 1 ELSE 0 END) as zero_ok_acre_count,
      SUM(acre) as total_acre,
      SUM(ok_acre) as total_ok_acre
    FROM work_records 
    WHERE source IN ('old', 'old_api')
  `);
  
  console.log(`  总记录数: ${acreStats.total_records}`);
  console.log(`  acre=0 的记录: ${acreStats.zero_acre_count} 条`);
  console.log(`  ok_acre=0 的记录: ${acreStats.zero_ok_acre_count} 条`);
  console.log(`  acre 总和: ${acreStats.total_acre} 亩`);
  console.log(`  ok_acre 总和: ${acreStats.total_ok_acre} 亩`);
  console.log(`  差异: ${(parseFloat(acreStats.total_acre || 0) - parseFloat(acreStats.total_ok_acre || 0)).toFixed(2)} 亩\n`);
  
  // 5. 检查时间范围
  console.log('📊 5. 数据时间范围');
  console.log('-------------------------------------------');
  
  const dateRange = await db.queryOne(`
    SELECT 
      MIN(work_date) as min_date,
      MAX(work_date) as max_date
    FROM work_records 
    WHERE source IN ('old', 'old_api')
  `);
  
  console.log(`  最早记录: ${dateRange.min_date || '无'}`);
  console.log(`  最晚记录: ${dateRange.max_date || '无'}\n`);
  
  // 6. 检查是否有2025年的数据（可能导致今年统计偏高）
  console.log('📊 6. 按年份统计');
  console.log('-------------------------------------------');
  
  const byYear = await db.queryAll(`
    SELECT 
      YEAR(work_date) as year,
      COUNT(*) as count,
      SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source IN ('old', 'old_api')
    GROUP BY YEAR(work_date)
    ORDER BY year
  `);
  
  byYear.forEach(row => {
    console.log(`  ${row.year}年: ${row.count} 条记录, ${row.total_acre} 亩`);
  });
  
  console.log('\n=== 分析完成 ===\n');
  
  process.exit(0);
})();
