/**
 * 旧供应商API服务（北斗设备/旧供应商API统一使用）
 * @module OldSupplierAPIService
 * @description 提供旧供应商API的数据获取、设备管理、数据同步等功能
 */

const axios = require('axios');
const crypto = require('crypto');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const { API_CONFIG, BUSINESS_CONFIG } = require('../config');

class OldSupplierAPIService {
  /**
   * 构造函数
   * @description 初始化API配置，从配置文件读取参数
   */
  constructor() {
    this.baseUrl = API_CONFIG.OLD_SUPPLIER.BASE_URL;
    this.user = API_CONFIG.OLD_SUPPLIER.USER;
    this.key = API_CONFIG.OLD_SUPPLIER.KEY;
    this.enabled = API_CONFIG.OLD_SUPPLIER.ENABLED;
    this.timeout = API_CONFIG.OLD_SUPPLIER.TIMEOUT;
  }

  /**
   * 生成MD5签名
   * @param {string} timestamp - 时间戳（秒）
   * @returns {string} MD5签名字符串
   * @description 签名算法：MD5(timestamp + key)
   */
  generateSign(timestamp) {
    const data = timestamp + this.key;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 获取当前时间戳（毫秒）
   * @returns {string} 当前时间戳字符串（13位毫秒级）
   */
  getTimestamp() {
    return Date.now().toString();
  }

  /**
   * 调用API获取面积数据
   * @param {string} macid - 终端编号
   * @param {string} day - 日期，格式 YYYY-MM-DD
   * @returns {Promise<Object>} API响应数据
   * @throws {Error} 当API请求失败时抛出错误
   * @description 向旧供应商API发起POST请求，获取指定设备和日期的作业面积数据
   */
  async getAreaData(macid, day) {
    console.log(`[旧供应商API] 开始获取数据: macid=${macid}, day=${day}`);
    
    try {
      const timestamp = this.getTimestamp();
      const sign = this.generateSign(timestamp);

      console.log(`[旧供应商API] 发送请求: ${this.baseUrl}/machine/gps/area`);
      
      const response = await axios.post(
        `${this.baseUrl}/machine/gps/area`,
        `macid=${encodeURIComponent(macid)}&day=${encodeURIComponent(day)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            'user': this.user,
            'timestamp': timestamp,
            'sign': sign
          },
          timeout: this.timeout
        }
      );

      console.log(`[旧供应商API] 请求成功: macid=${macid}`);
      return response.data;
    } catch (error) {
      const errorMsg = error.response ? 
        `HTTP ${error.response.status}: ${error.response.statusText}` : 
        error.message;
      console.error(`[旧供应商API] 获取数据失败: macid=${macid}, day=${day}, 错误: ${errorMsg}`);
      throw new Error(`获取面积数据失败: ${errorMsg}`);
    }
  }

  /**
   * 导入CSV映射表到数据库
   */
  async importDeviceMapping(csvPath) {
    try {
      console.log('[旧供应商] 开始导入设备映射表...');
      
      if (!fs.existsSync(csvPath)) {
        console.error(`[旧供应商] CSV文件不存在: ${csvPath}`);
        return { imported: 0, skipped: 0 };
      }

      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        console.log('[旧供应商] CSV文件为空');
        return { imported: 0, skipped: 0 };
      }

      let imported = 0;
      let skipped = 0;

      // 跳过表头，从第二行开始
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 解析CSV行（简单分割，假设没有逗号在字段内）
        const parts = line.split(',');
        if (parts.length < 3) {
          console.warn(`[旧供应商] 第${i + 1}行格式错误，跳过`);
          skipped++;
          continue;
        }

        const macid = parts[0].trim();
        const cooperativeName = parts[1].trim();
        const driverName = parts[2].trim();

        if (!macid) {
          console.warn(`[旧供应商] 第${i + 1}行缺少终端编号，跳过`);
          skipped++;
          continue;
        }

        try {
          // 使用upsert避免重复
          await db.queryOne(
            `INSERT INTO old_supplier_devices (macid, cooperative_name, driver_name) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE 
               cooperative_name = VALUES(cooperative_name),
               driver_name = VALUES(driver_name)`,
            [macid, cooperativeName, driverName]
          );
          imported++;
        } catch (error) {
          console.error(`[旧供应商] 导入设备 ${macid} 失败:`, error.message);
          skipped++;
        }
      }

      console.log(`[旧供应商] 设备映射表导入完成: 成功 ${imported} 条, 跳过 ${skipped} 条`);
      return { imported, skipped };
    } catch (error) {
      console.error('[旧供应商] 导入映射表失败:', error.message);
      throw error;
    }
  }

  /**
   * 同步指定日期的所有设备数据
   * @param {string} date - 日期 YYYY-MM-DD，默认为昨天
   * @returns {Object} 同步结果
   */
  async syncDayData(date = null) {
    if (!this.enabled) {
      console.log('[旧供应商] 同步功能未启用（设置 ENABLE_OLD_SYNC=true 以启用）');
      return { success: false, message: '功能未启用' };
    }

    // 默认同步昨天的数据
    if (!date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().split('T')[0];
    }

    console.log(`[旧供应商] 开始同步 ${date} 的数据...`);
    const startTime = Date.now();

    try {
      // 获取所有设备
      const devices = await db.queryAll('SELECT * FROM old_supplier_devices');
      
      if (devices.length === 0) {
        console.log('[旧供应商] 没有设备数据，请先导入映射表');
        return { success: false, message: '没有设备数据' };
      }

      console.log(`[旧供应商] 共 ${devices.length} 台设备，API查询保持串行，数据库批量写入（每300条）`);

      let successCount = 0;
      let failCount = 0;
      let totalAcre = 0;
      let apiCount = 0;
      
      // 批量插入缓冲区
      const BATCH_INSERT_SIZE = 300;
      const insertBuffer = [];

      // 逐个设备查询API（旧供应商API不支持批量查询）
      for (const device of devices) {
        apiCount++;
        try {
          const result = await this.getAreaData(device.macid, date);
          
          // 解析API响应
          const area = this.parseAreaResult(result);
          
          if (area > 0) {
            // 收集到缓冲区，而不是立即写入
            insertBuffer.push({
              macid: device.macid,
              cooperative_name: device.cooperative_name,
              driver_name: device.driver_name,
              date: date,
              area: area
            });
            
            successCount++;
            totalAcre += area;
            
            // 缓冲区满300条，批量写入数据库
            if (insertBuffer.length >= BATCH_INSERT_SIZE) {
              console.log(`[旧供应商] 缓冲区满 ${BATCH_INSERT_SIZE} 条，执行批量插入...`);
              await this.batchInsertWorkRecords(insertBuffer);
              insertBuffer.length = 0; // 清空缓冲区
            }
          }
        } catch (error) {
          failCount++;
          console.error(`  ❌ ${device.macid}: ${error.message}`);
        }

        // 每10个设备输出一次进度
        if (apiCount % 10 === 0) {
          console.log(`[旧供应商] API查询进度: ${apiCount}/${devices.length}，待插入: ${insertBuffer.length}`);
        }

        // 避免请求过快，间隔50ms
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // 处理剩余不足300条的数据
      if (insertBuffer.length > 0) {
        console.log(`[旧供应商] 处理剩余 ${insertBuffer.length} 条数据，执行批量插入...`);
        await this.batchInsertWorkRecords(insertBuffer);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[旧供应商] 同步完成: 成功 ${successCount}, 失败 ${failCount}, 总面积 ${totalAcre.toFixed(2)} 亩, 耗时 ${elapsed}秒`);

      return {
        success: true,
        date,
        totalDevices: devices.length,
        successCount,
        failCount,
        totalAcre,
        batchCount: Math.ceil(successCount / BATCH_INSERT_SIZE),
        elapsedSeconds: parseFloat(elapsed)
      };
    } catch (error) {
      console.error('[旧供应商] 同步失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 批量插入作业记录到数据库
   * @param {Array} records - 待插入的记录数组
   */
  async batchInsertWorkRecords(records) {
    if (!records || records.length === 0) return;

    try {
      // 获取所有设备的作业类型（批量查询）
      const macids = records.map(r => r.macid);
      const workTypes = await this.batchGetDeviceWorkTypes(macids);

      // 构建批量插入SQL
      const values = [];
      const params = [];

      for (const record of records) {
        const workTypeName = workTypes[record.macid] || '其他';
        
        // 查找org_id
        let orgId = 0;
        if (record.cooperative_name) {
          const org = await db.queryOne(
            'SELECT id FROM organizations WHERE name = ?',
            [record.cooperative_name]
          );
          if (org) orgId = org.id;
        }

        values.push('(?, ?, ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())');
        params.push(
          record.macid,
          record.date,
          workTypeName,
          record.area,
          orgId,
          record.cooperative_name,
          record.driver_name,
          'old_api'
        );
      }

      // 执行批量插入（使用ON DUPLICATE KEY UPDATE处理重复）
      const sql = `
        INSERT INTO work_records 
        (t_number, work_date, work_type_name, acre, ok_acre, 
         org_id, org_name, driver_name, source, created_at, updated_at)
        VALUES ${values.join(',')}
        ON DUPLICATE KEY UPDATE 
        acre = VALUES(acre),
        ok_acre = VALUES(ok_acre),
        work_type_name = VALUES(work_type_name),
        org_id = VALUES(org_id),
        org_name = VALUES(org_name),
        driver_name = VALUES(driver_name),
        updated_at = NOW()
      `;

      await db.runSql(sql, params);
      console.log(`[旧供应商] 批量插入完成: ${records.length} 条`);
    } catch (error) {
      console.error('[旧供应商] 批量插入失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量获取设备作业类型
   * @param {Array} macids - 设备MACID数组
   * @returns {Object} - {macid: workTypeName}
   */
  async batchGetDeviceWorkTypes(macids) {
    const workTypes = {};
    
    // 批量查询所有设备的作业类型
    const placeholders = macids.map(() => '?').join(',');
    const rows = await db.queryAll(
      `SELECT macid, work_type_name FROM old_supplier_devices WHERE macid IN (${placeholders})`,
      macids
    );
    
    for (const row of rows) {
      workTypes[row.macid] = row.work_type_name || '其他';
    }
    
    return workTypes;
  }

  /**
   * 解析API返回的面积数据
   * API返回格式: { "code": 200, "data": "2.6793", "message": "请求成功" }
   * @param {Object} result - API响应对象
   * @returns {number} 作业面积（亩）
   */
  parseAreaResult(result) {
    if (!result) return 0;
    
    // 检查业务code
    if (result.code !== 200 && result.code !== '200') {
      console.warn(`[旧供应商API] 业务错误: code=${result.code}, message=${result.message}`);
      return 0;
    }
    
    // data字段直接是面积字符串
    if (result.data !== undefined && result.data !== null) {
      const area = parseFloat(result.data);
      return isNaN(area) ? 0 : area;
    }
    
    return 0;
  }

  /**
   * 保存数据到work_records表
   */
  async saveToWorkRecords(device, date, area) {
    try {
      // 获取设备的当前作业类型（默认"其他"）
      const workTypeName = await db.getDeviceWorkType(device.macid);

      // 根据合作社名称查找 org_id
      let orgId = 0;
      if (device.cooperative_name) {
        const org = await db.queryOne(
          `SELECT id FROM organizations WHERE name = ?`,
          [device.cooperative_name]
        );
        if (org) {
          orgId = org.id;
        }
      }

      // 检查是否已存在（同一天同一设备）
      const existing = await db.queryOne(
        `SELECT id FROM work_records 
         WHERE t_number = ? AND work_date = ? AND source = 'old_api'`,
        [device.macid, date]
      );

      if (existing) {
        // 更新现有记录
        await db.runSql(
          `UPDATE work_records 
           SET acre = ?, ok_acre = 0, work_type_name = ?,
               org_id = ?, org_name = ?, driver_name = ?, updated_at = NOW()
           WHERE id = ?`,
          [area, workTypeName, orgId, device.cooperative_name, device.driver_name, existing.id]
        );
      } else {
        // 插入新记录
        await db.runSql(
          `INSERT INTO work_records 
           (t_number, work_date, work_type_name, acre, ok_acre, 
            org_id, org_name, driver_name, source, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'old_api', NOW())`,
          [device.macid, date, workTypeName, area, orgId, device.cooperative_name, device.driver_name]
        );
      }
    } catch (error) {
      console.error(`[旧供应商] 保存数据失败:`, error.message);
      throw error;
    }
  }

  /**
   * 批量同步日期范围
   * @param {string} startDate - 开始日期 YYYY-MM-DD
   * @param {string} endDate - 结束日期 YYYY-MM-DD
   */
  async syncDateRange(startDate, endDate) {
    console.log(`[旧供应商] 批量同步: ${startDate} 至 ${endDate}`);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const results = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const result = await this.syncDayData(dateStr);
      results.push(result);
      
      // 每天之间间隔1秒
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * 获取统计信息
   */
  async getStats(startDate = null, endDate = null) {
    let dateCond = '';
    const params = ['old_api'];

    if (startDate) {
      dateCond += ' AND work_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateCond += ' AND work_date <= ?';
      params.push(endDate);
    }

    // 按合作社统计
    const byOrg = await db.queryAll(`
      SELECT org_name as cooperative_name,
             SUM(acre) as total_acre,
             COUNT(DISTINCT t_number) as device_count,
             COUNT(*) as record_count
      FROM work_records 
      WHERE source = 'old_api'${dateCond}
      GROUP BY org_name
      ORDER BY total_acre DESC
    `, params);

    // 总计
    const total = await db.queryOne(`
      SELECT SUM(acre) as total_acre,
             COUNT(DISTINCT t_number) as device_count,
             COUNT(*) as record_count
      FROM work_records 
      WHERE source = 'old_api'${dateCond}
    `, params);

    return {
      total: total || { total_acre: 0, device_count: 0, record_count: 0 },
      byOrg
    };
  }
}

// 导出单例
module.exports = new OldSupplierAPIService();
