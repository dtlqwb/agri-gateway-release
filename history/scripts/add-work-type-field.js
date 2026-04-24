/**
 * 添加 work_type_name 字段到 old_supplier_devices 表
 */

require('dotenv').config();
const db = require('../services/db');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('\n========== 添加 work_type_name 字段 ==========\n');
  
  try {
    await db.init();
    
    // 读取SQL文件
    const sqlFile = path.join(__dirname, 'add-work-type-column.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    
    console.log('[SQL] 执行:', sql.trim());
    
    await db.runSql(sql);
    
    console.log('\n✅ 字段添加成功\n');
    
    // 验证
    const result = await db.queryAll('DESCRIBE old_supplier_devices');
    console.log('更新后的表结构:');
    console.table(result);
    
  } catch (error) {
    console.error('\n❌ 失败:', error.message);
    if (error.message.includes('Duplicate column')) {
      console.log('提示: 字段已存在，无需重复添加\n');
    } else {
      console.error(error.stack);
    }
  } finally {
    await db.close();
    console.log('\n[数据库] 连接已关闭\n');
  }
}

main();
