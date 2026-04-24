/**
 * 创建设备映射表并导入CSV数据
 * @description 建立北斗设备(旧供应商)与云途安设备的对应关系
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mysql = require('mysql2/promise');

async function createDeviceMappingTable() {
  console.log('[设备映射] 开始创建设备映射表...');
  
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
    
    console.log('[设备映射] 数据库连接成功');
    
    // 2. 创建设备映射表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS device_mapping (
        id INT AUTO_INCREMENT PRIMARY KEY,
        old_t_number VARCHAR(50) NOT NULL COMMENT '北斗/旧供应商终端号',
        yt_t_number VARCHAR(50) DEFAULT NULL COMMENT '云途安终端号',
        plate_no VARCHAR(50) DEFAULT NULL COMMENT '车牌号',
        driver_name VARCHAR(100) DEFAULT NULL COMMENT '机手姓名',
        org_name VARCHAR(255) DEFAULT NULL COMMENT '合作社名称',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_old_t_number (old_t_number),
        INDEX idx_yt_t_number (yt_t_number),
        INDEX idx_plate_no (plate_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='北斗-云途安设备映射表'
    `);
    
    console.log('[设备映射] 表创建成功');
    
    // 3. 读取CSV文件
    const csvPath = path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('[设备映射] CSV文件不存在:', csvPath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    console.log(`[设备映射] 读取到 ${lines.length - 1} 条记录`);
    
    // 4. 解析并导入数据
    let imported = 0;
    let skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length < 3) continue;
      
      const [tNumber, orgName, driverName] = parts.map(p => p.trim());
      
      if (!tNumber) continue;
      
      try {
        // 检查是否已存在
        const [existing] = await connection.execute(
          'SELECT id FROM device_mapping WHERE old_t_number = ?',
          [tNumber]
        );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // 插入新记录
        await connection.execute(
          `INSERT INTO device_mapping (old_t_number, org_name, driver_name) 
           VALUES (?, ?, ?)`,
          [tNumber, orgName || '', driverName || '']
        );
        
        imported++;
      } catch (e) {
        console.error(`[设备映射] 导入第${i}行失败:`, e.message);
      }
    }
    
    console.log(`[设备映射] 导入完成: 新增 ${imported} 条, 跳过 ${skipped} 条`);
    
  } catch (e) {
    console.error('[设备映射] 创建失败:', e.message);
    throw e;
  } finally {
    if (connection) {
      await connection.end();
      console.log('[设备映射] 数据库连接已关闭');
    }
  }
}

// 执行
createDeviceMappingTable()
  .then(() => {
    console.log('[设备映射] 全部完成');
    process.exit(0);
  })
  .catch(e => {
    console.error('[设备映射] 错误:', e);
    process.exit(1);
  });
