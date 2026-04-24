/**
 * 导入旧供应商设备数据到 old_supplier_devices 表
 * @description 从CSV文件导入北斗设备信息
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mysql = require('mysql2/promise');

async function importOldSupplierDevices() {
  console.log('[旧设备导入] 开始导入旧供应商设备数据...');
  
  let connection;
  
  try {
    // 1. 连接数据库
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    console.log('[旧设备导入] 数据库连接成功');
    
    // 2. 读取CSV文件
    const csvPath = path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[旧设备导入] CSV文件不存在:', csvPath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    console.log(`[旧设备导入] 读取到 ${lines.length - 1} 条记录`);
    
    // 3. 解析并导入数据
    let imported = 0;
    let skipped = 0;
    let updated = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length < 3) continue;
      
      const [macid, orgName, driverName] = parts.map(p => p.trim());
      
      if (!macid) continue;
      
      try {
        // 检查是否已存在
        const [existing] = await connection.execute(
          'SELECT id FROM old_supplier_devices WHERE macid = ?',
          [macid]
        );
        
        if (existing.length > 0) {
          // 更新现有记录
          await connection.execute(
            `UPDATE old_supplier_devices 
             SET cooperative_name = ?, driver_name = ?, updated_at = NOW()
             WHERE macid = ?`,
            [orgName || '', driverName || '', macid]
          );
          updated++;
          skipped++;
        } else {
          // 插入新记录
          await connection.execute(
            `INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name, work_type_name) 
             VALUES (?, ?, ?, '其他')`,
            [macid, orgName || '', driverName || '']
          );
          imported++;
        }
      } catch (e) {
        console.error(`[旧设备导入] 导入第${i}行失败:`, e.message);
      }
    }
    
    console.log(`[旧设备导入] 导入完成: 新增 ${imported} 条, 更新 ${updated} 条, 跳过 ${skipped} 条`);
    
    // 4. 统计总数
    const [count] = await connection.execute('SELECT COUNT(*) as total FROM old_supplier_devices');
    console.log(`[旧设备导入] 当前 old_supplier_devices 表共有 ${count[0].total} 条记录`);
    
  } catch (e) {
    console.error('[旧设备导入] 失败:', e.message);
    throw e;
  } finally {
    if (connection) {
      await connection.end();
      console.log('[旧设备导入] 数据库连接已关闭');
    }
  }
}

// 执行
importOldSupplierDevices()
  .then(() => {
    console.log('[旧设备导入] 全部完成');
    process.exit(0);
  })
  .catch(e => {
    console.error('[旧设备导入] 错误:', e);
    process.exit(1);
  });
