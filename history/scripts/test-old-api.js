/**
 * 测试新I日供应商API
 */

require('dotenv').config();
const oldService = require('../services/oldSupplierService');

async function test() {
  console.log('========== 测试新I日供应商API ==========');
  console.log('');

  // 1. 测试签名生成
  console.log('[1] 测试签名生成...');
  const timestamp = oldService.getTimestamp();
  const sign = oldService.generateSign(timestamp);
  console.log(`   时间戳: ${timestamp}`);
  console.log(`   签名: ${sign}`);
  console.log('');

  // 2. 导入设备映射表
  console.log('[2] 导入设备映射表...');
  try {
    const path = require('path');
    const csvPath = path.join(__dirname, '终端映射表_清理版.csv');
    const result = await oldService.importDeviceMapping(csvPath);
    console.log(`   导入结果: 成功 ${result.imported} 条, 跳过 ${result.skipped} 条`);
  } catch (e) {
    console.error(`   导入失败: ${e.message}`);
  }
  console.log('');

  // 3. 测试单个设备API调用
  console.log('[3] 测试单个设备API调用...');
  try {
    // 使用第一个设备进行测试
    const db = require('../services/db');
    const devices = await db.queryAll('SELECT * FROM old_supplier_devices LIMIT 1');
    
    if (devices.length > 0) {
      const device = devices[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      console.log(`   设备: ${device.macid} (${device.cooperative_name})`);
      console.log(`   日期: ${dateStr}`);
      
      const result = await oldService.getAreaData(device.macid, dateStr);
      console.log(`   API响应:`, JSON.stringify(result, null, 2));
      
      const area = oldService.parseAreaResult(result);
      console.log(`   解析面积: ${area} 亩`);
    } else {
      console.log('   没有设备数据');
    }
  } catch (e) {
    console.error(`   测试失败: ${e.message}`);
    console.error(e.stack);
  }
  console.log('');

  // 4. 测试同步功能（不实际执行，仅展示）
  console.log('[4] 同步功能说明:');
  console.log('   - 启用同步: 设置 ENABLE_OLD_SYNC=true');
  console.log('   - 手动同步单天: POST /api/old-api/sync { date: "2026-04-11" }');
  console.log('   - 批量同步: POST /api/old-api/sync { startDate: "2026-04-01", endDate: "2026-04-11" }');
  console.log('   - 自动同步: 每天凌晨4点自动同步昨天数据');
  console.log('');

  console.log('========== 测试完成 ==========');
}

test().catch(console.error);
