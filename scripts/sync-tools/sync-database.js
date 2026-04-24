/**
 * 数据库同步工具
 * 用于在服务器和本地之间同步数据
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  // 本地数据库配置（从.env读取）
  local: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || '3306',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'agri_gateway'
  },
  
  // 服务器数据库配置（需要手动填写）
  remote: {
    host: '82.157.186.237',
    port: '3306',
    user: 'root',
    password: 'your-server-password', // TODO: 修改为实际密码
    database: 'agri_gateway'
  },
  
  // 备份目录
  backupDir: './data/backups'
};

// 确保备份目录存在
if (!fs.existsSync(CONFIG.backupDir)) {
  fs.mkdirSync(CONFIG.backupDir, { recursive: true });
}

/**
 * 生成时间戳文件名
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
         now.toTimeString().split(' ')[0].replace(/:/g, '');
}

/**
 * 导出数据库
 */
function exportDatabase(dbConfig, outputFile) {
  console.log(`📤 正在导出数据库 ${dbConfig.database}...`);
  
  const command = `mysqldump -h${dbConfig.host} -P${dbConfig.port} -u${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} > "${outputFile}"`;
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ 导出成功: ${outputFile}`);
    return outputFile;
  } catch (error) {
    console.error('❌ 导出失败:', error.message);
    throw error;
  }
}

/**
 * 导入数据库
 */
function importDatabase(dbConfig, inputFile) {
  console.log(`📥 正在导入数据库 ${dbConfig.database}...`);
  
  const command = `mysql -h${dbConfig.host} -P${dbConfig.port} -u${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} < "${inputFile}"`;
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('✅ 导入成功');
  } catch (error) {
    console.error('❌ 导入失败:', error.message);
    throw error;
  }
}

/**
 * 从服务器同步到本地
 */
async function syncFromRemote() {
  console.log('\n=== 从服务器同步到本地 ===\n');
  
  const timestamp = getTimestamp();
  const dumpFile = path.join(CONFIG.backupDir, `remote_backup_${timestamp}.sql`);
  
  try {
    // 1. 从服务器导出
    console.log('步骤1: 从服务器导出数据库');
    exportDatabase(CONFIG.remote, dumpFile);
    
    // 2. 备份本地数据库
    console.log('\n步骤2: 备份本地数据库');
    const localBackup = path.join(CONFIG.backupDir, `local_backup_${timestamp}.sql`);
    exportDatabase(CONFIG.local, localBackup);
    
    // 3. 导入到本地
    console.log('\n步骤3: 导入到本地数据库');
    importDatabase(CONFIG.local, dumpFile);
    
    console.log('\n✅ 同步完成！');
    console.log(`   服务器备份: ${dumpFile}`);
    console.log(`   本地备份: ${localBackup}`);
    
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    process.exit(1);
  }
}

/**
 * 从本地同步到服务器
 */
async function syncToRemote() {
  console.log('\n=== 从本地同步到服务器 ===\n');
  
  const timestamp = getTimestamp();
  const dumpFile = path.join(CONFIG.backupDir, `local_backup_${timestamp}.sql`);
  
  try {
    // 1. 从本地导出
    console.log('步骤1: 从本地导出数据库');
    exportDatabase(CONFIG.local, dumpFile);
    
    // 2. 备份服务器数据库
    console.log('\n步骤2: 备份服务器数据库');
    const remoteBackup = path.join(CONFIG.backupDir, `remote_backup_${timestamp}.sql`);
    exportDatabase(CONFIG.remote, remoteBackup);
    
    // 3. 导入到服务器
    console.log('\n步骤3: 导入到服务器数据库');
    importDatabase(CONFIG.remote, dumpFile);
    
    console.log('\n✅ 同步完成！');
    console.log(`   本地备份: ${dumpFile}`);
    console.log(`   服务器备份: ${remoteBackup}`);
    
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    process.exit(1);
  }
}

/**
 * 仅同步特定表
 */
async function syncTables(tables, direction = 'from-remote') {
  console.log(`\n=== 同步指定表: ${tables.join(', ')} ===\n`);
  console.log(`方向: ${direction === 'from-remote' ? '服务器→本地' : '本地→服务器'}`);
  
  const timestamp = getTimestamp();
  const sourceConfig = direction === 'from-remote' ? CONFIG.remote : CONFIG.local;
  const targetConfig = direction === 'from-remote' ? CONFIG.local : CONFIG.remote;
  
  const dumpFile = path.join(CONFIG.backupDir, `tables_${timestamp}.sql`);
  
  try {
    // 1. 导出指定表
    console.log('步骤1: 导出指定表');
    const tableList = tables.join(' ');
    const exportCommand = `mysqldump -h${sourceConfig.host} -P${sourceConfig.port} -u${sourceConfig.user} -p${sourceConfig.password} ${sourceConfig.database} ${tableList} > "${dumpFile}"`;
    execSync(exportCommand, { stdio: 'inherit' });
    
    // 2. 导入到目标
    console.log('\n步骤2: 导入到目标数据库');
    importDatabase(targetConfig, dumpFile);
    
    console.log('\n✅ 表同步完成！');
    
  } catch (error) {
    console.error('\n❌ 表同步失败:', error.message);
    process.exit(1);
  }
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🔄 数据库同步工具

用法:
  node sync-database.js <command> [options]

命令:
  from-remote     从服务器同步到本地
  to-remote       从本地同步到服务器
  tables          同步指定表
  
选项:
  --tables=table1,table2  指定要同步的表（与tables命令配合使用）
  --direction=from-remote|to-remote  同步方向（与tables命令配合使用）

示例:
  # 从服务器同步所有数据到本地
  node sync-database.js from-remote
  
  # 从本地同步所有数据到服务器
  node sync-database.js to-remote
  
  # 仅同步 work_records 表（从服务器到本地）
  node sync-database.js tables --tables=work_records --direction=from-remote
  
  # 同步多个表
  node sync-database.js tables --tables=work_records,machines,organizations --direction=to-remote

注意:
  1. 使用前请修改 CONFIG.remote 中的服务器数据库配置
  2. 确保 mysqldump 和 mysql 命令可用
  3. 同步前会自动备份原有数据
  4. 备份文件保存在 data/backups/ 目录
  `);
}

// ===================== 主程序 =====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }
  
  // 解析参数
  const options = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value;
    }
  });
  
  switch (command) {
    case 'from-remote':
      await syncFromRemote();
      break;
      
    case 'to-remote':
      await syncToRemote();
      break;
      
    case 'tables':
      if (!options.tables) {
        console.error('❌ 错误: 请使用 --tables 指定要同步的表');
        process.exit(1);
      }
      const tables = options.tables.split(',');
      const direction = options.direction || 'from-remote';
      await syncTables(tables, direction);
      break;
      
    default:
      console.error(`❌ 未知命令: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
