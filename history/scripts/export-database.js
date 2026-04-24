/**
 * 数据库导出脚本
 * 将MySQL数据库导出为SQL文件
 * 
 * 使用方法：
 * node scripts/export-database.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'agri_gateway'
};

const outputFile = path.join(__dirname, '..', 'agri_gateway_backup.sql');

console.log('========== 数据库导出工具 ==========');
console.log(`数据库: ${dbConfig.database}`);
console.log(`主机: ${dbConfig.host}:${dbConfig.port}`);
console.log(`输出文件: ${outputFile}`);
console.log('');

async function exportDatabase() {
  let connection;
  
  try {
    // 连接数据库
    console.log('[1/5] 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功');
    
    // 获取所有表
    console.log('\n[2/5] 获取表列表...');
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [dbConfig.database]);
    
    console.log(`✅ 找到 ${tables.length} 个表`);
    tables.forEach(t => console.log(`   - ${t.TABLE_NAME}`));
    
    // 开始生成SQL文件
    console.log('\n[3/5] 生成SQL文件...');
    let sqlContent = '';
    
    // 文件头
    sqlContent += `-- ============================================\n`;
    sqlContent += `-- 数据库导出文件\n`;
    sqlContent += `-- 数据库: ${dbConfig.database}\n`;
    sqlContent += `-- 导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    sqlContent += `-- 版本: v3.0\n`;
    sqlContent += `-- ============================================\n\n`;
    
    sqlContent += `SET NAMES utf8mb4;\n`;
    sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;
    
    // 删除并重建数据库
    sqlContent += `-- 创建数据库\n`;
    sqlContent += `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
    sqlContent += `USE \`${dbConfig.database}\`;\n\n`;
    
    // 导出每个表
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      console.log(`   处理表: ${tableName}...`);
      
      // 获取建表语句
      const [createTableResult] = await connection.execute(`SHOW CREATE TABLE \`${tableName}\``);
      const createTableSQL = createTableResult[0]['Create Table'];
      
      sqlContent += `-- ----------------------------\n`;
      sqlContent += `-- 表结构: ${tableName}\n`;
      sqlContent += `-- ----------------------------\n`;
      sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
      sqlContent += `${createTableSQL};\n\n`;
      
      // 获取数据
      const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
      
      if (rows.length > 0) {
        sqlContent += `-- ----------------------------\n`;
        sqlContent += `-- 表数据: ${tableName} (${rows.length} 条记录)\n`;
        sqlContent += `-- ----------------------------\n`;
        
        // 获取列名
        const columns = Object.keys(rows[0]);
        
        // 分批插入，每批100条
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          
          sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES\n`;
          
          const valuesList = batch.map(row => {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) {
                return 'NULL';
              } else if (typeof value === 'number') {
                return value;
              } else if (typeof value === 'boolean') {
                return value ? 1 : 0;
              } else {
                // 字符串转义
                const escaped = String(value).replace(/'/g, "''").replace(/\\/g, '\\\\');
                return `'${escaped}'`;
              }
            });
            return `(${values.join(', ')})`;
          });
          
          sqlContent += valuesList.join(',\n');
          sqlContent += ';\n\n';
        }
        
        console.log(`   ✅ ${tableName}: ${rows.length} 条记录`);
      } else {
        console.log(`   ⚪ ${tableName}: 空表`);
      }
      
      sqlContent += `\n`;
    }
    
    sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    
    // 写入文件
    console.log('\n[4/5] 写入文件...');
    fs.writeFileSync(outputFile, sqlContent, 'utf8');
    
    const stats = fs.statSync(outputFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`✅ 文件已保存: ${outputFile}`);
    console.log(`   文件大小: ${sizeMB} MB`);
    
    // 统计信息
    console.log('\n[5/5] 导出统计:');
    console.log(`   表数量: ${tables.length}`);
    
    let totalRecords = 0;
    for (const table of tables) {
      const [result] = await connection.execute(`SELECT COUNT(*) as count FROM \`${table.TABLE_NAME}\``);
      totalRecords += result[0].count;
    }
    console.log(`   总记录数: ${totalRecords}`);
    
    console.log('\n========== 导出完成 ==========');
    console.log('✅ 数据库已成功导出！');
    console.log('');
    console.log('📝 使用说明:');
    console.log('1. 将此SQL文件发送给同事');
    console.log('2. 同事在云端MySQL中执行:');
    console.log(`   mysql -u username -p < agri_gateway_backup.sql`);
    console.log('');
    console.log('💡 或者使用Navicat等工具导入');
    
  } catch (error) {
    console.error('\n❌ 导出失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

exportDatabase();
