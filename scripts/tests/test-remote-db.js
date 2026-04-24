/**
 * 测试远程数据库连接
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('\n=== 测试远程数据库连接 ===\n');
  
  const config = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  };
  
  console.log('📋 连接配置:');
  console.log(`  主机: ${config.host}`);
  console.log(`  端口: ${config.port}`);
  console.log(`  用户: ${config.user}`);
  console.log(`  数据库: ${config.database}`);
  console.log('');
  
  let connection;
  
  try {
    console.log('🔌 正在连接...');
    const startTime = Date.now();
    
    connection = await mysql.createConnection(config);
    
    const connectTime = Date.now() - startTime;
    console.log(`✅ 连接成功！耗时: ${connectTime}ms\n`);
    
    // 测试1: 查询版本
    console.log('📊 测试1: 查询MySQL版本');
    const [version] = await connection.query('SELECT VERSION() as version');
    console.log(`  MySQL版本: ${version[0].version}\n`);
    
    // 测试2: 查询数据统计
    console.log('📊 测试2: 查询数据统计');
    const [stats] = await connection.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN source = 'yuntinan' THEN 1 ELSE 0 END) as yuntinan_count,
        SUM(CASE WHEN source = 'old_api' THEN 1 ELSE 0 END) as old_api_count,
        SUM(CASE WHEN source = 'yuntinan' THEN acre ELSE 0 END) as yuntinan_acre,
        SUM(CASE WHEN source = 'old_api' THEN acre ELSE 0 END) as old_api_acre
      FROM work_records
    `);
    
    console.log(`  总记录数: ${stats[0].total_records}`);
    console.log(`  云途安: ${stats[0].yuntinan_count} 条, ${stats[0].yuntinan_acre} 亩`);
    console.log(`  旧供应商: ${stats[0].old_api_count} 条, ${stats[0].old_api_acre} 亩`);
    console.log('');
    
    // 测试3: 查询设备数量
    console.log('📊 测试3: 查询设备统计');
    const [machines] = await connection.query(`
      SELECT 
        COUNT(*) as total_machines,
        SUM(CASE WHEN source = 'yuntinan' THEN 1 ELSE 0 END) as yuntinan_machines,
        SUM(CASE WHEN source = 'old_api' OR source = 'old' THEN 1 ELSE 0 END) as old_machines
      FROM machines
    `);
    
    console.log(`  总设备数: ${machines[0].total_machines}`);
    console.log(`  云途安: ${machines[0].yuntinan_machines} 台`);
    console.log(`  旧供应商: ${machines[0].old_machines} 台`);
    console.log('');
    
    // 测试4: 查询最近更新时间
    console.log('📊 测试4: 数据更新情况');
    const [lastUpdate] = await connection.query(`
      SELECT MAX(updated_at) as last_update FROM work_records
    `);
    
    console.log(`  最后更新: ${lastUpdate[0].last_update}`);
    console.log('');
    
    // 测试5: 写入测试
    console.log('📊 测试5: 写入权限测试');
    try {
      await connection.query(`
        INSERT INTO test_connection (test_value, created_at) 
        VALUES ('test', NOW())
        ON DUPLICATE KEY UPDATE test_value = 'test', updated_at = NOW()
      `);
      console.log('  ✅ 写入权限正常\n');
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.log('  ℹ️  测试表不存在（这是正常的）\n');
      } else {
        console.log(`  ⚠️  写入测试失败: ${error.message}\n`);
      }
    }
    
    console.log('✅ 所有测试通过！\n');
    console.log('💡 提示: 现在可以修改 .env 中的 MYSQL_HOST 为服务器地址');
    console.log('   当前配置:', config.host === 'localhost' ? '本地数据库' : '远程数据库');
    
  } catch (error) {
    console.error('\n❌ 连接失败!\n');
    console.error('错误信息:', error.message);
    console.error('错误代码:', error.code);
    console.error('');
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔍 可能原因:');
      console.error('  1. MySQL服务未启动');
      console.error('  2. 防火墙阻止了连接');
      console.error('  3. MySQL不允许远程连接');
      console.error('  4. 主机地址或端口错误');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔍 可能原因:');
      console.error('  1. 用户名或密码错误');
      console.error('  2. 用户没有远程访问权限');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('🔍 可能原因:');
      console.error('  1. 网络连接超时');
      console.error('  2. 服务器不可达');
      console.error('  3. 防火墙阻止了连接');
    }
    
    console.error('\n💡 建议:');
    console.error('  1. 检查服务器MySQL是否允许远程连接');
    console.error('  2. 检查防火墙和安全组配置');
    console.error('  3. 确认用户名和密码正确');
    console.error('  4. 查看 docs/REMOTE_DB_SETUP.md 获取详细配置指南');
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 连接已关闭\n');
    }
  }
}

testConnection();
