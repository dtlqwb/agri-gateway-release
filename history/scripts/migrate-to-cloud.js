/**
 * 数据库迁移脚本 - 从本地迁移到云端
 * 
 * 使用方法：
 * 1. 在 .env 中配置云端数据库信息
 * 2. 运行: node scripts/migrate-to-cloud.js
 */

require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 本地数据库配置
const LOCAL_DB = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'agri_gateway'
};

// 云端数据库配置（从环境变量读取）
const CLOUD_DB = {
  host: process.env.CLOUD_MYSQL_HOST,
  port: process.env.CLOUD_MYSQL_PORT || 3306,
  user: process.env.CLOUD_MYSQL_USER,
  password: process.env.CLOUD_MYSQL_PASSWORD,
  database: process.env.CLOUD_MYSQL_DATABASE || 'agri_gateway'
};

// 备份文件路径
const BACKUP_FILE = path.join(__dirname, '..', 'agri_gateway_backup.sql');

console.log('========== 数据库迁移工具 v1.0 ==========');
console.log('');

// 检查云端配置
if (!CLOUD_DB.host || !CLOUD_DB.user || !CLOUD_DB.password) {
  console.error('❌ 错误：未配置云端数据库信息');
  console.log('');
  console.log('请在 .env 文件中添加以下配置：');
  console.log('CLOUD_MYSQL_HOST=your-cloud-host.com');
  console.log('CLOUD_MYSQL_PORT=3306');
  console.log('CLOUD_MYSQL_USER=your_username');
  console.log('CLOUD_MYSQL_PASSWORD=your_password');
  console.log('CLOUD_MYSQL_DATABASE=agri_gateway');
  console.log('');
  process.exit(1);
}

console.log('📋 本地数据库配置:');
console.log(`   主机: ${LOCAL_DB.host}:${LOCAL_DB.port}`);
console.log(`   数据库: ${LOCAL_DB.database}`);
console.log('');

console.log('☁️  云端数据库配置:');
console.log(`   主机: ${CLOUD_DB.host}:${CLOUD_DB.port}`);
console.log(`   数据库: ${CLOUD_DB.database}`);
console.log('');

// 询问用户确认
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  确认要将本地数据迁移到云端吗？(yes/no): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ 已取消迁移');
    rl.close();
    process.exit(0);
  }
  
  rl.close();
  startMigration();
});

async function startMigration() {
  try {
    // 步骤1：导出本地数据库
    console.log('\n[1/4] 正在导出本地数据库...');
    await exportDatabase();
    
    // 步骤2：检查备份文件
    console.log('\n[2/4] 检查备份文件...');
    const stats = fs.statSync(BACKUP_FILE);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ 备份文件创建成功: ${BACKUP_FILE}`);
    console.log(`   文件大小: ${sizeMB} MB`);
    
    // 步骤3：导入到云端
    console.log('\n[3/4] 正在导入到云端数据库...');
    await importToCloud();
    
    // 步骤4：验证
    console.log('\n[4/4] 验证迁移结果...');
    await verifyMigration();
    
    console.log('\n========== 迁移完成 ==========');
    console.log('✅ 数据已成功迁移到云端！');
    console.log('');
    console.log('📝 下一步操作：');
    console.log('1. 更新 .env 文件中的数据库配置为云端地址');
    console.log('2. 重启服务: npm start');
    console.log('3. 访问系统验证功能是否正常');
    console.log('');
    console.log('💡 提示：备份文件保留在: ' + BACKUP_FILE);
    console.log('   确认无误后可以手动删除');
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.log('\n请检查：');
    console.log('1. 本地MySQL服务是否正常运行');
    console.log('2. 云端数据库连接是否正常');
    console.log('3. 网络连接是否稳定');
    console.log('4. 是否有足够的权限');
    process.exit(1);
  }
}

/**
 * 导出本地数据库
 */
function exportDatabase() {
  return new Promise((resolve, reject) => {
    const mysqldumpCmd = `mysqldump -h ${LOCAL_DB.host} -P ${LOCAL_DB.port} -u ${LOCAL_DB.user} -p${LOCAL_DB.password} --single-transaction --routines --triggers --default-character-set=utf8mb4 ${LOCAL_DB.database} > "${BACKUP_FILE}"`;
    
    console.log('   执行命令: mysqldump ...');
    
    exec(mysqldumpCmd, (error, stdout, stderr) => {
      if (error) {
        // 如果mysqldump不存在，尝试其他方法
        if (error.message.includes('mysqldump')) {
          reject(new Error('mysqldump命令不存在，请先安装MySQL客户端工具'));
        } else {
          reject(error);
        }
        return;
      }
      resolve();
    });
  });
}

/**
 * 导入到云端数据库
 */
function importToCloud() {
  return new Promise((resolve, reject) => {
    // 先创建数据库（如果不存在）
    const createDbCmd = `mysql -h ${CLOUD_DB.host} -P ${CLOUD_DB.port} -u ${CLOUD_DB.user} -p${CLOUD_DB.password} -e "CREATE DATABASE IF NOT EXISTS \`${CLOUD_DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`;
    
    exec(createDbCmd, (error) => {
      if (error && !error.message.includes('already exists')) {
        reject(new Error('创建数据库失败: ' + error.message));
        return;
      }
      
      // 导入数据
      const importCmd = `mysql -h ${CLOUD_DB.host} -P ${CLOUD_DB.port} -u ${CLOUD_DB.user} -p${CLOUD_DB.password} --default-character-set=utf8mb4 ${CLOUD_DB.database} < "${BACKUP_FILE}"`;
      
      console.log('   执行命令: mysql import ...');
      
      exec(importCmd, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * 验证迁移结果
 */
async function verifyMigration() {
  const mysql = require('mysql2/promise');
  
  try {
    // 连接云端数据库
    const connection = await mysql.createConnection({
      host: CLOUD_DB.host,
      port: CLOUD_DB.port,
      user: CLOUD_DB.user,
      password: CLOUD_DB.password,
      database: CLOUD_DB.database
    });
    
    // 检查表是否存在
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [CLOUD_DB.database]);
    
    console.log(`   ✅ 云端数据库包含 ${tables.length} 个表`);
    
    // 检查关键表的数据量
    const criticalTables = ['work_records', 'machines', 'organizations', 'admins'];
    
    for (const tableName of criticalTables) {
      const [result] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      console.log(`   📊 ${tableName}: ${result[0].count} 条记录`);
    }
    
    await connection.end();
    
  } catch (error) {
    throw new Error('验证失败: ' + error.message);
  }
}
