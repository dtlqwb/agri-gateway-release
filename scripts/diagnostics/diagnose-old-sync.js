/**
 * 旧供应商同步诊断脚本
 * 用于排查为什么今天没有更新旧设备数据
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

console.log('\n🔍 旧供应商同步诊断工具\n');
console.log('═'.repeat(60));

// 1. 检查环境变量配置
console.log('\n📋 步骤1: 检查环境变量配置');
console.log(`   ENABLE_OLD_SYNC = ${process.env.ENABLE_OLD_SYNC}`);
console.log(`   OLD_API_BASE = ${process.env.OLD_API_BASE}`);
console.log(`   OLD_API_USER = ${process.env.OLD_API_USER ? '已配置' : '未配置'}`);
console.log(`   OLD_API_KEY = ${process.env.OLD_API_KEY ? '已配置' : '未配置'}`);

if (process.env.ENABLE_OLD_SYNC !== 'true') {
  console.log('\n❌ 错误: ENABLE_OLD_SYNC 未设置为 true');
  console.log('   请在 .env 文件中设置: ENABLE_OLD_SYNC=true');
  process.exit(1);
} else {
  console.log('   ✅ 同步功能已启用');
}

// 2. 检查CSV文件是否存在
console.log('\n📄 步骤2: 检查CSV映射表文件');
const csvPaths = [
  path.join(__dirname, 'templates', '旧供应商终端映射表.csv'),
  path.join(__dirname, '终端映射表_清理版.csv')
];

let csvFound = false;
for (const csvPath of csvPaths) {
  if (fs.existsSync(csvPath)) {
    console.log(`   ✅ 找到文件: ${csvPath}`);
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    console.log(`   📊 设备数量: ${lines.length - 1} 台（不含表头）`);
    csvFound = true;
    break;
  }
}

if (!csvFound) {
  console.log('   ❌ 错误: 找不到CSV映射表文件');
  console.log('   期望位置:');
  console.log('     - templates/旧供应商终端映射表.csv');
  console.log('     - 终端映射表_清理版.csv');
  process.exit(1);
}

// 3. 检查数据库连接
console.log('\n🔗 步骤3: 检查数据库连接');
const mysql = require('mysql2/promise');

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    console.log('   ✅ 数据库连接成功');
    
    // 4. 检查设备表
    console.log('\n📊 步骤4: 检查设备表数据');
    const [devices] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    console.log(`   设备总数: ${devices[0].total} 台`);
    
    if (devices[0].total === 0) {
      console.log('   ⚠️  警告: 设备表为空，需要先导入CSV映射表');
      console.log('   💡 解决方法:');
      console.log('      1. 运行: node import-old-devices-from-csv.js');
      console.log('      2. 或在前端管理页面点击"导入设备映射表"');
    } else {
      console.log('   ✅ 设备数据存在');
      
      // 显示示例设备
      const [samples] = await connection.execute(
        'SELECT macid, cooperative_name, driver_name FROM old_supplier_devices LIMIT 3'
      );
      console.log('\n   示例设备:');
      samples.forEach((row, i) => {
        console.log(`     ${i+1}. ${row.macid.substring(0, 16)}... | ${row.cooperative_name} | ${row.driver_name}`);
      });
    }
    
    // 5. 检查今天的同步记录
    console.log('\n📅 步骤5: 检查今天的同步记录');
    const today = new Date().toISOString().substring(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().substring(0, 10);
    
    const [records] = await connection.execute(
      `SELECT work_date, COUNT(*) as count, SUM(acre) as total_acre 
       FROM work_records 
       WHERE source IN ('old', 'old_api')
       AND work_date IN (?, ?)
       GROUP BY work_date
       ORDER BY work_date DESC`,
      [today, yesterdayStr]
    );
    
    if (records.length === 0) {
      console.log(`   ⚠️  警告: 今天(${today})和昨天(${yesterdayStr})都没有同步记录`);
      console.log('\n   可能的原因:');
      console.log('     1. 定时任务未执行（凌晨4点）');
      console.log('     2. API调用失败');
      console.log('     3. 所有设备当天作业面积为0');
      console.log('\n   建议操作:');
      console.log('     1. 手动触发同步: node test-old-sync.js');
      console.log('     2. 检查服务器日志，查看凌晨4点的输出');
      console.log('     3. 验证API是否可访问: curl http://60.188.243.23:28111');
    } else {
      records.forEach(record => {
        console.log(`   ✅ ${record.work_date}: ${record.count} 条记录, 总面积 ${record.total_acre} 亩`);
      });
    }
    
    // 6. 检查定时任务状态
    console.log('\n⏰ 步骤6: 检查定时任务配置');
    console.log('   定时任务时间: 每天凌晨 4:00');
    console.log('   下次执行时间: 明天凌晨 4:00');
    console.log('   配置文件: services/scheduler.js (startOldAPISync)');
    
    // 7. 总结和建议
    console.log('\n' + '═'.repeat(60));
    console.log('\n📝 诊断总结:\n');
    
    if (devices[0].total > 0 && records.length > 0) {
      console.log('✅ 系统状态正常');
      console.log('   - 设备数据已导入');
      console.log('   - 有同步记录');
      console.log('   - 定时任务已配置');
    } else if (devices[0].total === 0) {
      console.log('❌ 缺少设备数据');
      console.log('   请先导入CSV映射表:');
      console.log('   node import-old-devices-from-csv.js');
    } else if (records.length === 0) {
      console.log('⚠️  没有同步记录');
      console.log('   可能原因:');
      console.log('   1. 定时任务未执行 - 检查服务是否在凌晨4点运行');
      console.log('   2. API返回空数据 - 设备当天无作业');
      console.log('   3. API调用失败 - 检查网络连接和API地址');
      console.log('\n   建议手动测试同步:');
      console.log('   node test-old-sync.js');
    }
    
    console.log('\n💡 快速修复命令:');
    console.log('   # 1. 导入设备数据');
    console.log('   node import-old-devices-from-csv.js');
    console.log('   ');
    console.log('   # 2. 手动触发同步测试');
    console.log('   node test-old-sync.js');
    console.log('   ');
    console.log('   # 3. 重启服务（应用代码修改）');
    console.log('   pm2 restart agri-gateway  # 如果使用PM2');
    console.log('   或');
    console.log('   node index.js              # 直接启动\n');
    
    await connection.end();
    
  } catch (err) {
    console.error('\n❌ 诊断失败:', err.message);
    console.error('\n可能的原因:');
    console.error('1. 数据库连接配置错误 - 检查 .env 文件');
    console.error('2. MySQL服务未启动');
    console.error('3. 依赖包未安装 - 运行 npm install');
    console.error('\n详细错误:', err);
  }
})();
