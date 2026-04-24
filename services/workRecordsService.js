/**
 * work_records 表的增删改查功能
 * 
 * 注意：此模块通过展开语法被引入 db.js 中
 * 为了避免循环依赖，数据库操作函数在函数调用时动态获取
 */

// 获取数据库操作函数（延迟加载，避免循环依赖）
function getDbFunctions() {
  const db = require('./db');
  return {
    queryOne: db.queryOne,
    queryAll: db.queryAll,
    runSql: db.runSql
  };
}

// ==================== 查询列表 ====================
async function getWorkRecords(filters = {}) {
  const { queryOne, queryAll } = getDbFunctions();
  const page = parseInt(filters.page) || 1;
  const pageSize = parseInt(filters.pageSize) || 50;
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 时间范围筛选
  if (filters.startDate) {
    whereClause += ' AND work_date >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    whereClause += ' AND work_date <= ?';
    params.push(filters.endDate);
  }

  // 合作社筛选
  if (filters.orgId) {
    whereClause += ' AND org_id = ?';
    params.push(parseInt(filters.orgId));
  }

  // 作业类型筛选（简写）
  if (filters.workType) {
    whereClause += ' AND work_type_name LIKE ?';
    params.push(`%${filters.workType}%`);
  }

  // 设备号筛选
  if (filters.tNumber) {
    whereClause += ' AND t_number LIKE ?';
    params.push(`%${filters.tNumber}%`);
  }

  // 数据源筛选
  if (filters.source) {
    // 当选择"旧供应商"时，同时查询 'old' 和 'old_api' 两种类型
    if (filters.source === 'old') {
      whereClause += ' AND source IN (?, ?)';
      params.push('old', 'old_api');
    } else {
      whereClause += ' AND source = ?';
      params.push(filters.source);
    }
  }

  // 查询总数
  const countResult = await queryOne(
    `SELECT COUNT(*) as total FROM work_records ${whereClause}`,
    params
  );
  const total = countResult.total || 0;

  // 查询列表
  const records = await queryAll(
    `SELECT 
      id,
      t_number,
      work_date,
      work_type,
      work_type_name,
      acre,
      ok_acre,
      plate_no,
      driver_name,
      org_id,
      org_name,
      land_group,
      county,
      api_id,
      source,
      created_at,
      updated_at
    FROM work_records 
    ${whereClause}
    ORDER BY work_date DESC, id DESC
    LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`,
    params
  );

  // 将UTC时间转换为本地日期格式（YYYY-MM-DD）
  records.forEach(record => {
    if (record.work_date) {
      const date = new Date(record.work_date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      record.work_date = `${year}-${month}-${day}`;
    }
  });

  return {
    records,
    total,
    page,
    pageSize
  };
}

// ==================== 查询单条记录 ====================
async function getWorkRecordById(id) {
  const { queryOne } = getDbFunctions();
  const record = await queryOne(
    `SELECT * FROM work_records WHERE id = ?`,
    [id]
  );
  
  // 将UTC时间转换为本地日期格式（YYYY-MM-DD）
  if (record && record.work_date) {
    const date = new Date(record.work_date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    record.work_date = `${year}-${month}-${day}`;
  }
  
  return record;
}

// ==================== 更新记录 ====================
async function updateWorkRecord(id, updates) {
  const { runSql } = getDbFunctions();
  const allowedFields = [
    'acre', 'ok_acre', 'plate_no', 'driver_name', 
    'org_id', 'org_name', 'work_type_name'
  ];

  const setClauses = [];
  const values = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('没有可更新的字段');
  }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const sql = `UPDATE work_records SET ${setClauses.join(', ')} WHERE id = ?`;
  await runSql(sql, values);
}

// ==================== 删除记录 ====================
async function deleteWorkRecord(id) {
  const { runSql } = getDbFunctions();
  await runSql(`DELETE FROM work_records WHERE id = ?`, [id]);
}

// ==================== 批量更新 ====================
async function batchUpdateWorkRecords(ids, updates) {
  const { runSql } = getDbFunctions();
  if (!ids || ids.length === 0) {
    throw new Error('ID列表不能为空');
  }

  const allowedFields = [
    'acre', 'ok_acre', 'plate_no', 'driver_name', 
    'org_id', 'org_name', 'work_type_name'
  ];

  const setClauses = [];
  const values = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('没有可更新的字段');
  }

  setClauses.push('updated_at = NOW()');

  const placeholders = ids.map(() => '?').join(',');
  const sql = `UPDATE work_records SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`;
  
  await runSql(sql, [...values, ...ids]);
}

// ==================== 批量删除 ====================
async function batchDeleteWorkRecords(ids) {
  const { runSql } = getDbFunctions();
  if (!ids || ids.length === 0) {
    throw new Error('ID列表不能为空');
  }

  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM work_records WHERE id IN (${placeholders})`;
  
  await runSql(sql, ids);
}

// ==================== 批量更新（支持仅传ids进行删除） ====================
async function batchUpdateOrDeleteWorkRecords(ids, updates) {
  if (!ids || ids.length === 0) {
    throw new Error('ID列表不能为空');
  }

  // 如果没有updates，执行删除
  if (!updates || Object.keys(updates).length === 0) {
    return await batchDeleteWorkRecords(ids);
  }

  // 否则执行更新
  return await batchUpdateWorkRecords(ids, updates);
}

// ==================== 统计信息 ====================
async function getWorkRecordsStats(filters = {}) {
  const { queryOne } = getDbFunctions();
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (filters.startDate) {
    whereClause += ' AND work_date >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    whereClause += ' AND work_date <= ?';
    params.push(filters.endDate);
  }
  if (filters.source) {
    // 当选择"旧供应商"时，同时查询 'old' 和 'old_api' 两种类型
    if (filters.source === 'old') {
      whereClause += ' AND source IN (?, ?)';
      params.push('old', 'old_api');
    } else {
      whereClause += ' AND source = ?';
      params.push(filters.source);
    }
  }

  const stats = await queryOne(`
    SELECT 
      COUNT(*) as total,
      SUM(acre) as total_acre,
      COUNT(DISTINCT t_number) as machine_count,
      COUNT(DISTINCT org_name) as org_count
    FROM work_records 
    ${whereClause}
  `, params);

  return stats;
}

module.exports = {
  getWorkRecords,
  getWorkRecordById,
  updateWorkRecord,
  deleteWorkRecord,
  batchUpdateWorkRecords,
  batchDeleteWorkRecords,
  batchUpdateOrDeleteWorkRecords,
  getWorkRecordsStats
};
