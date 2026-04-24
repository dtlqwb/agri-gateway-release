/**
 * 检查旧供应商设备数据
 * 用法: node check-old-devices.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function check() {
  console.log('\n🔍 检查旧供应商设备数据...\n');
  console.log('═'.repeat(60));
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    console.log('✅ 数据库连接成功\n');
    
    // 1. 检查表是否存在
    console.log('📋 步骤1: 检查表结构');
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'old_supplier_devices'"
    );
    
    if (tables.length === 0) {
      console.log('❌ old_supplier_devices 表不存在');
      console.log('\n💡 解决方法:');
      console.log('   重启服务会自动创建表: node index.js');
      await connection.end();
      return;
    }
    
    console.log('✅ old_supplier_devices 表存在\n');
    
    // 2. 检查数据量
    console.log('📊 步骤2: 检查数据量');
    const [count] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    
    const total = count[0].total;
    console.log(`   设备总数: ${total}\n`);
    
    if (total === 0) {
      console.log('⚠️  表中没有数据！\n');
      console.log('💡 解决方法:\n');
      console.log('   方法1: 导入CSV文件');
      console.log('   node scripts/import-beidou-devices.js your_file.csv\n');
      console.log('   方法2: 手动插入数据');
      console.log('   INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name)');
      console.log("   VALUES ('md5_device_1', '合作社A', '张三', '耕');\n");
      console.log('   方法3: 提供设备列表，生成SQL脚本');
      
    } else {
      console.log('✅ 表中有数据\n');
      
      // 显示统计信息
      console.log('📈 步骤3: 数据统计');
      
      // 按合作社统计
      const [orgStats] = await connection.execute(`
        SELECT cooperative_name, COUNT(*) as count 
        FROM old_supplier_devices 
        GROUP BY cooperative_name 
        ORDER BY count DESC
      `);
      
      console.log('   按合作社分布:');
      orgStats.forEach((row, i) => {
        console.log(`     ${i+1}. ${row.cooperative_name}: ${row.count} 台`);
      });
      
      console.log('');
      
      // 显示示例数据
      console.log('📝 步骤4: 示例数据（前5条）');
      const [rows] = await connection.execute(
        'SELECT macid, cooperative_name, driver_name, work_type_name FROM old_supplier_devices LIMIT 5'
      );
      
      rows.forEach((row, i) => {
        console.log(`   ${i+1}. 设备号: ${row.macid}`);
        console.log(`      合作社: ${row.cooperative_name}`);
        console.log(`      机手: ${row.driver_name}`);
        console.log(`      作业类型: ${row.work_type_name || '未设置'}`);
        console.log('');
      });
      
      // 检查是否有作业记录
      console.log('📊 步骤5: 检查作业记录关联');
      const [workRecords] = await connection.execute(`
        SELECT COUNT(DISTINCT wr.t_number) as devices_with_records
        FROM work_records wr
        WHERE (wr.source = 'old' OR wr.source = 'old_api')
        AND wr.t_number IN (SELECT macid FROM old_supplier_devices)
      `);
      
      const withRecords = workRecords[0].devices_with_records;
      console.log(`   有作业记录的设备数: ${withRecords} / ${total}`);
      
      if (withRecords === 0) {
        console.log('\n⚠️  所有设备都没有作业记录');
        console.log('   这可能是正常的，如果还没有同步过旧供应商的作业数据');
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ 检查完成！\n');
    
    await connection.end();
    
  } catch (err) {
    console.error('\n❌ 检查失败:', err.message);
    console.error('\n可能的原因:');
    console.error('1. 数据库连接配置错误 - 检查 .env 文件');
    console.error('2. MySQL服务未启动');
    console.error('3. 数据库不存在 - 需要先创建 agri_gateway 数据库');
    console.error('\n详细错误:', err);
  }
}

check();
