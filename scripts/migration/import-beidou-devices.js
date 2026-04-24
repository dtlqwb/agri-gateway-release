/**
 * 北斗设备映射表导入脚本
 * @description 从CSV文件导入设备映射表到 old_supplier_devices 表
 * @example node scripts/import-beidou-devices.js
 */

// 加载环境变量
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../services/db');

/**
 * 解析CSV文件
 * @param {string} filePath - CSV文件路径
 * @returns {Array} 设备数组
 */
function parseCSV(filePath) {
  console.log(`[CSV] 读取文件: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV文件格式错误：至少需要表头和一行数据');
  }
  
  // 解析表头
  const headers = lines[0].split(',').map(h => h.trim());
  console.log(`[CSV] 表头: ${headers.join(', ')}`);
  
  // 解析数据行
  const devices = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    
    if (values.length >= 3) {
      devices.push({
        macid: values[0],
        cooperative_name: values[1],
        driver_name: values[2]
      });
    }
  }
  
  console.log(`[CSV] 解析完成: ${devices.length} 条记录`);
  return devices;
}

/**
 * 导入设备到数据库
 * @param {Array} devices - 设备数组
 */
async function importDevices(devices) {
  console.log(`\n[导入] 开始导入 ${devices.length} 台设备...\n`);
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const device of devices) {
    try {
      // 检查是否已存在
      const existing = await db.queryOne(
        'SELECT id FROM old_supplier_devices WHERE macid = ?',
        [device.macid]
      );
      
      if (existing) {
        // 更新现有设备
        await db.runSql(
          `UPDATE old_supplier_devices 
           SET cooperative_name = ?, driver_name = ?, updated_at = NOW()
           WHERE macid = ?`,
          [device.cooperative_name, device.driver_name, device.macid]
        );
        updated++;
        console.log(`  ⚠️  更新: ${device.macid} (${device.cooperative_name})`);
      } else {
        // 插入新设备
        await db.runSql(
          `INSERT INTO old_supplier_devices 
           (macid, cooperative_name, driver_name, work_type_name, created_at, updated_at)
           VALUES (?, ?, ?, '其他', NOW(), NOW())`,
          [device.macid, device.cooperative_name, device.driver_name]
        );
        imported++;
        console.log(`  ✅ 新增: ${device.macid} (${device.cooperative_name})`);
      }
    } catch (error) {
      console.error(`  ❌ 失败: ${device.macid} - ${error.message}`);
      errors++;
    }
  }
  
  console.log(`\n========== 导入完成 ==========\n`);
  console.log(`✅ 新增: ${imported} 台`);
  console.log(`🔄 更新: ${updated} 台`);
  console.log(`⚠️  跳过: ${skipped} 台`);
  console.log(`❌ 失败: ${errors} 台`);
  console.log(`📊 总计: ${devices.length} 台`);
  console.log(`\n================================\n`);
  
  return { imported, updated, skipped, errors };
}

/**
 * 主函数
 */
async function main() {
  console.log('\n========== 北斗设备映射表导入 ==========\n');
  
  try {
    // 初始化数据库
    await db.init();
    console.log('[数据库] 连接成功\n');
    
    // 查找CSV文件
    const csvPaths = [
      path.join(__dirname, '..', '终端映射表_清理版.csv'),
      path.join(__dirname, '..', 'templates', '旧供应商终端映射表.csv')
    ];
    
    let csvFile = null;
    for (const csvPath of csvPaths) {
      if (fs.existsSync(csvPath)) {
        csvFile = csvPath;
        break;
      }
    }
    
    if (!csvFile) {
      console.error('[错误] 未找到CSV文件');
      console.error('请将CSV文件放在以下位置之一：');
      console.error('  - 终端映射表_清理版.csv');
      console.error('  - templates/旧供应商终端映射表.csv');
      process.exit(1);
    }
    
    console.log(`[文件] 找到CSV文件: ${csvFile}\n`);
    
    // 解析CSV
    const devices = parseCSV(csvFile);
    
    if (devices.length === 0) {
      console.error('[错误] CSV文件中没有数据');
      process.exit(1);
    }
    
    // 导入数据库
    await importDevices(devices);
    
    // 验证导入结果
    const count = await db.queryOne('SELECT COUNT(*) as count FROM old_supplier_devices');
    console.log(`[验证] 数据库中共有 ${count.count} 台设备\n`);
    
  } catch (error) {
    console.error('\n[错误] 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.close();
    console.log('[数据库] 连接已关闭\n');
  }
}

// 执行
main();
