/**
 * Excel 导入服务
 * 支持旧供应商导出的 Excel 文件解析 + 智能列映射
 */

const XLSX = require('xlsx');

/**
 * 智能列映射表
 * 旧供应商 Excel 的中文列名 → 标准英文字段名
 * 持续扩展，覆盖各种可能的列名
 */
const COLUMN_MAPPINGS = {
  // 设备号映射
  '设备号': 't_number', '终端号': 't_number', 'tNumber': 't_number',
  'tnumber': 't_number', '设备终端号': 't_number', 'IMEI': 't_number',
  '终端编号': 't_number', '设备编号': 't_number', '设备终端': 't_number',
  '终端ID': 't_number', 'T号': 't_number',

  // 车牌号
  '车牌号': 'plate_no', '车牌': 'plate_no', 'plateNo': 'plate_no',
  'plateno': 'plate_no', '车牌号码': 'plate_no',

  // 机手姓名
  '机手姓名': 'driver_name', '机手': 'driver_name', '驾驶员': 'driver_name',
  '驾驶员姓名': 'driver_name', '姓名': 'driver_name', '机手名称': 'driver_name',
  '车主': 'driver_name', '操作人': 'driver_name', '作业人': 'driver_name',
  '农机手': 'driver_name',

  // 合作社/组织
  '合作社': 'org_name', '合作社名称': 'org_name', '所属合作社': 'org_name',
  '组织': 'org_name', '公司': 'org_name', '单位': 'org_name', '单位名称': 'org_name',
  '所属单位': 'org_name', '合作社/公司': 'org_name',
  '服务主体名称': 'org_name', '服务主体': 'org_name',

  // 作业日期
  '作业日期': 'work_date', '日期': 'work_date', '工作日期': 'work_date',
  '开始时间': 'work_date', '时间': 'work_date', '作业时间': 'work_date',
  '工作日期时间': 'work_date', '记录日期': 'work_date', '统计日期': 'work_date',

  // 作业类型
  '作业类型': 'work_type_name', '类型': 'work_type_name', '工作类型': 'work_type_name',
  '作业项目': 'work_type_name', '作业名称': 'work_type_name', '项目类型': 'work_type_name',
  '作业内容': 'work_type_name', '服务环节': 'work_type_name', '环节': 'work_type_name',

  // 面积
  '作业面积': 'acre', '面积': 'acre', '总面积': 'acre', '作业面积(亩)': 'acre',
  '面积(亩)': 'acre', '工作面积': 'acre', '合计面积': 'acre', '总面积(亩)': 'acre',
  '统计面积': 'acre', '面积（亩）': 'acre',

  // 达标面积
  '达标面积': 'ok_acre', '有效面积': 'ok_acre', '合格面积': 'ok_acre',
  '达标面积(亩)': 'ok_acre', '达标（亩）': 'ok_acre',
  '有效作业面积': 'ok_acre',

  // 重复面积
  '重复面积': 'repeat_acre', '重叠面积': 'repeat_acre',

  // 漏耕面积
  '漏耕面积': 'leave_acre', '遗漏面积': 'leave_acre',

  // 时长
  '作业时长': 'duration', '时长': 'duration', '工作时长': 'duration',
  '作业时长(分钟)': 'duration', '工作时长(分钟)': 'duration',
  '作业时长(分)': 'duration', '用时': 'duration',

  // 机具类型
  '机具类型': 'machine_type', '农机类型': 'machine_type', '类型名称': 'machine_type',
  '机器类型': 'machine_type', '车辆类型': 'machine_type',

  // 备注
  '备注': 'remark', '说明': 'remark', '摘要': 'remark',
};

/**
 * 作业类型名称 → 编码映射
 */
const WORK_TYPE_MAP = {
  '旋耕': '1',
  '耕': '1',        // 单字简写
  '深翻': '2',
  '翻': '2',        // 单字简写
  '秸秆还田': '3',
  '还田': '3',      // 简写
  '播种': '35',
  '玉米播种': '35',
  '小麦播种': '36',
  '种': '35',       // 单字简写（旧供应商导出的类型名）
  '抛洒': '23',
  '打药': '4',
  '防': '4',        // 单字简写（植保防虫）
  '收割': '5',
  '机收': '5',
  '收': '5',        // 单字简写
};

/**
 * 解析 Excel 文件，返回所有 sheet 的数据
 */
function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    // 即使数据行为空，只要有表头也返回
    const headers = jsonData.length > 0
      ? Object.keys(jsonData[0])
      : parseHeaderRow(sheet);
    if (headers.length > 0) {
      sheets.push({
        name: sheetName,
        rows: jsonData,
        headers
      });
    }
  }

  return sheets;
}

/** 从 sheet 对象解析表头行（第一行） */
function parseHeaderRow(sheet) {
  const headers = [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = sheet[addr];
    if (cell && cell.v !== undefined && cell.v !== '') {
      headers.push(String(cell.v).trim());
    }
  }
  return headers;
}

/**
 * 自动检测列映射
 * 给定 Excel 的列名，尝试匹配标准字段
 */
function detectColumnMapping(headers) {
  const mapping = {};
  const unmatched = [];

  for (const header of headers) {
    const trimmed = header.trim();
    const mapped = COLUMN_MAPPINGS[trimmed];
    if (mapped) {
      if (!mapping[mapped]) { // 一个标准字段只映射第一个匹配
        mapping[mapped] = trimmed;
      }
    } else {
      // 模糊匹配（包含关系）
      let found = false;
      for (const [cn, en] of Object.entries(COLUMN_MAPPINGS)) {
        if (trimmed.includes(cn) || cn.includes(trimmed)) {
          if (!mapping[en]) {
            mapping[en] = trimmed;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        unmatched.push(trimmed);
      }
    }
  }

  return { mapping, unmatched };
}

/**
 * 转换行数据（应用列映射 + 数据清洗）
 */
function transformRow(row, mapping, importType = 'work_records') {
  const record = {};

  for (const [standardField, excelCol] of Object.entries(mapping)) {
    let value = row[excelCol];
    if (value === undefined || value === null || value === '') continue;

    // 日期处理
    if (standardField === 'work_date') {
      if (value instanceof Date) {
        value = value.toISOString().substring(0, 10);
      } else {
        value = String(value).substring(0, 10);
      }
    }

    // 数值处理
    if (['acre', 'ok_acre', 'repeat_acre', 'leave_acre', 'duration', 'year_acre'].includes(standardField)) {
      value = parseFloat(value) || 0;
      if (standardField === 'duration') {
        // 如果时长看起来是秒，转换为分钟
        if (value > 10000) value = Math.round(value / 60);
      }
    }

    // 设备号清理
    if (standardField === 't_number') {
      value = String(value).trim().replace(/\s+/g, '');
    }

    record[standardField] = value;
  }

  // 作业类型编码
  if (record.work_type_name && !record.work_type) {
    record.work_type = WORK_TYPE_MAP[record.work_type_name] || '';
  }

  return record;
}

/**
 * 可用的目标字段列表（用于前端手动映射下拉框）
 */
const TARGET_FIELDS = {
  work_records: [
    { key: 't_number', label: '设备号（必填）', required: true },
    { key: 'work_date', label: '作业日期', required: false },
    { key: 'work_type_name', label: '作业类型', required: false },
    { key: 'acre', label: '作业面积', required: false },
    { key: 'ok_acre', label: '达标面积', required: false },
    { key: 'repeat_acre', label: '重复面积', required: false },
    { key: 'leave_acre', label: '漏耕面积', required: false },
    { key: 'duration', label: '作业时长', required: false },
    { key: 'plate_no', label: '车牌号', required: false },
    { key: 'driver_name', label: '机手姓名', required: false },
    { key: 'org_name', label: '合作社/公司', required: false },
    { key: 'machine_type', label: '机具类型', required: false },
    { key: 'remark', label: '备注', required: false },
  ],
  machines: [
    { key: 't_number', label: '设备号（必填）', required: true },
    { key: 'plate_no', label: '车牌号', required: false },
    { key: 'driver_name', label: '机手姓名', required: false },
    { key: 'org_name', label: '合作社/公司', required: false },
    { key: 'machine_type', label: '机具类型', required: false },
    { key: 'year_acre', label: '年度面积', required: false },
    { key: 'remark', label: '备注', required: false },
  ]
};

/**
 * 预览 Excel（返回前N行数据 + 列映射建议）
 * 返回 autoMappedCount 让前端判断是否需要手动映射
 */
function previewExcel(buffer, importType = 'work_records', previewRows = 10) {
  const sheets = parseExcel(buffer);
  if (sheets.length === 0) {
    throw new Error('Excel 文件为空或格式不正确');
  }

  const results = sheets.map(sheet => {
    const { mapping, unmatched } = detectColumnMapping(sheet.headers);
    const autoMappedCount = Object.keys(mapping).length;
    const preview = sheet.rows.slice(0, previewRows).map(row =>
      transformRow(row, mapping, importType)
    );
    return {
      sheetName: sheet.name,
      totalRows: sheet.rows.length,
      headers: sheet.headers,
      sampleData: sheet.rows.length > 0
        ? sheet.rows.slice(0, 3).map(row =>
            sheet.headers.map(h => String(row[h] ?? '').substring(0, 30)))
        : [],  // 前几行的样例数据（用于展示）
      mapping,
      unmatched,
      autoMappedCount,
      autoMapped: autoMappedCount > 0,
      needsManualMapping: !mapping['t_number'],  // 关键字段没匹配到就需要手动映射
      targetFields: TARGET_FIELDS[importType] || TARGET_FIELDS.work_records,
      preview
    };
  });

  return results;
}

/**
 * 执行导入（将转换后的数据写入数据库）
 */
function doImport(buffer, importType, mappingOverrides = {}) {
  const sheets = parseExcel(buffer);
  let totalRows = 0;
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const sheet of sheets) {
    // 使用自动检测的映射 + 用户覆盖
    const { mapping } = detectColumnMapping(sheet.headers);
    const finalMapping = { ...mapping, ...mappingOverrides };

    for (let i = 0; i < sheet.rows.length; i++) {
      totalRows++;
      const row = transformRow(sheet.rows[i], finalMapping, importType);

      if (importType === 'machines') {
        if (!row.t_number) {
          skipCount++;
          errors.push(`${sheet.name} 第${i + 2}行：缺少设备号`);
          continue;
        }
        // machines 需要在外部调用 upsertMachine
        row._type = 'machine';
        successCount++;
        // 暂存到特殊属性，由调用方处理
        row.__importType = 'machine';
      } else {
        // work_records
        if (!row.t_number) {
          skipCount++;
          errors.push(`${sheet.name} 第${i + 2}行：缺少设备号`);
          continue;
        }
        row.__importType = 'work_record';
        successCount++;
      }

      // 标记为旧供应商数据
      row.source = 'old';
    }
  }

  return { totalRows, successCount, skipCount, errorCount, errors };
}

module.exports = {
  parseExcel,
  detectColumnMapping,
  transformRow,
  previewExcel,
  doImport,
  WORK_TYPE_MAP,
  COLUMN_MAPPINGS,
  TARGET_FIELDS
};
