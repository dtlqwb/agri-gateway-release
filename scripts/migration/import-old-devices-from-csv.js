/**
 * 从CSV文件导入旧供应商设备数据
 * 用法: node import-old-devices-from-csv.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

// CSV文件路径
const CSV_FILE = path.join(__dirname, 'templates', '旧供应商终端映射表.csv');

async function importDevices() {
  console.log('\n📦 开始导入旧供应商设备数据...\n');
  console.log('═'.repeat(60));
  
  try {
    // 1. 读取CSV文件
    console.log('📄 步骤1: 读取CSV文件');
    
    if (!fs.existsSync(CSV_FILE)) {
      console.error(`❌ 文件不存在: ${CSV_FILE}`);
      return;
    }
    
    const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    console.log(`   文件路径: ${CSV_FILE}`);
    console.log(`   总行数: ${lines.length - 1} (不含表头)\n`);
    
    // 2. 解析CSV数据
    console.log('📋 步骤2: 解析CSV数据');
    
    const devices = [];
    const header = lines[0].split(',').map(h => h.trim());
    
    console.log(`   表头: ${header.join(', ')}\n`);
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length >= 3) {
        const tNumber = values[0]; // 终端编号
        const coopName = values[1]; // 合作社名称
        const driverName = values[2]; // 机手姓名
        
        // 将终端编号转换为MD5（模拟旧系统的macid格式）
        const macid = crypto.createHash('md5').update(tNumber).digest('hex');
        
        devices.push({
          tNumber,
          macid,
          cooperative_name: coopName,
          driver_name: driverName,
          work_type_name: '' // CSV中没有作业类型，留空
        });
      }
    }
    
    console.log(`   ✅ 成功解析 ${devices.length} 条设备记录\n`);
    
    // 3. 连接数据库
    console.log('🔗 步骤3: 连接数据库');
    
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'agri_gateway'
    });
    
    console.log('   ✅ 数据库连接成功\n');
    
    // 4. 检查现有数据
    console.log('📊 步骤4: 检查现有数据');
    
    const [existingCount] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    
    console.log(`   当前表中已有 ${existingCount[0].total} 条记录\n`);
    
    // 5. 导入数据
    console.log('📥 步骤5: 导入数据到数据库');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (const device of devices) {
      try {
        // 检查是否已存在
        const [exists] = await connection.execute(
          'SELECT id FROM old_supplier_devices WHERE macid = ?',
          [device.macid]
        );
        
        if (exists.length > 0) {
          // 更新现有记录
          await connection.execute(
            `UPDATE old_supplier_devices 
             SET cooperative_name = ?, driver_name = ?
             WHERE macid = ?`,
            [device.cooperative_name, device.driver_name, device.macid]
          );
          skipCount++;
        } else {
          // 插入新记录
          await connection.execute(
            `INSERT INTO old_supplier_devices 
             (macid, cooperative_name, driver_name, work_type_name) 
             VALUES (?, ?, ?, ?)`,
            [device.macid, device.cooperative_name, device.driver_name, device.work_type_name]
          );
          successCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`   ❌ 导入失败: ${device.tNumber} - ${err.message}`);
      }
    }
    
    console.log('\n📈 导入结果统计:');
    console.log(`   ✅ 新增: ${successCount} 条`);
    console.log(`   🔄 更新: ${skipCount} 条`);
    console.log(`   ❌ 失败: ${errorCount} 条`);
    console.log(`   📊 总计: ${devices.length} 条\n`);
    
    // 6. 验证导入结果
    console.log('✅ 步骤6: 验证导入结果');
    
    const [finalCount] = await connection.execute(
      'SELECT COUNT(*) as total FROM old_supplier_devices'
    );
    
    console.log(`   表中现在共有 ${finalCount[0].total} 条记录\n`);
    
    // 显示示例数据
    console.log('📝 示例数据（前5条）:');
    const [samples] = await connection.execute(
      'SELECT macid, cooperative_name, driver_name FROM old_supplier_devices LIMIT 5'
    );
    
    samples.forEach((row, i) => {
      console.log(`   ${i+1}. ${row.macid.substring(0, 16)}... | ${row.cooperative_name} | ${row.driver_name}`);
    });
    
    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ 导入完成！\n');
    console.log('💡 下一步:');
    console.log('   1. 刷新页面 http://82.157.186.237:3000/index.html');
    console.log('   2. 应该能看到"旧供应商"区块和所有设备');
    console.log('   3. 如果需要设置作业类型，可以在前端编辑\n');
    
    await connection.end();
    
  } catch (err) {
    console.error('\n❌ 导入失败:', err.message);
    console.error('\n可能的原因:');
    console.error('1. 数据库连接配置错误 - 检查 .env 文件');
    console.error('2. MySQL服务未启动');
    console.error('3. 数据库表不存在 - 重启服务会自动创建');
    console.error('\n详细错误:', err);
  }
}

importDevices();
