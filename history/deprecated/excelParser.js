/**
 * Excel解析服务
 * 解析旧供应商导出的作业数据Excel文件
 */

const XLSX = require('xlsx');
const db = require('./db');
const fs = require('fs');

/**
 * 解析Excel文件
 * @param {string} filePath - Excel文件路径
 * @returns {Array} 解析后的记录数组
 */
function parseExcel(filePath) {
  try {
    console.log(`[Excel解析] 读取文件: ${filePath}`);
    
    // 读取Excel文件
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length < 2) {
      throw new Error('Excel文件为空或格式不正确');
    }
    
    // 第一行是表头
    const headers = rawData[0].map(h => String(h).trim());
    console.log(`[Excel解析] 表头: ${headers.join(', ')}`);
    
    // 映射字段（支持多种可能的列名）
    const fieldMapping = {
      t_number: ['终端号', '设备号', 't_number', 'terminal_no'],
      work_date: ['作业时间', '作业日期', '日期', 'work_date', 'date'],
      work_type_name: ['作业类型', '类型', 'work_type', 'type'],
      acre: ['作业面积(亩)', '作业面积', '面积', 'acre', 'area'],
      plate_no: ['农机车牌', '车牌号', '车牌', 'plate_no', 'license'],
      driver_name: ['农机所属人', '机手', '驾驶员', 'driver_name', 'operator'],
      county: ['作业地区', '地区', 'county', 'region'],
      machine_type: ['农机类型', '类型', 'machine_type'],
      land_group: ['地块组', '围栏', 'GPS围栏', 'land_group', 'fence']
    };
    
    // 建立列索引映射
    const columnIndexMap = {};
    for (const [field, possibleNames] of Object.entries(fieldMapping)) {
      for (let i = 0; i < headers.length; i++) {
        if (possibleNames.includes(headers[i])) {
          columnIndexMap[field] = i;
          break;
        }
      }
    }
    
    console.log('[Excel解析] 字段映射:', Object.keys(columnIndexMap).join(', '));
    
    // 解析数据行
    const records = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      
      // 跳过空行
      if (!row || row.length === 0) continue;
      
      const record = {};
      
      // 提取各字段
      if (columnIndexMap.t_number !== undefined) {
        record.t_number = String(row[columnIndexMap.t_number] || '').trim();
      }
      
      if (columnIndexMap.work_date !== undefined) {
        const dateValue = row[columnIndexMap.work_date];
        record.work_date = formatDate(dateValue);
      }
      
      if (columnIndexMap.work_type_name !== undefined) {
        record.work_type_name = String(row[columnIndexMap.work_type_name] || '').trim();
      }
      
      if (columnIndexMap.acre !== undefined) {
        record.acre = parseFloat(row[columnIndexMap.acre]) || 0;
      }
      
      if (columnIndexMap.plate_no !== undefined) {
        record.plate_no = String(row[columnIndexMap.plate_no] || '').trim();
      }
      
      if (columnIndexMap.driver_name !== undefined) {
        record.driver_name = String(row[columnIndexMap.driver_name] || '').trim();
      }
      
      if (columnIndexMap.county !== undefined) {
        record.county = String(row[columnIndexMap.county] || '').trim();
      }
      
      if (columnIndexMap.machine_type !== undefined) {
        record.machine_type = String(row[columnIndexMap.machine_type] || '').trim();
      }
      
      if (columnIndexMap.land_group !== undefined) {
        const landGroupValue = row[columnIndexMap.land_group];
        record.land_group = landGroupValue ? String(landGroupValue).trim() : null;
      }
      
      // 必须有终端号和作业日期
      if (!record.t_number && !record.plate_no) {
        console.warn(`[Excel解析] 第${i + 1}行缺少终端号或车牌，跳过`);
        continue;
      }
      
      if (!record.work_date) {
        console.warn(`[Excel解析] 第${i + 1}行缺少作业日期，跳过`);
        continue;
      }
      
      // 如果没有终端号，用车牌号生成
      if (!record.t_number && record.plate_no) {
        record.t_number = generateTNumber(record.plate_no);
      }
      
      // 设置默认值
      record.source = 'old';
      record.ok_acre = record.acre; // 达标面积默认为作业面积
      record.repeat_acre = 0;
      record.leave_acre = 0;
      record.duration = 0;
      
      records.push(record);
    }
    
    console.log(`[Excel解析] ✅ 成功解析 ${records.length} 条记录`);
    return records;
    
  } catch (e) {
    console.error('[Excel解析] 失败:', e.message);
    throw e;
  }
}

/**
 * 格式化日期
 * @param {*} dateValue - 日期值（可能是字符串、数字或Date对象）
 * @returns {string} 格式化后的日期字符串 YYYY-MM-DD
 */
function formatDate(dateValue) {
  if (!dateValue) return '';
  
  // 如果是数字（Excel的日期序列号）
  if (typeof dateValue === 'number') {
    // Excel日期从1900-01-01开始
    const excelEpoch = new Date(1900, 0, 1);
    const actualDate = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
    return actualDate.toISOString().split('T')[0];
  }
  
  // 如果是字符串
  if (typeof dateValue === 'string') {
    const str = dateValue.trim();
    
    // 尝试匹配常见日期格式
    const patterns = [
      /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,  // YYYY-MM-DD 或 YYYY/MM/DD
      /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,  // MM-DD-YYYY 或 DD-MM-YYYY
    ];
    
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match) {
        let year, month, day;
        
        if (match[3].length === 4) {
          // 第一种格式：YYYY-MM-DD
          year = match[1];
          month = match[2].padStart(2, '0');
          day = match[3].padStart(2, '0');
        } else {
          // 第二种格式：MM-DD-YYYY
          month = match[1].padStart(2, '0');
          day = match[2].padStart(2, '0');
          year = match[3];
        }
        
        return `${year}-${month}-${day}`;
      }
    }
    
    // 尝试直接解析
    try {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      // 忽略
    }
  }
  
  // 如果是Date对象
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0];
  }
  
  return String(dateValue);
}

/**
 * 根据车牌号生成终端号
 * @param {string} plateNo - 车牌号
 * @returns {string} 终端号
 */
function generateTNumber(plateNo) {
  if (!plateNo) return '';
  // 简单规则：取车牌号的哈希或直接用拼音首字母
  // 这里使用简化的方式：车牌号 + 固定前缀
  return 'OLD_' + plateNo.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * 映射作业类型到标准类型
 * @param {string} workType - 原始作业类型
 * @returns {string} 标准化后的作业类型
 */
function mapWorkType(workType) {
  if (!workType) return '';
  
  const typeMap = {
    '旋耕': '旋耕',
    '深翻': '深翻',
    '秸秆还田': '秸秆还田',
    '玉米播种': '玉米播种',
    '播种': '播种',
    '打药': '打药',
    '玉米收获': '玉米收获',
    '收割': '收割'
  };
  
  return typeMap[workType] || workType;
}

/**
 * 解析Excel并导入数据库
 * @param {string} filePath - Excel文件路径
 * @param {string} source - 数据源标识
 * @returns {Object} 导入结果
 */
async function parseAndImport(filePath, source = 'old') {
  try {
    console.log('\n========== 开始解析并导入Excel ==========');
    
    // 1. 解析Excel
    const records = parseExcel(filePath);
    
    if (records.length === 0) {
      return {
        success: false,
        totalRecords: 0,
        newRecords: 0,
        skipRecords: 0,
        message: '没有可导入的记录'
      };
    }
    
    // 2. 批量导入数据库（直接插入，不去重）
    console.log(`[导入] 开始导入 ${records.length} 条记录...`);
    
    let newRecords = 0;
    let skipRecords = 0;
    
    for (const record of records) {
      try {
        // 直接插入新记录
        await db.runSql(
          `INSERT INTO work_records 
            (t_number, work_date, work_type_name, acre, ok_acre, repeat_acre, leave_acre, 
             duration, plate_no, driver_name, land_group, county, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            record.t_number, record.work_date, record.work_type_name || '',
            record.acre, record.ok_acre, record.repeat_acre, record.leave_acre,
            record.duration, record.plate_no, record.driver_name, record.land_group || null,
            record.county, source
          ]
        );
        newRecords++;
        
      } catch (e) {
        console.error(`[导入] 记录导入失败:`, e.message);
        skipRecords++;
      }
    }
    
    // 3. 刷新组织统计
    await db.refreshOrgStatsAll();
    
    // 4. 删除临时Excel文件
    try {
      fs.unlinkSync(filePath);
      console.log(`[清理] 已删除临时文件: ${filePath}`);
    } catch (e) {
      console.warn(`[清理] 删除文件失败:`, e.message);
    }
    
    const result = {
      success: true,
      totalRecords: records.length,
      newRecords,
      skipRecords
    };
    
    console.log('\n========== 导入完成 ==========');
    console.log(`总计: ${result.totalRecords} 条`);
    console.log(`新增: ${result.newRecords} 条`);
    console.log(`跳过: ${result.skipRecords} 条`);
    
    return result;
    
  } catch (e) {
    console.error('[导入] 失败:', e.message);
    
    // 清理临时文件
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      // 忽略
    }
    
    throw e;
  }
}

module.exports = {
  parseExcel,
  parseAndImport,
  formatDate,
  generateTNumber,
  mapWorkType
};
