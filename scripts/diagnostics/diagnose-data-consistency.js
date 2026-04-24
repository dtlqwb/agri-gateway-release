/**
 * 数据一致性诊断脚本
 * 用于排查旧供应商和新供应商面积统计不一致的问题
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function diagnoseDataConsistency() {
  console.log('\n🔍 数据一致性诊断工具\n');
  console.log('═'.repeat(80));
  
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    console.log('✅ 数据库连接成功\n');
    
    // 1. 检查旧供应商数据统计
    console.log('📊 步骤1: 检查旧供应商数据统计');
    console.log('-'.repeat(80));
    
    const [oldStats] = await connection.execute(`
      SELECT 
        source,
        COUNT(DISTINCT t_number) as device_count,
        COUNT(*) as record_count,
        SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
      FROM work_records
      WHERE source IN ('old', 'old_api')
      GROUP BY source
    `);
    
    console.log('\n旧供应商数据源统计:');
    oldStats.forEach(stat => {
      console.log(`  数据源: ${stat.source}`);
      console.log(`    设备数: ${stat.device_count} 台`);
      console.log(`    记录数: ${stat.record_count} 条`);
      console.log(`    总面积: ${stat.total_acre} 亩`);
    });
    
    // 2. 检查旧供应商设备表
    console.log('\n📋 步骤2: 检查旧供应商设备表');
    console.log('-'.repeat(80));
    
    const [deviceCount] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    console.log(`\nold_supplier_devices 表设备数: ${deviceCount[0].total} 台`);
    
    const [devicesWithRecords] = await connection.execute(`
      SELECT COUNT(DISTINCT osd.macid) as count
      FROM old_supplier_devices osd
      INNER JOIN work_records wr ON wr.t_number = osd.macid
      WHERE wr.source IN ('old', 'old_api')
    `);
    console.log(`有作业记录的设备数: ${devicesWithRecords[0].count} 台`);
    
    const [devicesWithoutRecords] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM old_supplier_devices osd
      LEFT JOIN work_records wr ON wr.t_number = osd.macid AND wr.source IN ('old', 'old_api')
      WHERE wr.t_number IS NULL
    `);
    console.log(`无作业记录的设备数: ${devicesWithoutRecords[0].count} 台`);
    
    // 3. 检查machines表中的旧供应商设备
    console.log('\n🚜 步骤3: 检查machines表中的旧供应商设备');
    console.log('-'.repeat(80));
    
    const [machinesOld] = await connection.execute(`
      SELECT 
        COUNT(*) as device_count,
        SUM(year_acre) as total_year_acre
      FROM machines
      WHERE source = 'old'
    `);
    console.log(`\nmachines表(source='old')设备数: ${machinesOld[0].device_count} 台`);
    console.log(`machines表年度面积总和: ${machinesOld[0].total_year_acre} 亩`);
    
    // 4. 检查新供应商（云途安）数据统计
    console.log('\n☁️  步骤4: 检查新供应商（云途安）数据统计');
    console.log('-'.repeat(80));
    
    const [yuntinanByType] = await connection.execute(`
      SELECT 
        work_type_name,
        COUNT(DISTINCT t_number) as device_count,
        COUNT(*) as record_count,
        SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
      FROM work_records
      WHERE source = 'yuntinan'
      GROUP BY work_type_name
      ORDER BY total_acre DESC
    `);
    
    console.log('\n云途安按作业类型统计:');
    yuntinanByType.forEach(stat => {
      console.log(`  ${stat.work_type_name}:`);
      console.log(`    设备数: ${stat.device_count} 台`);
      console.log(`    记录数: ${stat.record_count} 条`);
      console.log(`    面积: ${stat.total_acre} 亩`);
    });
    
    // 5. 检查是否有新设备未同步到machines表
    console.log('\n🆕 步骤5: 检查是否有新设备未同步到machines表');
    console.log('-'.repeat(80));
    
    const [newDevicesNotInMachines] = await connection.execute(`
      SELECT DISTINCT wr.t_number, wr.source, wr.org_name
      FROM work_records wr
      LEFT JOIN machines m ON wr.t_number = m.t_number AND wr.source = m.source
      WHERE m.t_number IS NULL
      LIMIT 20
    `);
    
    if (newDevicesNotInMachines.length > 0) {
      console.log(`\n发现 ${newDevicesNotInMachines.length} 个设备在work_records中但不在machines表中:`);
      newDevicesNotInMachines.forEach((dev, i) => {
        console.log(`  ${i+1}. ${dev.t_number} (${dev.source}) - ${dev.org_name}`);
      });
      console.log('\n⚠️  这些设备的面积可能未被计入machines.year_acre');
    } else {
      console.log('\n✅ 所有设备都已同步到machines表');
    }
    
    // 6. 对比不同统计方式的结果
    console.log('\n📈 步骤6: 对比不同统计方式');
    console.log('-'.repeat(80));
    
    // 从work_records直接统计
    const [wrStats] = await connection.execute(`
      SELECT 
        source,
        SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
      FROM work_records
      GROUP BY source
    `);
    
    console.log('\n从work_records直接统计:');
    wrStats.forEach(stat => {
      console.log(`  ${stat.source}: ${stat.total_acre} 亩`);
    });
    
    // 从machines表统计
    const [machineStats] = await connection.execute(`
      SELECT 
        source,
        COUNT(*) as device_count,
        SUM(year_acre) as total_year_acre
      FROM machines
      GROUP BY source
    `);
    
    console.log('\n从machines表统计(year_acre):');
    machineStats.forEach(stat => {
      console.log(`  ${stat.source}: ${stat.total_year_acre} 亩 (${stat.device_count} 台设备)`);
    });
    
    // 7. 检查数据修复机制是否执行
    console.log('\n🔧 步骤7: 检查数据修复机制');
    console.log('-'.repeat(80));
    
    const [repairCheck] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM work_records
      WHERE acre = 0 AND ok_acre > 0 AND source IN ('old', 'old_api')
    `);
    
    console.log(`\n需要修复的记录数(acre=0但ok_acre>0): ${repairCheck[0].count} 条`);
    
    if (repairCheck[0].count > 0) {
      console.log('⚠️  存在需要修复的数据，建议运行 repairAcreData()');
    } else {
      console.log('✅ 无需修复的数据');
    }
    
    // 8. 总结和建议
    console.log('\n' + '═'.repeat(80));
    console.log('\n📝 诊断总结:\n');
    
    const oldTotal = oldStats.reduce((sum, s) => sum + parseFloat(s.total_acre || 0), 0);
    const yuntinanTotal = wrStats.find(s => s.source === 'yuntinan')?.total_acre || 0;
    const machinesOldStat = machineStats.find(s => s.source === 'old');
    const machinesOldTotal = machinesOldStat ? parseFloat(machinesOldStat.total_year_acre || 0) : 0;
    
    console.log('旧供应商面积:');
    console.log(`  work_records统计: ${oldTotal.toFixed(2)} 亩`);
    console.log(`  machines表统计: ${machinesOldTotal.toFixed(2)} 亩`);
    console.log(`  差异: ${(oldTotal - machinesOldTotal).toFixed(2)} 亩`);
    
    console.log('\n云途安耕种面积:');
    const gengStat = yuntinanByType.find(t => t.work_type_name === '旋耕' || t.work_type_name === '耕');
    const zhongStat = yuntinanByType.find(t => t.work_type_name === '玉米播种' || t.work_type_name === '播种');
    
    if (gengStat) {
      console.log(`  耕: ${gengStat.total_acre} 亩 (${gengStat.device_count} 台设备)`);
    }
    if (zhongStat) {
      console.log(`  种: ${zhongStat.total_acre} 亩 (${zhongStat.device_count} 台设备)`);
    }
    
    console.log('\n💡 可能的原因:');
    console.log('  1. 有新设备加入，但machines表未更新');
    console.log('  2. 数据修复机制(repairMachineData)未在启动时执行');
    console.log('  3. 部分设备只有work_records，没有对应的machines记录');
    console.log('  4. year_acre字段未及时更新');
    
    console.log('\n🔧 建议操作:');
    console.log('  1. 重启服务触发repairMachineData()');
    console.log('  2. 或手动执行: node scripts/repair-machine-data.js');
    console.log('  3. 检查定时任务是否正常执行');
    console.log('  4. 验证API同步是否包含所有设备\n');
    
    await connection.end();
    
  } catch (err) {
    console.error('\n❌ 诊断失败:', err.message);
    console.error('\n详细错误:', err);
  }
}

diagnoseDataConsistency();
