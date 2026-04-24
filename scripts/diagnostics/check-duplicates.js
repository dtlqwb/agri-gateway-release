require('dotenv').config();
const db = require('./services/db');

(async () => {
  await db.init();
  
  console.log('\n=== 数据完整性深度检查 ===\n');
  
  // 1. 检查重复记录
  console.log('📊 1. 检查重复记录');
  console.log('-------------------------------------------');
  
  const duplicates = await db.queryAll(`
    SELECT t_number, work_date, COUNT(*) as cnt,
           GROUP_CONCAT(id) as ids
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY t_number, work_date
    HAVING cnt > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  
  if (duplicates.length > 0) {
    console.log(`  ⚠️  发现 ${duplicates.length} 组重复记录:`);
    duplicates.forEach(row => {
      console.log(`    ${row.t_number} | ${row.work_date} | ${row.cnt} 次 | IDs: ${row.ids}`);
    });
  } else {
    console.log('  ✅ 没有发现重复记录');
  }
  console.log('');
  
  // 2. 检查未关联合作社的设备
  console.log('📊 2. 检查未关联合作社的设备');
  console.log('-------------------------------------------');
  
  const noOrgDevices = await db.queryAll(`
    SELECT t_number, COUNT(*) as record_count,
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api' 
      AND (org_name = '' OR org_name IS NULL)
    GROUP BY t_number
    ORDER BY total_acre DESC
  `);
  
  if (noOrgDevices.length > 0) {
    console.log(`  ⚠️  发现 ${noOrgDevices.length} 台设备未关联合作社:`);
    noOrgDevices.forEach(row => {
      console.log(`    ${row.t_number}: ${row.record_count} 条记录, ${row.total_acre} 亩`);
    });
  } else {
    console.log('  ✅ 所有设备都已关联合作社');
  }
  console.log('');
  
  // 3. 检查设备与合作社的匹配情况
  console.log('📊 3. 设备与合作社匹配统计');
  console.log('-------------------------------------------');
  
  const orgStats = await db.queryAll(`
    SELECT 
      COALESCE(org_name, '(未分配)') as org_name,
      COUNT(DISTINCT t_number) as device_count,
      COUNT(*) as record_count,
      SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY org_name
    ORDER BY total_acre DESC
  `);
  
  orgStats.forEach(row => {
    const marker = row.org_name === '(未分配)' ? ' ⚠️' : ' ✅';
    console.log(`  ${marker} ${row.org_name}: ${row.device_count} 台设备, ${row.record_count} 条记录, ${row.total_acre} 亩`);
  });
  console.log('');
  
  // 4. 检查每台设备的记录分布（是否均匀）
  console.log('📊 4. 设备记录分布（前20台）');
  console.log('-------------------------------------------');
  
  const deviceDist = await db.queryAll(`
    SELECT t_number, 
           COUNT(*) as record_count,
           MIN(work_date) as first_date,
           MAX(work_date) as last_date,
           SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre,
           AVG(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as avg_acre
    FROM work_records 
    WHERE source = 'old_api'
    GROUP BY t_number
    ORDER BY total_acre DESC
    LIMIT 20
  `);
  
  deviceDist.forEach(row => {
    console.log(`  ${row.t_number}: ${row.record_count} 条 | ${row.first_date} ~ ${row.last_date} | ${row.total_acre} 亩 | 平均 ${row.avg_acre} 亩/天`);
  });
  console.log('');
  
  // 5. 检查 acre 字段的合理性
  console.log('📊 5. 作业面积分布检查');
  console.log('-------------------------------------------');
  
  const acreStats = await db.queryOne(`
    SELECT 
      COUNT(*) as total_records,
      MIN(acre) as min_acre,
      MAX(acre) as max_acre,
      AVG(acre) as avg_acre,
      SUM(CASE WHEN acre > 100 THEN 1 ELSE 0 END) as over_100,
      SUM(CASE WHEN acre > 200 THEN 1 ELSE 0 END) as over_200,
      SUM(CASE WHEN acre > 500 THEN 1 ELSE 0 END) as over_500
    FROM work_records 
    WHERE source = 'old_api'
  `);
  
  console.log(`  总记录数: ${acreStats.total_records} 条`);
  console.log(`  最小面积: ${acreStats.min_acre} 亩`);
  console.log(`  最大面积: ${acreStats.max_acre} 亩`);
  console.log(`  平均面积: ${acreStats.avg_acre} 亩`);
  console.log(`  超过100亩: ${acreStats.over_100} 条`);
  console.log(`  超过200亩: ${acreStats.over_200} 条`);
  console.log(`  超过500亩: ${acreStats.over_500} 条`);
  console.log('');
  
  // 6. 检查时间范围
  console.log('📊 6. 数据时间范围');
  console.log('-------------------------------------------');
  
  const timeRange = await db.queryOne(`
    SELECT 
      MIN(work_date) as min_date,
      MAX(work_date) as max_date,
      COUNT(DISTINCT work_date) as unique_days,
      DATEDIFF(MAX(work_date), MIN(work_date)) as date_span
    FROM work_records 
    WHERE source = 'old_api'
  `);
  
  console.log(`  最早日期: ${timeRange.min_date}`);
  console.log(`  最晚日期: ${timeRange.max_date}`);
  console.log(`  实际作业天数: ${timeRange.unique_days} 天`);
  console.log(`  时间跨度: ${timeRange.date_span} 天`);
  console.log(`  理论天数: ${timeRange.date_span + 1} 天`);
  console.log(`  缺失天数: ${timeRange.date_span + 1 - timeRange.unique_days} 天`);
  console.log('');
  
  console.log('=== 检查完成 ===\n');
  
  process.exit(0);
})();
