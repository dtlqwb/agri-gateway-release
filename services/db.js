/**
 * MySQL 数据库服务
 * 存储云途安同步数据 + 旧供应商导入数据 + 导入记录
 * 
 * 层级关系：灵丘县 → 合作社/公司(organizations) → 农机(machines) → 作业记录(work_records)
 */

const mysql = require('mysql2/promise');
const path = require('path');

let pool = null;

// MySQL 配置（从环境变量读取）
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'agri_gateway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

/**
 * 初始化数据库连接池
 */
async function init() {
  try {
    // 先连接到 MySQL 服务器（不指定数据库）
    const tempPool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0
    });

    // 检查并创建数据库
    const [databases] = await tempPool.query(`SHOW DATABASES LIKE '${dbConfig.database}'`);
    if (databases.length === 0) {
      console.log(`[DB] 数据库 ${dbConfig.database} 不存在，正在创建...`);
      await tempPool.query(`CREATE DATABASE \`${dbConfig.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[DB] 数据库 ${dbConfig.database} 创建成功`);
    }

    await tempPool.end();

    // 创建正式连接池
    pool = mysql.createPool(dbConfig);
    console.log(`[DB] 已连接 MySQL 数据库: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

    // 建表
    await createTables();

    // 数据修复
    await repairAcreData();
    await repairMachineData();

    console.log('[DB] 数据库就绪');
  } catch (err) {
    console.error('[DB] 数据库初始化失败:', err.message);
    throw err;
  }
}

/**
 * 创建所有数据表
 */
async function createTables() {
  const connection = await pool.getConnection();
  try {
    // 合作社/公司表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL COMMENT '组织名称',
        short_name VARCHAR(100) DEFAULT '' COMMENT '简称',
        machine_count INT DEFAULT 0 COMMENT '设备数量',
        total_acre DECIMAL(12,2) DEFAULT 0 COMMENT '总面积',
        source VARCHAR(50) DEFAULT 'old' COMMENT '数据来源',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合作社/公司表'
    `);

    // 农机设备表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        t_number VARCHAR(50) NOT NULL COMMENT '终端号',
        plate_no VARCHAR(50) DEFAULT '' COMMENT '车牌号',
        driver_name VARCHAR(100) DEFAULT '' COMMENT '驾驶员姓名',
        driver_phone VARCHAR(20) DEFAULT '' COMMENT '驾驶员电话',
        org_id INT DEFAULT 0 COMMENT '所属组织ID',
        org_name VARCHAR(255) DEFAULT '' COMMENT '所属组织名称',
        machine_type VARCHAR(100) DEFAULT '' COMMENT '设备类型',
        source VARCHAR(50) DEFAULT 'old' COMMENT '数据来源',
        year_acre DECIMAL(12,2) DEFAULT 0 COMMENT '年度作业面积',
        remark TEXT COMMENT '备注',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_t_number (t_number),
        INDEX idx_org (org_id),
        INDEX idx_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='农机设备表'
    `);

    // 作业记录表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS work_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        t_number VARCHAR(50) NOT NULL COMMENT '终端号',
        work_date DATE DEFAULT NULL COMMENT '作业日期',
        work_type VARCHAR(50) DEFAULT '' COMMENT '作业类型代码',
        work_type_name VARCHAR(100) DEFAULT '' COMMENT '作业类型名称',
        acre DECIMAL(12,2) DEFAULT 0 COMMENT '作业面积',
        ok_acre DECIMAL(12,2) DEFAULT 0 COMMENT '达标面积',
        repeat_acre DECIMAL(12,2) DEFAULT 0 COMMENT '重复面积',
        leave_acre DECIMAL(12,2) DEFAULT 0 COMMENT '漏耕面积',
        duration INT DEFAULT 0 COMMENT '作业时长(秒)',
        org_id INT DEFAULT 0 COMMENT '所属组织ID',
        org_name VARCHAR(255) DEFAULT '' COMMENT '所属组织名称',
        plate_no VARCHAR(50) DEFAULT '' COMMENT '车牌号',
        driver_name VARCHAR(100) DEFAULT '' COMMENT '驾驶员姓名',
        land_group TEXT COMMENT 'GPS围栏多边形',
        county VARCHAR(100) DEFAULT '' COMMENT '作业地区',
        import_id INT DEFAULT NULL COMMENT '导入记录ID',
        api_id VARCHAR(100) DEFAULT NULL COMMENT '云途安API原始记录ID',
        source VARCHAR(50) DEFAULT 'old' COMMENT '数据来源',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_t_number (t_number),
        INDEX idx_work_date (work_date),
        INDEX idx_source (source),
        INDEX idx_org (org_id),
        INDEX idx_county (county),
        INDEX idx_api_id (api_id, source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作业记录表'
    `);

    // 导入记录表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS imports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL COMMENT '文件名',
        file_size INT DEFAULT 0 COMMENT '文件大小',
        import_type VARCHAR(50) DEFAULT '' COMMENT '导入类型',
        row_count INT DEFAULT 0 COMMENT '总行数',
        success_count INT DEFAULT 0 COMMENT '成功数',
        skip_count INT DEFAULT 0 COMMENT '跳过数',
        error_count INT DEFAULT 0 COMMENT '错误数',
        errors TEXT COMMENT '错误信息',
        status VARCHAR(50) DEFAULT 'completed' COMMENT '状态',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导入记录表'
    `);

    // 农户账号表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS farmers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE COMMENT '手机号',
        password VARCHAR(255) NOT NULL DEFAULT '123456' COMMENT '密码',
        name VARCHAR(100) DEFAULT '' COMMENT '姓名',
        org_id INT DEFAULT 0 COMMENT '所属组织ID',
        org_name VARCHAR(255) DEFAULT '' COMMENT '所属组织名称',
        role VARCHAR(50) DEFAULT 'farmer' COMMENT '角色',
        remark TEXT COMMENT '备注',
        enabled TINYINT DEFAULT 1 COMMENT '是否启用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_org (org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='农户账号表'
    `);

    // 云途安数据同步日志表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL DEFAULT 'yuntinan' COMMENT '同步类型',
        sync_date DATE NOT NULL COMMENT '同步日期',
        status VARCHAR(50) NOT NULL DEFAULT 'running' COMMENT '状态',
        total_records INT DEFAULT 0 COMMENT '总记录数',
        new_records INT DEFAULT 0 COMMENT '新增记录数',
        update_records INT DEFAULT 0 COMMENT '更新记录数',
        error TEXT COMMENT '错误信息',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
        finished_at DATETIME DEFAULT NULL COMMENT '完成时间',
        UNIQUE INDEX idx_type_date (sync_type, sync_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同步日志表'
    `);

    // 设备作业轨迹表（GPS点位）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS machine_tracks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        t_number VARCHAR(50) NOT NULL COMMENT '终端号',
        work_date DATE NOT NULL COMMENT '作业日期',
        track_time DATETIME NOT NULL COMMENT '轨迹时间点',
        longitude DECIMAL(10,6) NOT NULL COMMENT '经度',
        latitude DECIMAL(10,6) NOT NULL COMMENT '纬度',
        speed DECIMAL(8,2) DEFAULT 0 COMMENT '速度(km/h)',
        direction DECIMAL(8,2) DEFAULT 0 COMMENT '方向角(度)',
        altitude DECIMAL(10,2) DEFAULT 0 COMMENT '海拔(米)',
        work_type VARCHAR(50) DEFAULT '' COMMENT '作业类型',
        status VARCHAR(20) DEFAULT '' COMMENT '状态(在线/离线)',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_t_date (t_number, work_date),
        INDEX idx_track_time (track_time),
        INDEX idx_work_date (work_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备作业轨迹表'
    `);

    // API原始数据记录表（用于数据修复管理）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_raw_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        -- API原始值（只读）
        api_t_number VARCHAR(50) NOT NULL COMMENT 'API终端号',
        api_work_date DATE NOT NULL COMMENT 'API作业日期',
        api_work_type VARCHAR(50) DEFAULT '' COMMENT 'API作业类型代码',
        api_work_type_name VARCHAR(100) DEFAULT '' COMMENT 'API作业类型名称',
        api_acre DECIMAL(12,2) DEFAULT 0 COMMENT 'API作业面积',
        api_ok_acre DECIMAL(12,2) DEFAULT 0 COMMENT 'API达标面积',
        api_repeat_acre DECIMAL(12,2) DEFAULT 0 COMMENT 'API重复面积',
        api_leave_acre DECIMAL(12,2) DEFAULT 0 COMMENT 'API漏耕面积',
        api_duration INT DEFAULT 0 COMMENT 'API作业时长(秒)',
        api_land_group TEXT COMMENT 'API GPS围栏',
        api_county VARCHAR(100) DEFAULT '' COMMENT 'API作业地区',
        api_plate_no VARCHAR(50) DEFAULT '' COMMENT 'API车牌号',
        api_driver_name VARCHAR(100) DEFAULT '' COMMENT 'API机手姓名',
        api_org_name VARCHAR(255) DEFAULT '' COMMENT 'API合作社名称',
        -- 当前值（可编辑）
        current_acre DECIMAL(12,2) DEFAULT 0 COMMENT '当前作业面积',
        current_ok_acre DECIMAL(12,2) DEFAULT 0 COMMENT '当前达标面积',
        current_plate_no VARCHAR(50) DEFAULT '' COMMENT '当前车牌号',
        current_driver_name VARCHAR(100) DEFAULT '' COMMENT '当前机手姓名',
        current_org_id INT DEFAULT 0 COMMENT '当前合作社ID',
        current_org_name VARCHAR(255) DEFAULT '' COMMENT '当前合作社名称',
        -- 扩展字段
        source VARCHAR(50) DEFAULT 'yuntinan' COMMENT '数据来源',
        status TINYINT DEFAULT 1 COMMENT '状态：1有效 0删除',
        is_modified TINYINT DEFAULT 0 COMMENT '是否修改过',
        remark TEXT COMMENT '备注',
        -- 时间戳
        api_received_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'API接收时间',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        -- 索引
        UNIQUE INDEX idx_api_unique (api_t_number, api_work_date, api_work_type_name, source),
        INDEX idx_status (status),
        INDEX idx_modified (is_modified),
        INDEX idx_work_date (api_work_date),
        INDEX idx_org (current_org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API原始数据记录表'
    `);

    // 管理员表（分级权限）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL COMMENT '登录用户名',
        password VARCHAR(255) NOT NULL COMMENT '密码（明文，生产环境应加密）',
        name VARCHAR(100) DEFAULT '' COMMENT '姓名',
        role ENUM('super', 'viewer') DEFAULT 'viewer' COMMENT '角色：super=超管 viewer=只读',
        status TINYINT DEFAULT 1 COMMENT '状态：1启用 0禁用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_role (role),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员账号表'
    `);

    // 旧供应商抓取日志表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS crawl_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(50) DEFAULT 'old' COMMENT '数据源',
        status VARCHAR(20) DEFAULT 'running' COMMENT '状态：running/success/failed',
        total_records INT DEFAULT 0 COMMENT '总记录数',
        new_records INT DEFAULT 0 COMMENT '新增记录数',
        update_records INT DEFAULT 0 COMMENT '更新记录数',
        error_msg TEXT COMMENT '错误信息',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
        finished_at DATETIME DEFAULT NULL COMMENT '完成时间',
        INDEX idx_source_status (source, status),
        INDEX idx_started_at (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='旧供应商抓取日志表'
    `);

    // 新I日供应商设备映射表（北斗设备/旧供应商API统一使用）
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS old_supplier_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        macid VARCHAR(20) NOT NULL UNIQUE COMMENT '终端编号',
        cooperative_name VARCHAR(100) DEFAULT '' COMMENT '合作社名称',
        driver_name VARCHAR(50) DEFAULT '' COMMENT '机手姓名',
        work_type_name VARCHAR(100) DEFAULT '其他' COMMENT '当前作业类型',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_macid (macid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='北斗设备/旧供应商API设备映射表'
    `);

    // 初始化默认管理员账号（如果表为空）
    const adminCount = await queryOne(`SELECT COUNT(*) as cnt FROM admins`);
    if (adminCount.cnt === 0) {
      await runSql(`
        INSERT INTO admins (username, password, name, role, status) VALUES
        ('admin', 'admin123', '系统超管', 'super', 1),
        ('nongyeju', 'nongye123', '农业局管理员', 'viewer', 1)
      `);
      console.log('[DB] 已初始化默认管理员账号');
    }

    console.log('[DB] 数据表初始化完成');
  } finally {
    connection.release();
  }
}

/**
 * 执行查询并返回所有行
 */
async function queryAll(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * 执行查询并返回第一行
 */
async function queryOne(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 执行 INSERT/UPDATE/DELETE
 */
async function runSql(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * 保存设备作业轨迹（批量插入）
 * @param {Array} tracks - 轨迹点数组
 * @returns {Object} { inserted: number, skipped: number }
 */
async function saveMachineTracks(tracks) {
  if (!tracks || tracks.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  // 批量插入，使用 IGNORE 避免重复
  const sql = `
    INSERT IGNORE INTO machine_tracks 
      (t_number, work_date, track_time, longitude, latitude, speed, direction, altitude, work_type, status)
    VALUES ?
  `;

  const values = tracks.map(t => [
    t.tNumber,
    t.workDate,
    t.trackTime,
    t.longitude,
    t.latitude,
    t.speed || 0,
    t.direction || 0,
    t.altitude || 0,
    t.workType || '',
    t.status || ''
  ]);

  try {
    const [result] = await pool.execute(sql, [values]);
    inserted = result.affectedRows || 0;
    skipped = tracks.length - inserted;
    console.log(`[DB] 轨迹数据保存: 新增 ${inserted} 条, 跳过 ${skipped} 条`);
  } catch (err) {
    console.error('[DB] 轨迹数据保存失败:', err.message);
    // 如果批量插入失败，尝试逐条插入
    for (const t of tracks) {
      try {
        await runSql(
          `INSERT IGNORE INTO machine_tracks 
            (t_number, work_date, track_time, longitude, latitude, speed, direction, altitude, work_type, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.tNumber, t.workDate, t.trackTime, t.longitude, t.latitude, t.speed || 0, t.direction || 0, t.altitude || 0, t.workType || '', t.status || '']
        );
        inserted++;
      } catch (e) {
        skipped++;
      }
    }
  }

  return { inserted, skipped };
}

/**
 * 获取设备作业轨迹
 * @param {String} tNumber - 终端号
 * @param {String} workDate - 作业日期 (YYYY-MM-DD)
 * @returns {Array} 轨迹点数组
 */
async function getMachineTracks(tNumber, workDate) {
  const rows = await queryAll(
    `SELECT id, t_number, work_date, track_time, longitude, latitude, speed, direction, altitude, work_type, status
     FROM machine_tracks 
     WHERE t_number = ? AND work_date = ?
     ORDER BY track_time ASC`,
    [tNumber, workDate]
  );
  return rows;
}

/**
 * 数据修复：acre=0 的记录用 ok_acre 回填
 */
async function repairAcreData() {
  const result = await queryOne(
    `SELECT COUNT(*) as cnt FROM work_records WHERE acre = 0 AND ok_acre > 0 AND source IN ('old', 'old_api')`
  );
  const count = result ? result.cnt : 0;

  if (count > 0) {
    await runSql(
      `UPDATE work_records SET acre = ok_acre WHERE acre = 0 AND ok_acre > 0 AND source IN ('old', 'old_api')`
    );
    await refreshOrgStats();
  }

  console.log(`[DB] 修复 acre 数据: ${count} 条记录已回填`);
  return count;
}

/**
 * 数据修复：从 work_records 提取设备信息写入 machines 表
 */
async function repairMachineData() {
  const missing = await queryAll(`
    SELECT DISTINCT wr.t_number,
           (SELECT MAX(wr2.plate_no) FROM work_records wr2 WHERE wr2.t_number = wr.t_number AND wr2.plate_no AND wr2.plate_no != '') as plate_no,
           (SELECT MAX(wr2.driver_name) FROM work_records wr2 WHERE wr2.t_number = wr.t_number AND wr2.driver_name AND wr2.driver_name != '') as driver_name,
           (SELECT MAX(wr2.org_id) FROM work_records wr2 WHERE wr2.t_number = wr.t_number AND wr2.org_id > 0) as org_id,
           (SELECT MAX(wr2.org_name) FROM work_records wr2 WHERE wr2.t_number = wr.t_number AND wr2.org_name AND wr2.org_name != '') as org_name,
           SUM(CASE WHEN COALESCE(wr.acre, 0) = 0 THEN COALESCE(wr.ok_acre, 0) ELSE wr.acre END) as total_acre
    FROM work_records wr
    WHERE wr.source IN ('old', 'old_api')
      AND wr.t_number IS NOT NULL AND wr.t_number != ''
      AND wr.t_number NOT IN (SELECT t_number FROM machines WHERE source IN ('old', 'old_api'))
    GROUP BY wr.t_number
  `);

  let count = 0;
  for (const m of missing) {
    if (!m.t_number) continue;
    await upsertMachine({
      t_number: m.t_number,
      plate_no: m.plate_no || '',
      driver_name: m.driver_name || '',
      org_id: m.org_id || 0,
      org_name: m.org_name || '',
      source: 'old',
      year_acre: m.total_acre || 0
    });
    count++;
  }

  // 同时更新已有机器的年度面积
  const existing = await queryAll(`
    SELECT m.t_number, m.id,
           SUM(CASE WHEN COALESCE(wr.acre, 0) = 0 THEN COALESCE(wr.ok_acre, 0) ELSE wr.acre END) as total_acre
    FROM machines m
    LEFT JOIN work_records wr ON wr.t_number = m.t_number AND wr.source IN ('old', 'old_api')
    WHERE m.source IN ('old', 'old_api')
    GROUP BY m.t_number, m.id
  `);
  
  for (const m of existing) {
    await runSql(
      `UPDATE machines SET year_acre = ?, updated_at = NOW() WHERE id = ?`,
      [m.total_acre || 0, m.id]
    );
  }

  if (count > 0) {
    await refreshOrgStats();
  }

  console.log(`[DB] 修复设备数据: 新增 ${count} 台，更新 ${existing.length} 台年度面积`);
  return count;
}

// ===================== 农机表 =====================

async function upsertMachine(m) {
  let orgId = m.org_id || 0;
  const orgName = m.org_name || '';
  if (orgName) {
    const existingOrg = await queryOne(`SELECT id FROM organizations WHERE name = ?`, [orgName]);
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const result = await runSql(`INSERT INTO organizations (name) VALUES (?)`, [orgName]);
      orgId = result.insertId;
    }
  }

  const existing = await queryOne(`SELECT id FROM machines WHERE t_number = ?`, [m.t_number]);
  if (existing) {
    await runSql(`
      UPDATE machines SET 
        plate_no = COALESCE(?, plate_no), 
        driver_name = COALESCE(?, driver_name),
        driver_phone = COALESCE(?, driver_phone),
        org_id = COALESCE(?, org_id),
        org_name = COALESCE(?, org_name),
        machine_type = COALESCE(?, machine_type),
        year_acre = COALESCE(?, year_acre),
        source = COALESCE(?, source),
        remark = COALESCE(?, remark),
        updated_at = NOW()
      WHERE t_number = ?
    `, [
      m.plate_no || null, m.driver_name || null, m.driver_phone || null,
      orgId || null, m.org_name || null,
      m.machine_type || null, m.year_acre || null, m.source || 'old',
      m.remark || null, m.t_number
    ]);
    return existing.id;
  } else {
    const result = await runSql(
      `INSERT INTO machines (t_number, plate_no, driver_name, driver_phone, org_id, org_name, machine_type, source, year_acre, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.t_number, m.plate_no || '', m.driver_name || '', m.driver_phone || '',
        orgId, m.org_name || '',
        m.machine_type || '', m.source || 'old', m.year_acre || 0, m.remark || ''
      ]
    );
    // 更新组织的机器数
    if (orgId) {
      await runSql(
        `UPDATE organizations SET machine_count = (SELECT COUNT(*) FROM machines WHERE org_id = ?) WHERE id = ?`,
        [orgId, orgId]
      );
    }
    return result.insertId;
  }
}

async function getOldMachines() {
  // 从 old_supplier_devices 表查询旧设备信息（已移除对不存在的 device_mapping 表的依赖）
  const rows = await queryAll(`
    SELECT 
      osd.macid as t_number,
      '' as plate_no,
      COALESCE(osd.driver_name, '') as driver_name,
      COALESCE(osd.cooperative_name, '') as org_name,
      '其他' as machine_type,
      COALESCE(wr.year_acre, 0) as year_acre,
      COALESCE(wr.record_count, 0) as record_count,
      osd.updated_at
    FROM old_supplier_devices osd
    LEFT JOIN (
      SELECT t_number, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as year_acre,
             COUNT(*) as record_count
      FROM work_records
      WHERE source IN ('old', 'old_api')
      GROUP BY t_number
    ) wr ON wr.t_number = osd.macid
    ORDER BY osd.cooperative_name, osd.macid
  `);
  
  return rows;
}

async function getAllMachines() {
  return await queryAll(`SELECT * FROM machines ORDER BY source, org_name, t_number`);
}

// ===================== 作业记录 =====================

async function importWorkRecords(records, importId) {
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];

  const existing = new Set();
  const rows = await queryAll(
    `SELECT t_number, work_date, work_type, work_type_name FROM work_records WHERE source IN ('old', 'old_api')`
  );
  rows.forEach(r => existing.add(`${r.t_number}|${r.work_date || ''}|${r.work_type || ''}|${r.work_type_name || ''}`));

  const machineMap = new Map();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      if (!r.t_number) {
        skipCount++;
        errors.push(`第${i + 1}行：缺少设备号`);
        continue;
      }

      let orgId = 0;
      const orgName = r.org_name || '';
      if (orgName) {
        const existingOrg = await queryOne(`SELECT id FROM organizations WHERE name = ?`, [orgName]);
        if (existingOrg) {
          orgId = existingOrg.id;
        } else {
          const orgResult = await runSql(`INSERT INTO organizations (name) VALUES (?)`, [orgName]);
          orgId = orgResult.insertId;
        }
      }

      if (!orgId) {
        const machine = await queryOne(`SELECT org_id FROM machines WHERE t_number = ?`, [r.t_number]);
        if (machine && machine.org_id) orgId = machine.org_id;
      }

      let acre = r.acre || 0;
      let okAcre = r.ok_acre || 0;
      if (acre === 0 && okAcre > 0) {
        acre = okAcre;
      }

      const key = `${r.t_number}|${r.work_date || ''}|${r.work_type || ''}|${r.work_type_name || ''}`;
      if (existing.has(key)) {
        await runSql(`
          UPDATE work_records SET 
            acre = ?, ok_acre = ?, repeat_acre = ?, leave_acre = ?, 
            duration = ?, org_id = ?, org_name = COALESCE(?, org_name),
            plate_no = COALESCE(?, plate_no), driver_name = COALESCE(?, driver_name),
            import_id = ?, updated_at = NOW()
          WHERE t_number = ? AND work_date = ? AND work_type = ? AND work_type_name = ?
        `, [
          acre, okAcre, r.repeat_acre || 0, r.leave_acre || 0,
          r.duration || 0, orgId || 0, orgName || '',
          r.plate_no || null, r.driver_name || null,
          importId,
          r.t_number, r.work_date || '', r.work_type || '', r.work_type_name || ''
        ]);
        successCount++;
      } else {
        await runSql(`
          INSERT INTO work_records 
            (t_number, work_date, work_type, work_type_name, acre, ok_acre, repeat_acre, leave_acre, duration, org_id, org_name, plate_no, driver_name, import_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          r.t_number, r.work_date || '', r.work_type || '', r.work_type_name || '',
          acre, okAcre, r.repeat_acre || 0, r.leave_acre || 0,
          r.duration || 0, orgId || 0, orgName || '',
          r.plate_no || '', r.driver_name || '',
          importId, r.source || 'old'
        ]);
        existing.add(key);
        successCount++;
      }

      if (!machineMap.has(r.t_number)) {
        machineMap.set(r.t_number, { plate_no: '', driver_name: '', org_id: 0, org_name: '', acre: 0 });
      }
      const mi = machineMap.get(r.t_number);
      if (r.plate_no && !mi.plate_no) mi.plate_no = r.plate_no;
      if (r.driver_name && !mi.driver_name) mi.driver_name = r.driver_name;
      if (orgId && !mi.org_id) mi.org_id = orgId;
      if (orgName && !mi.org_name) mi.org_name = orgName;
      mi.acre += acre;

    } catch (e) {
      errorCount++;
      errors.push(`第${i + 1}行：${e.message}`);
    }
  }

  let machineWriteCount = 0;
  for (const [tNumber, mi] of machineMap) {
    await upsertMachine({
      t_number: tNumber,
      plate_no: mi.plate_no,
      driver_name: mi.driver_name,
      org_id: mi.org_id,
      org_name: mi.org_name,
      source: 'old',
      year_acre: mi.acre
    });
    machineWriteCount++;
  }

  await refreshOrgStats();

  console.log(`[DB] 导入完成: 作业记录 ${successCount} 条, 设备 ${machineWriteCount} 台`);
  return { successCount, skipCount, errorCount, errors, machineWriteCount };
}

async function refreshOrgStats() {
  await refreshOrgStatsAll();
}

async function getOldWorkRecords(filters = {}) {
  let sql = `SELECT * FROM work_records WHERE source IN ('old', 'old_api')`;
  const params = [];

  if (filters.tNumber) { sql += ` AND t_number = ?`; params.push(filters.tNumber); }
  if (filters.workType) { sql += ` AND work_type = ?`; params.push(filters.workType); }
  if (filters.startDate) { sql += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND work_date <= ?`; params.push(filters.endDate); }

  sql += ` ORDER BY work_date DESC`;

  if (filters.limit) { sql += ` LIMIT ${parseInt(filters.limit)}`; }

  return await queryAll(sql, params);
}

async function getOldStats() {
  const acreExpr = `CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END`;

  const byType = await queryAll(`
    SELECT work_type, work_type_name, 
           SUM(${acreExpr}) as total_acre, 
           SUM(COALESCE(ok_acre, 0)) as total_ok_acre,
           COUNT(*) as record_count
    FROM work_records WHERE source IN ('old', 'old_api')
    GROUP BY work_type, work_type_name
    ORDER BY total_acre DESC
  `);

  const byOrg = await queryAll(`
    SELECT o.id, o.name, 
           o.machine_count,
           COALESCE(SUM(CASE WHEN COALESCE(wr.acre, 0) = 0 THEN COALESCE(wr.ok_acre, 0) ELSE wr.acre END), 0) as total_acre,
           COALESCE(SUM(wr.ok_acre), 0) as total_ok_acre,
           COUNT(DISTINCT wr.t_number) as machine_with_records
    FROM organizations o
    LEFT JOIN work_records wr ON wr.org_id = o.id AND wr.source IN ('old', 'old_api')
    GROUP BY o.id
    ORDER BY total_acre DESC
  `);

  const totalResult = await queryOne(
    `SELECT COALESCE(SUM(${acreExpr}), 0) as total FROM work_records WHERE source IN ('old', 'old_api')`
  );
  const totalAcre = totalResult ? totalResult.total : 0;

  const okResult = await queryOne(
    `SELECT COALESCE(SUM(ok_acre), 0) as total FROM work_records WHERE source IN ('old', 'old_api')`
  );
  const totalOkAcre = okResult ? okResult.total : 0;

  let machineCount = 0;
  const machineFromTable = await queryOne(
    `SELECT COUNT(*) as cnt FROM machines WHERE source IN ('old', 'old_api')`
  );
  if (machineFromTable && machineFromTable.cnt > 0) {
    machineCount = machineFromTable.cnt;
  } else {
    const machineFromRecords = await queryOne(
      `SELECT COUNT(DISTINCT t_number) as cnt FROM work_records WHERE source IN ('old', 'old_api')`
    );
    machineCount = machineFromRecords ? machineFromRecords.cnt : 0;
  }

  const orgResult = await queryOne(`SELECT COUNT(*) as cnt FROM organizations`);
  const orgCount = orgResult ? orgResult.cnt : 0;

  const lastImport = await queryOne(`SELECT created_at FROM imports ORDER BY created_at DESC LIMIT 1`);

  return { byType, byOrg, totalAcre, totalOkAcre, machineCount, orgCount, lastImport };
}

// ===================== 设备作业类型管理 =====================

/**
 * 更新设备的作业类型
 */
async function updateDeviceWorkType(macid, workTypeName) {
  await runSql(`
    UPDATE old_supplier_devices 
    SET work_type_name = ?, updated_at = NOW()
    WHERE macid = ?
  `, [workTypeName, macid]);
}

/**
 * 获取设备的当前作业类型
 */
async function getDeviceWorkType(macid) {
  const device = await queryOne(`
    SELECT work_type_name FROM old_supplier_devices WHERE macid = ?
  `, [macid]);
  
  return device ? device.work_type_name : '其他';
}

/**
 * 批量更新设备作业类型
 */
async function batchUpdateDeviceWorkType(macids, workTypeName) {
  if (!macids || macids.length === 0) return 0;
  
  const placeholders = macids.map(() => '?').join(',');
  const params = [...macids, workTypeName];
  
  const result = await runSql(`
    UPDATE old_supplier_devices 
    SET work_type_name = ?, updated_at = NOW()
    WHERE macid IN (${placeholders})
  `, params);
  
  return result.affectedRows || 0;
}

// ===================== 导入记录 =====================

async function createImportRecord(info) {
  const result = await runSql(
    `INSERT INTO imports (file_name, file_size, import_type, row_count, success_count, skip_count, error_count, errors, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      info.fileName, info.fileSize || 0, info.importType || 'work_records',
      info.rowCount || 0, info.successCount || 0, info.skipCount || 0,
      info.errorCount || 0, (info.errors || []).join('\n'), info.status || 'completed'
    ]
  );
  return result.insertId;
}

async function getImportHistory(limit = 20) {
  return await queryAll(`SELECT * FROM imports ORDER BY created_at DESC LIMIT ${parseInt(limit)}`);
}

async function updateImportRecord(id, data) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    sets.push(`${key} = ?`);
    params.push(val);
  }
  if (sets.length === 0) return;
  params.push(id);
  await runSql(`UPDATE imports SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ===================== 农户管理 =====================

async function createFarmer(f) {
  let orgId = f.org_id || 0;
  const orgName = f.org_name || '';
  if (orgName) {
    const existingOrg = await queryOne(`SELECT id FROM organizations WHERE name = ?`, [orgName]);
    if (existingOrg) orgId = existingOrg.id;
    else {
      const r = await runSql(`INSERT INTO organizations (name) VALUES (?)`, [orgName]);
      orgId = r.insertId;
    }
  }
  if (orgId && !orgName) {
    const org = await queryOne(`SELECT name FROM organizations WHERE id = ?`, [orgId]);
    if (org) f.org_name = org.name;
  }

  const result = await runSql(
    `INSERT INTO farmers (phone, password, name, org_id, org_name, role, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      f.phone, f.password || '123456', f.name || '',
      orgId, f.org_name || orgName || '', f.role || 'farmer', f.remark || ''
    ]
  );
  return result.insertId;
}

// ===================== 管理员管理 =====================

/**
 * 管理员登录
 */
async function loginAdmin(username, password) {
  return await queryOne(
    `SELECT id, username, name, role FROM admins WHERE username = ? AND password = ? AND status = 1`,
    [username, password]
  );
}

/**
 * 获取管理员列表
 */
async function getAdminList() {
  return await queryAll(
    `SELECT id, username, name, role, status, created_at, updated_at FROM admins ORDER BY id`
  );
}

/**
 * 创建管理员
 */
async function createAdmin(data) {
  const result = await runSql(
    `INSERT INTO admins (username, password, name, role, status) VALUES (?, ?, ?, ?, ?)`,
    [
      data.username,
      data.password,
      data.name || '',
      data.role || 'viewer',
      data.status !== undefined ? data.status : 1
    ]
  );
  return result.insertId;
}

/**
 * 更新管理员信息
 */
async function updateAdmin(id, data) {
  const sets = [];
  const params = [];
  const allowed = ['username', 'password', 'name', 'role', 'status'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(data[key]);
    }
  }
  if (sets.length === 0) return;
  
  params.push(id);
  await runSql(
    `UPDATE admins SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
}

/**
 * 删除管理员
 */
async function deleteAdmin(id) {
  await runSql(`DELETE FROM admins WHERE id = ?`, [id]);
}

// ===================== 旧供应商抓取日志 =====================

/**
 * 创建抓取日志
 */
async function createCrawlLog(source = 'old') {
  const result = await runSql(
    `INSERT INTO crawl_log (source, status, started_at) VALUES (?, 'running', NOW())`,
    [source]
  );
  return result.insertId;
}

/**
 * 更新抓取日志
 */
async function updateCrawlLog(id, data) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    sets.push(`${key} = ?`);
    params.push(val);
  }
  params.push(id);
  await runSql(
    `UPDATE crawl_log SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
}

/**
 * 获取最近的抓取日志
 */
async function getLatestCrawlLog(source = 'old') {
  return await queryOne(
    `SELECT * FROM crawl_log WHERE source = ? ORDER BY started_at DESC LIMIT 1`,
    [source]
  );
}

/**
 * 获取抓取历史
 */
async function getCrawlHistory(source = 'old', limit = 20) {
  const safeLimit = parseInt(limit);
  return await queryAll(
    `SELECT * FROM crawl_log WHERE source = ? ORDER BY started_at DESC LIMIT ${safeLimit}`,
    [source]
  );
}

// ===================== 农户管理 =====================

async function updateFarmer(id, data) {
  const sets = [];
  const params = [];
  const allowed = ['phone', 'password', 'name', 'org_id', 'org_name', 'role', 'remark', 'enabled'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(data[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  await runSql(`UPDATE farmers SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function deleteFarmer(id) {
  await runSql(`DELETE FROM farmers WHERE id = ?`, [id]);
}

async function getFarmerList() {
  return await queryAll(
    `SELECT id, phone, name, org_id, org_name, role, remark, enabled, created_at, updated_at FROM farmers ORDER BY org_name, name`
  );
}

async function getFarmerById(id) {
  return await queryOne(`SELECT * FROM farmers WHERE id = ?`, [id]);
}

async function loginFarmer(phone, password) {
  return await queryOne(
    `SELECT id, phone, name, org_id, org_name, role FROM farmers WHERE phone = ? AND password = ? AND enabled = 1`,
    [phone, password]
  );
}

async function getFarmerWorkRecords(orgId, filters = {}) {
  // 直接按 org_id 查询 work_records，不依赖 machines 表
  let sql = `SELECT * FROM work_records WHERE org_id = ?`;
  const params = [orgId];

  if (filters.startDate) { sql += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND work_date <= ?`; params.push(filters.endDate); }
  if (filters.workType) { sql += ` AND work_type_name LIKE ?`; params.push(`%${filters.workType}%`); }
  if (filters.tNumber) { sql += ` AND t_number = ?`; params.push(filters.tNumber); }

  sql += ` ORDER BY work_date DESC, t_number`;

  if (filters.limit) { sql += ` LIMIT ${parseInt(filters.limit)}`; }

  return await queryAll(sql, params);
}

async function getFarmerStats(orgId, filters = {}) {
  // 获取该组织的设备列表（从 work_records 中获取去重的设备号）
  const machines = await queryAll(`SELECT * FROM machines WHERE org_id = ?`, [orgId]);
  
  let dateCond = '';
  const params = [orgId];
  if (filters.startDate) { dateCond += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { dateCond += ` AND work_date <= ?`; params.push(filters.endDate); }
  
  const acreExpr = `CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END`;

  // 从 work_records 中统计总面积和记录数（直接按 org_id）
  const totalResult = await queryOne(
    `SELECT COALESCE(SUM(${acreExpr}), 0) as total, COUNT(*) as cnt, COUNT(DISTINCT t_number) as machine_count 
     FROM work_records WHERE org_id = ?${dateCond}`,
    params
  );

  // 获取按作业类型统计
  const byType = await queryAll(`
    SELECT work_type, work_type_name, SUM(${acreExpr}) as total_acre, COUNT(*) as record_count
    FROM work_records WHERE org_id = ?${dateCond}
    GROUP BY work_type, work_type_name ORDER BY total_acre DESC
  `, [orgId, ...(filters.startDate ? [filters.startDate] : []), ...(filters.endDate ? [filters.endDate] : [])]);

  return {
    machineCount: totalResult?.machine_count || 0,
    machines,
    totalAcre: totalResult?.total || 0,
    recordCount: totalResult?.cnt || 0,
    byType
  };
}

// ===================== API原始数据管理 =====================

/**
 * 保存API原始记录（同步时调用）
 * 使用 INSERT ... ON DUPLICATE KEY UPDATE
 */
async function saveApiRawRecord(record) {
  const sql = `
    INSERT INTO api_raw_records (
      api_t_number, api_work_date, api_work_type, api_work_type_name,
      api_acre, api_ok_acre, api_repeat_acre, api_leave_acre, api_duration,
      api_land_group, api_county, api_plate_no, api_driver_name, api_org_name,
      current_acre, current_ok_acre, current_plate_no, current_driver_name,
      current_org_id, current_org_name,
      source, status, is_modified, api_received_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, 1, 0, NOW()
    )
    ON DUPLICATE KEY UPDATE
      api_acre = VALUES(api_acre),
      api_ok_acre = VALUES(api_ok_acre),
      api_repeat_acre = VALUES(api_repeat_acre),
      api_leave_acre = VALUES(api_leave_acre),
      api_duration = VALUES(api_duration),
      api_land_group = VALUES(api_land_group),
      api_county = VALUES(api_county),
      api_plate_no = VALUES(api_plate_no),
      api_driver_name = VALUES(api_driver_name),
      api_org_name = VALUES(api_org_name),
      api_received_at = NOW()
  `;

  const params = [
    record.tNumber, record.workDate, record.workType || '', record.workTypeLabel || '',
    record.acre || 0, record.okAcre || 0, record.repeatAcre || 0, record.leaveAcre || 0, record.duration || 0,
    record.landGroup || '', record.county || '', record.plateNo || '', record.driverName || '', record.orgName || '',
    record.acre || 0, record.okAcre || 0, record.plateNo || '', record.driverName || '',
    record.orgId || 0, record.orgName || '',
    record.source || 'yuntinan'
  ];

  await runSql(sql, params);
}

/**
 * 获取API原始记录列表（分页+筛选）
 */
async function getApiRawRecords(filters = {}) {
  let sql = `SELECT * FROM api_raw_records WHERE 1=1`;
  const params = [];

  if (filters.startDate) { sql += ` AND api_work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND api_work_date <= ?`; params.push(filters.endDate); }
  if (filters.tNumber) { sql += ` AND api_t_number = ?`; params.push(filters.tNumber); }
  if (filters.workType) { sql += ` AND api_work_type_name = ?`; params.push(filters.workType); }
  if (filters.orgId) { sql += ` AND current_org_id = ?`; params.push(parseInt(filters.orgId)); }
  // 修复：空字符串不生效，只有明确传入 0 或 1 时才筛选
  if (filters.status !== undefined && filters.status !== '') { sql += ` AND status = ?`; params.push(parseInt(filters.status)); }
  if (filters.isModified !== undefined && filters.isModified !== '') { sql += ` AND is_modified = ?`; params.push(parseInt(filters.isModified)); }

  // 排序
  sql += ` ORDER BY api_work_date DESC, api_t_number`;

  // 分页（注意：LIMIT不能使用参数化，需要直接拼接）
  const page = parseInt(filters.page) || 1;
  const pageSize = parseInt(filters.pageSize) || 50;
  const offset = (page - 1) * pageSize;
  sql += ` LIMIT ${pageSize} OFFSET ${offset}`;

  const records = await queryAll(sql, params);

  // 获取总数
  let countSql = `SELECT COUNT(*) as total FROM api_raw_records WHERE 1=1`;
  const countParams = [];
  if (filters.startDate) { countSql += ` AND api_work_date >= ?`; countParams.push(filters.startDate); }
  if (filters.endDate) { countSql += ` AND api_work_date <= ?`; countParams.push(filters.endDate); }
  if (filters.tNumber) { countSql += ` AND api_t_number = ?`; countParams.push(filters.tNumber); }
  if (filters.workType) { countSql += ` AND api_work_type_name = ?`; countParams.push(filters.workType); }
  if (filters.orgId) { countSql += ` AND current_org_id = ?`; countParams.push(parseInt(filters.orgId)); }
  if (filters.status !== undefined) { countSql += ` AND status = ?`; countParams.push(parseInt(filters.status)); }
  if (filters.isModified !== undefined) { countSql += ` AND is_modified = ?`; countParams.push(parseInt(filters.isModified)); }

  const [countResult] = await queryAll(countSql, countParams);

  return {
    records,
    total: countResult.total,
    page,
    pageSize
  };
}

/**
 * 获取单条API原始记录详情
 */
async function getApiRawRecordById(id) {
  return await queryOne(`SELECT * FROM api_raw_records WHERE id = ?`, [id]);
}

/**
 * 更新API原始记录
 */
async function updateApiRawRecord(id, updates) {
  const sets = [];
  const params = [];

  // 可更新的字段
  const updatableFields = [
    'current_acre', 'current_ok_acre', 'current_plate_no',
    'current_driver_name', 'current_org_id', 'current_org_name', 'remark'
  ];

  for (const field of updatableFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(updates[field]);
    }
  }

  // 标记为已修改
  sets.push('is_modified = 1');
  sets.push('updated_at = NOW()');

  params.push(id);

  await runSql(`UPDATE api_raw_records SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * 删除API原始记录（软删除）
 */
async function deleteApiRawRecord(id) {
  await runSql(`UPDATE api_raw_records SET status = 0, updated_at = NOW() WHERE id = ?`, [id]);
}

/**
 * 恢复API原始记录
 */
async function restoreApiRawRecord(id) {
  await runSql(`UPDATE api_raw_records SET status = 1, updated_at = NOW() WHERE id = ?`, [id]);
}

/**
 * 批量操作
 */
async function batchUpdateApiRawRecords(ids, updates) {
  if (!ids || ids.length === 0) return;

  const sets = [];
  const params = [];

  const updatableFields = [
    'current_acre', 'current_ok_acre', 'current_plate_no',
    'current_driver_name', 'current_org_id', 'current_org_name', 'status', 'remark'
  ];

  for (const field of updatableFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(updates[field]);
    }
  }

  if (sets.length === 0) return;

  sets.push('is_modified = 1');
  sets.push('updated_at = NOW()');

  const placeholders = ids.map(() => '?').join(',');
  params.push(...ids);

  await runSql(`UPDATE api_raw_records SET ${sets.join(', ')} WHERE id IN (${placeholders})`, params);
}

/**
 * 全量数据导出（合并 work_records 和 api_raw_records）
 * 智能去重：同一记录优先使用修复后的值（api_raw_records.current_*）
 */
async function getAllWorkRecords(filters = {}) {
  // 处理 sources 参数：可能是字符串 "yuntinan,old" 或数组 ["yuntinan", "old"]
  let sources = filters.sources;
  
  // 如果使用了 source 参数（单数），转换为 sources 数组
  if (!sources && filters.source) {
    if (filters.source === 'old') {
      // 当选择“旧供应商”时，同时包含 'old' 和 'old_api'
      sources = ['old', 'old_api'];
    } else {
      sources = [filters.source];
    }
  }
  
  if (typeof sources === 'string') {
    sources = sources.split(',').map(s => s.trim()).filter(s => s);
  }
  
  // 如果没有指定sources，默认包含所有数据源
  if (!sources || sources.length === 0) {
    sources = ['yuntinan', 'old', 'old_api'];
  }
  
  // 构建查询条件
  let sql = `
    SELECT 
      wr.t_number,
      wr.work_date,
      wr.work_type_name,
      wr.acre,
      wr.ok_acre,
      COALESCE(wr.plate_no, m.plate_no) as plate_no,
      COALESCE(wr.driver_name, m.driver_name) as driver_name,
      CASE WHEN wr.org_name = '云途安' OR wr.org_name IS NULL OR wr.org_name = ''
           THEN m.org_name ELSE wr.org_name END as org_name,
      wr.source,
      '原始' as data_status,
      '' as remark,
      wr.created_at as updated_at
    FROM work_records wr
    LEFT JOIN machines m ON wr.t_number = m.t_number AND m.source = 'yuntinan'
    WHERE wr.source IN (${sources.map(() => '?').join(',')})
  `;
  const params = [...sources];
  
  if (filters.startDate) { sql += ` AND wr.work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND wr.work_date <= ?`; params.push(filters.endDate); }
  if (filters.orgId) { sql += ` AND wr.org_id = ?`; params.push(parseInt(filters.orgId)); }
  if (filters.workType) { sql += ` AND wr.work_type_name = ?`; params.push(filters.workType); }
  
  sql += ` ORDER BY wr.work_date DESC, org_name`;
  
  const records = await queryAll(sql, params);
  
  return records;
}

/**
 * 导出预览统计
 */
async function getExportPreview(filters = {}) {
  // 按数据源统计
  const bySourceSql = `
    SELECT 
      source,
      COUNT(*) as count,
      SUM(COALESCE(acre, 0)) as total_acre
    FROM work_records
    WHERE source IN ('yuntinan', 'old')
    GROUP BY source
  `;
  
  const bySourceResult = await queryAll(bySourceSql, []);
  const bySource = {};
  bySourceResult.forEach(r => {
    bySource[r.source] = {
      count: parseInt(r.count),
      acre: parseFloat(r.total_acre || 0)
    };
  });

  // 已修复数据统计
  const repairedSql = `
    SELECT 
      COUNT(*) as count,
      SUM(COALESCE(current_acre, 0)) as total_acre
    FROM api_raw_records
    WHERE status = 1 AND is_modified = 1
  `;
  const repairedResult = await queryOne(repairedSql, []);

  // 合计
  const totalSql = `
    SELECT 
      COUNT(*) as count,
      SUM(COALESCE(acre, 0)) as total_acre
    FROM work_records
    WHERE source IN ('yuntinan', 'old')
  `;
  const totalResult = await queryOne(totalSql, []);

  // 日期范围
  const dateRangeSql = `
    SELECT 
      MIN(work_date) as min_date,
      MAX(work_date) as max_date
    FROM work_records
    WHERE source IN ('yuntinan', 'old')
  `;
  const dateRangeResult = await queryOne(dateRangeSql, []);

  return {
    total: parseInt(totalResult.count),
    bySource,
    repaired: {
      count: parseInt(repairedResult.count),
      acre: parseFloat(repairedResult.total_acre || 0)
    },
    dateRange: {
      min: dateRangeResult.min_date,
      max: dateRangeResult.max_date
    }
  };
}

/**
 * 数据一致性检查
 */
async function validateDataConsistency() {
  const issues = [];

  // 检查1：同一设备同一天同一类型在 work_records 中的重复
  const duplicatesSql = `
    SELECT 
      t_number,
      work_date,
      work_type_name,
      source,
      COUNT(*) as count
    FROM work_records
    GROUP BY t_number, work_date, work_type_name, source
    HAVING COUNT(*) > 1
  `;
  const duplicates = await queryAll(duplicatesSql, []);
  if (duplicates.length > 0) {
    issues.push({
      type: 'duplicate_in_work_records',
      message: `work_records 表发现 ${duplicates.length} 条重复记录`,
      details: duplicates
    });
  }

  // 检查2：api_raw_records 中已修复但未同步到 work_records 的记录
  const unsyncedSql = `
    SELECT 
      ar.api_t_number,
      ar.api_work_date,
      ar.api_work_type_name,
      ar.current_acre,
      wr.acre as wr_acre,
      ar.remark
    FROM api_raw_records ar
    LEFT JOIN work_records wr 
      ON ar.api_t_number = wr.t_number
      AND ar.api_work_date = wr.work_date
      AND ar.api_work_type_name = wr.work_type_name
      AND ar.source = wr.source
    WHERE ar.is_modified = 1
      AND ar.status = 1
      AND (wr.acre != ar.current_acre OR wr.acre IS NULL)
    LIMIT 100
  `;
  const unsynced = await queryAll(unsyncedSql, []);
  if (unsynced.length > 0) {
    issues.push({
      type: 'unsynced_repaired',
      message: `api_raw_records 中有 ${unsynced.length} 条已修复但未同步到 work_records`,
      details: unsynced
    });
  }

  // 检查3：统计记录总数
  const statsSql = `
    SELECT 
      source,
      COUNT(*) as count
    FROM work_records
    GROUP BY source
  `;
  const stats = await queryAll(statsSql, []);

  return {
    issues,
    hasIssues: issues.length > 0,
    stats: stats.reduce((acc, s) => {
      acc[s.source] = parseInt(s.count);
      return acc;
    }, {})
  };
}

/**
 * 导出明细数据（只导出status=1的有效数据）
 */
async function exportDetailRecords(filters = {}) {
  let sql = `
    SELECT 
      api_t_number as t_number,
      api_work_date as work_date,
      api_work_type_name as work_type_name,
      current_acre as acre,
      current_ok_acre as ok_acre,
      current_plate_no as plate_no,
      current_driver_name as driver_name,
      current_org_name as org_name,
      api_received_at,
      is_modified,
      remark
    FROM api_raw_records
    WHERE status = 1
  `;
  const params = [];

  if (filters.startDate) { sql += ` AND api_work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND api_work_date <= ?`; params.push(filters.endDate); }
  if (filters.orgId) { sql += ` AND current_org_id = ?`; params.push(parseInt(filters.orgId)); }
  if (filters.workType) { sql += ` AND api_work_type_name = ?`; params.push(filters.workType); }

  sql += ` ORDER BY api_work_date DESC, api_t_number`;

  return await queryAll(sql, params);
}

async function getOrganizations() {
  // 从 organizations 表获取（已移除对不存在的 device_mapping 表的依赖）
  const orgs = await queryAll(`SELECT id, name, short_name, machine_count, total_acre, source FROM organizations ORDER BY name`);
  
  // 从 old_supplier_devices 表获取旧供应商的合作社（去重）
  const oldOrgs = await queryAll(`
    SELECT DISTINCT cooperative_name as name 
    FROM old_supplier_devices 
    WHERE cooperative_name IS NOT NULL AND cooperative_name != ''
    ORDER BY cooperative_name
  `);
  
  // 自动同步缺失的合作社到 organizations 表
  const existingNames = new Set(orgs.map(o => o.name));
  let syncedCount = 0;
  
  for (const oldOrg of oldOrgs) {
    if (!existingNames.has(oldOrg.name)) {
      try {
        await runSql(
          `INSERT INTO organizations (name, source) VALUES (?, 'old')`,
          [oldOrg.name]
        );
        syncedCount++;
        existingNames.add(oldOrg.name);
      } catch (e) {
        console.error(`[合作社同步] 失败: ${oldOrg.name}`, e.message);
      }
    }
  }
  
  if (syncedCount > 0) {
    console.log(`[合作社同步] 自动同步 ${syncedCount} 个旧供应商合作社`);
  }
  
  // 重新查询，返回完整列表
  return await queryAll(`SELECT id, name, short_name, machine_count, total_acre, source FROM organizations ORDER BY name`);
}

async function getMachinesBySource(source) {
  // 从数据库获取指定source的设备信息
  const rows = await queryAll(`
    SELECT DISTINCT 
      m.t_number, m.plate_no, m.driver_name, m.org_id, m.org_name, m.source,
      COALESCE(wr.total_acre, 0) as total_acre,
      COALESCE(wr.record_count, 0) as record_count
    FROM machines m
    LEFT JOIN (
      SELECT t_number, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre,
             COUNT(*) as record_count
      FROM work_records
      WHERE source = ?
      GROUP BY t_number
    ) wr ON m.t_number = wr.t_number
    WHERE m.source = ?
    ORDER BY m.org_name, m.t_number
  `, [source, source]);
  return rows;
}

async function getAgriSummary(filters = {}) {
  const acreExpr = `CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END`;

  let dateCond = '';
  const params = [];
  if (filters.startDate) { dateCond += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { dateCond += ` AND work_date <= ?`; params.push(filters.endDate); }

  const byOrg = await queryAll(`
    SELECT org_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records
    WHERE source IN ('old', 'old_api')${dateCond}
    GROUP BY org_name
    ORDER BY total_acre DESC
  `, params);

  const byType = await queryAll(`
    SELECT work_type, work_type_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records
    WHERE source IN ('old', 'old_api')${dateCond}
    GROUP BY work_type, work_type_name
    ORDER BY total_acre DESC
  `, [...params]);

  const totalResult = await queryOne(`
    SELECT SUM(${acreExpr}) as total_acre, COUNT(DISTINCT t_number) as machine_count, COUNT(*) as record_count
    FROM work_records WHERE source IN ('old', 'old_api')${dateCond}
  `, [...params]);

  return {
    total: { acre: totalResult?.total_acre || 0, machines: totalResult?.machine_count || 0, records: totalResult?.record_count || 0 },
    byOrg,
    byType
  };
}

async function getExportRecords(filters = {}) {
  let sql = `
    SELECT work_date, work_type_name, t_number, plate_no,
           driver_name, org_name, acre, ok_acre, duration as work_duration
    FROM work_records
    WHERE source = 'old'
  `;
  const params = [];

  if (filters.startDate) { sql += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND work_date <= ?`; params.push(filters.endDate); }
  if (filters.orgId) { sql += ` AND org_id = ?`; params.push(parseInt(filters.orgId)); }
  if (filters.workType) { sql += ` AND work_type_name = ?`; params.push(filters.workType); }

  sql += ` ORDER BY org_name, work_type_name, work_date DESC`;

  return await queryAll(sql, params);
}

// ===================== 云途安数据同步 =====================

async function getLatestSyncLog() {
  return await queryOne(
    `SELECT * FROM sync_log WHERE sync_type = 'yuntinan' ORDER BY sync_date DESC LIMIT 1`
  );
}

async function getSyncHistory(limit = 20) {
  return await queryAll(`SELECT * FROM sync_log ORDER BY sync_date DESC LIMIT ${parseInt(limit)}`);
}

async function createSyncLog(syncDate) {
  await runSql(`DELETE FROM sync_log WHERE sync_type = 'yuntinan' AND sync_date = ?`, [syncDate]);
  const result = await runSql(
    `INSERT INTO sync_log (sync_type, sync_date, status, started_at) VALUES ('yuntinan', ?, 'running', NOW())`,
    [syncDate]
  );
  return result.insertId;
}

async function updateSyncLog(syncDate, data) {
  const sets = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    sets.push(`${key} = ?`);
    params.push(val);
  }
  params.push(syncDate);
  await runSql(
    `UPDATE sync_log SET ${sets.join(', ')} WHERE sync_type = 'yuntinan' AND sync_date = ?`,
    params
  );
}

async function syncYuntinanRecords(records, machineMap = {}) {
  let newRecords = 0;
  let updateRecords = 0;
  const errorRecords = [];

  for (const r of records) {
    if (!r.tNumber || !r.workDate) continue;

    try {
      const mInfo = machineMap[r.tNumber] || {};
      const acre = r.acre || 0;
      const okAcre = r.okAcre || 0;
      const orgName = mInfo.orgName || '云途安';

      let orgId = 0;
      const existingOrg = await queryOne(`SELECT id FROM organizations WHERE name = ?`, [orgName]);
      if (existingOrg) {
        orgId = existingOrg.id;
      } else {
        const orgResult = await runSql(`INSERT INTO organizations (name) VALUES (?)`, [orgName]);
        orgId = orgResult.insertId;
      }

      // 使用api_id作为唯一标识（API返回的原始ID）
      let existing;
      if (r.apiId) {
        // 云途安数据：优先使用 api_id 查询
        existing = await queryOne(
          `SELECT id, acre, ok_acre FROM work_records 
           WHERE api_id = ? AND source = 'yuntinan'`,
          [r.apiId]
        );
        
        // 如果 api_id 不存在，回退到原有逻辑（防止历史数据重复）
        if (!existing && r.tNumber && r.workDate) {
          existing = await queryOne(
            `SELECT id, acre, ok_acre FROM work_records 
             WHERE t_number = ? AND work_date = ? AND work_type_name = ? AND acre = ? AND source = 'yuntinan'`,
            [r.tNumber, r.workDate, r.workTypeLabel || '', acre]
          );
        }
      } else {
        // 旧供应商数据：使用原有逻辑（t_number + work_date + work_type_name + acre）
        if (r.tNumber && r.workDate) {
          existing = await queryOne(
            `SELECT id, acre, ok_acre FROM work_records 
             WHERE t_number = ? AND work_date = ? AND work_type_name = ? AND acre = ? AND source = ?`,
            [r.tNumber, r.workDate, r.workTypeLabel || '', acre, r.source || 'old']
          );
        }
      }

      if (existing) {
        // 覆盖更新（因为API返回的是该地块当天的总面积）
        // 注意：这里使用 COALESCE 来保留非空值
        await runSql(`
          UPDATE work_records SET 
            acre = ?, ok_acre = ?, 
            repeat_acre = COALESCE(NULLIF(?, 0), repeat_acre), leave_acre = COALESCE(NULLIF(?, 0), leave_acre),
            duration = COALESCE(NULLIF(?, 0), duration), land_group = ?, county = ?,
            org_id = ?, org_name = ?,
            plate_no = COALESCE(NULLIF(?, ''), plate_no), driver_name = COALESCE(NULLIF(?, ''), driver_name),
            updated_at = NOW()
          WHERE id = ?
        `, [
          acre, okAcre,
          r.repeatAcre || null, r.leaveAcre || null,
          r.duration || null, r.landGroup || '', r.county || '',
          orgId, orgName,
          mInfo.plateNo || null, mInfo.driverName || null,
          existing.id
        ]);
        updateRecords++;
      } else {
        await runSql(`
          INSERT INTO work_records 
            (t_number, work_date, work_type, work_type_name, acre, ok_acre, repeat_acre, leave_acre, 
             duration, org_id, org_name, plate_no, driver_name, land_group, county, api_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yuntinan')
        `, [
          r.tNumber, r.workDate, r.workType || '', r.workTypeLabel || '',
          acre, okAcre, r.repeatAcre || 0, r.leaveAcre || 0,
          r.duration || 0, orgId, orgName,
          mInfo.plateNo || '', mInfo.driverName || '',
          r.landGroup || '', r.county || '', r.apiId || null
        ]);
        newRecords++;
      }

      await upsertMachine({
        t_number: r.tNumber,
        plate_no: mInfo.plateNo || r.plateNo || '',
        driver_name: mInfo.driverName || '',
        org_id: orgId,
        org_name: orgName,
        source: 'yuntinan',
        year_acre: 0
      });

      // 保存API原始记录（用于数据修复管理）
      await saveApiRawRecord({
        tNumber: r.tNumber,
        workDate: r.workDate,
        workType: r.workType || '',
        workTypeLabel: r.workTypeLabel || '',
        acre: r.acre || 0,
        okAcre: r.okAcre || 0,
        repeatAcre: r.repeatAcre || 0,
        leaveAcre: r.leaveAcre || 0,
        duration: r.duration || 0,
        landGroup: r.landGroup || '',
        county: r.county || '',
        plateNo: mInfo.plateNo || r.plateNo || '',
        driverName: mInfo.driverName || '',
        orgName: orgName,
        orgId: orgId,
        source: 'yuntinan'
      });
    } catch (err) {
      errorRecords.push({ tNumber: r.tNumber, error: err.message });
      console.error(`[DB] 同步记录失败 [${r.tNumber}]:`, err.message);
    }
  }

  const ytMachineAcre = await queryAll(`
    SELECT t_number, SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as total_acre
    FROM work_records WHERE source = 'yuntinan'
    GROUP BY t_number
  `);
  
  for (const m of ytMachineAcre) {
    await runSql(
      `UPDATE machines SET year_acre = ?, updated_at = NOW() WHERE t_number = ? AND source = 'yuntinan'`,
      [m.total_acre || 0, m.t_number]
    );
  }

  await refreshOrgStatsAll();

  console.log(`[DB] 云途安同步完成: 新增 ${newRecords} 条, 更新 ${updateRecords} 条`);
  return { newRecords, updateRecords, totalRecords: newRecords + updateRecords };
}

async function refreshOrgStatsAll() {
  const orgs = await queryAll(`SELECT id FROM organizations`);
  for (const org of orgs) {
    await runSql(`
      UPDATE organizations SET 
        machine_count = (SELECT COUNT(DISTINCT t_number) FROM machines WHERE org_id = ?),
        total_acre = (SELECT COALESCE(SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END), 0) FROM work_records WHERE org_id = ?),
        updated_at = NOW()
      WHERE id = ?
    `, [org.id, org.id, org.id]);
  }
}

async function getYuntinanWorkRecords(filters = {}) {
  let sql = `SELECT * FROM work_records WHERE source = 'yuntinan'`;
  const params = [];

  if (filters.tNumber) { sql += ` AND t_number = ?`; params.push(filters.tNumber); }
  if (filters.workType) { sql += ` AND work_type = ?`; params.push(filters.workType); }
  if (filters.startDate) { sql += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND work_date <= ?`; params.push(filters.endDate); }
  if (filters.orgId) { sql += ` AND org_id = ?`; params.push(parseInt(filters.orgId)); }

  sql += ` ORDER BY work_date DESC`;

  if (filters.limit) { sql += ` LIMIT ${parseInt(filters.limit)}`; }

  return await queryAll(sql, params);
}

async function getAgriSummaryAll(filters = {}) {
  const acreExpr = `CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END`;

  let dateCond = '';
  const params = [];
  if (filters.startDate) { dateCond += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { dateCond += ` AND work_date <= ?`; params.push(filters.endDate); }
  // 只有在明确传入county参数时才过滤
  if (filters.county) { dateCond += ` AND county = ?`; params.push(filters.county); }

  // 按合作社统计
  const byOrg = await queryAll(`
    SELECT org_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records WHERE 1=1${dateCond}
    GROUP BY org_name
    ORDER BY total_acre DESC
  `, params);

  // 按作业类型统计（所有数据）
  const byType = await queryAll(`
    SELECT work_type, work_type_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records WHERE 1=1${dateCond}
    GROUP BY work_type, work_type_name
    ORDER BY total_acre DESC
  `, [...params]);

  // 旧供应商按作业类型统计
  const oldByType = await queryAll(`
    SELECT work_type, work_type_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records WHERE source IN ('old', 'old_api')${dateCond}
    GROUP BY work_type, work_type_name
    ORDER BY total_acre DESC
  `, [...params]);

  // 按合作社+作业类型统计（用于核对页面）
  const byOrgType = await queryAll(`
    SELECT org_name, work_type, work_type_name,
           SUM(${acreExpr}) as total_acre,
           COUNT(DISTINCT t_number) as machine_count,
           COUNT(*) as record_count
    FROM work_records WHERE 1=1${dateCond}
    GROUP BY org_name, work_type, work_type_name
    ORDER BY org_name, total_acre DESC
  `, [...params]);

  const totalResult = await queryOne(`
    SELECT SUM(${acreExpr}) as total_acre, COUNT(DISTINCT t_number) as machine_count, COUNT(*) as record_count
    FROM work_records WHERE 1=1${dateCond}
  `, [...params]);

  const bySource = await queryAll(`
    SELECT source, SUM(${acreExpr}) as total_acre, COUNT(DISTINCT t_number) as machine_count, COUNT(*) as record_count
    FROM work_records WHERE 1=1${dateCond}
    GROUP BY source
  `, [...params]);

  const sources = {};
  for (const s of bySource) {
    sources[s.source] = { acre: s.total_acre || 0, machines: s.machine_count || 0, records: s.record_count || 0 };
  }

  return {
    total: { acre: totalResult?.total_acre || 0, machines: totalResult?.machine_count || 0, records: totalResult?.record_count || 0 },
    byOrg,
    byType,
    oldByType,
    byOrgType,
    sources
  };
}

async function getExportRecordsAll(filters = {}) {
  let sql = `
    SELECT w.work_date, w.work_type, w.work_type_name, w.t_number,
           COALESCE(w.plate_no, m.plate_no) as plate_no,
           COALESCE(w.driver_name, m.driver_name) as driver_name,
           CASE WHEN w.org_name = '云途安' OR w.org_name IS NULL OR w.org_name = ''
                THEN m.org_name ELSE w.org_name END as org_name,
           w.acre, w.ok_acre, w.duration as work_duration, w.source
    FROM work_records w
    LEFT JOIN machines m ON w.t_number = m.t_number AND m.source = 'yuntinan'
    WHERE 1=1
  `;
  const params = [];

  // 只有在明确传入county参数时才过滤
  if (filters.county) { sql += ` AND w.county = ?`; params.push(filters.county); }
  if (filters.startDate) { sql += ` AND w.work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { sql += ` AND w.work_date <= ?`; params.push(filters.endDate); }
  if (filters.orgId) { sql += ` AND w.org_id = ?`; params.push(parseInt(filters.orgId)); }
  if (filters.workType) { sql += ` AND w.work_type_name = ?`; params.push(filters.workType); }

  sql += ` ORDER BY org_name, w.source, w.work_type_name, w.work_date DESC`;

  return await queryAll(sql, params);
}

/**
 * 快速获取云途安统计数据（用于看板）
 */
async function getYuntinanStats(filters = {}) {
  const acreExpr = `CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END`;

  let whereCond = ' WHERE source = "yuntinan"';
  const params = [];
  if (filters.startDate) { whereCond += ` AND work_date >= ?`; params.push(filters.startDate); }
  if (filters.endDate) { whereCond += ` AND work_date <= ?`; params.push(filters.endDate); }
  
  // workType 到 stage 的映射
  const stageMap = {
    '1': 'geng',   // 旋耕
    '2': 'geng',   // 深翻
    '3': 'geng',   // 秸秆还田
    '35': 'zhong', // 玉米播种
    '4': 'zhong',  // 播种
    '6': 'guan',   // 打药
    '7': 'shou',   // 玉米收获
    '5': 'shou'    // 收割
  };

  // 按作业类型统计
  const byType = await queryAll(`
    SELECT work_type, SUM(${acreExpr}) as total_acre, COUNT(DISTINCT t_number) as machine_count
    FROM work_records${whereCond}
    GROUP BY work_type
  `, params);

  const stats = { geng: 0, zhong: 0, guan: 0, shou: 0, total: 0 };

  for (const row of byType) {
    const stage = stageMap[String(row.work_type)];
    if (stage && stats.hasOwnProperty(stage)) {
      stats[stage] += parseFloat(row.total_acre || 0);
    }
    stats.total += parseFloat(row.total_acre || 0);
  }

  // 获取总设备数
  const deviceResult = await queryOne(`
    SELECT COUNT(DISTINCT t_number) as count
    FROM work_records${whereCond}
  `, params);

  return {
    ...stats,
    totalMachines: deviceResult?.count || 0
  };
}

// ===================== 关闭数据库连接 =====================

async function close() {
  if (pool) {
    await pool.end();
    console.log('[DB] 数据库连接已关闭');
  }
}

module.exports = {
  init,
  close,
  upsertMachine,
  getOldMachines,
  getAllMachines,
  importWorkRecords,
  getOldWorkRecords,
  getOldStats,
  createImportRecord,
  updateImportRecord,
  getImportHistory,
  runSql,
  queryAll,
  queryOne,
  repairAcreData,
  repairMachineData,
  createFarmer,
  updateFarmer,
  deleteFarmer,
  getFarmerList,
  getFarmerById,
  loginFarmer,
  getFarmerWorkRecords,
  getFarmerStats,
  getOrganizations,
  getMachinesBySource,
  getAgriSummary,
  getExportRecords,
  getLatestSyncLog,
  getSyncHistory,
  createSyncLog,
  updateSyncLog,
  syncYuntinanRecords,
  getYuntinanWorkRecords,
  getAgriSummaryAll,
  getExportRecordsAll,
  refreshOrgStatsAll,
  getYuntinanStats,
  // 轨迹相关
  saveMachineTracks,
  getMachineTracks,
  // API原始数据管理
  saveApiRawRecord,
  getApiRawRecords,
  getApiRawRecordById,
  updateApiRawRecord,
  deleteApiRawRecord,
  restoreApiRawRecord,
  batchUpdateApiRawRecords,
  exportDetailRecords,
  getAllWorkRecords,
  getExportPreview,
  validateDataConsistency,
  // work_records 表管理
  ...require('./workRecordsService'),
  // 管理员权限
  loginAdmin,
  getAdminList,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  // 旧供应商抓取日志
  createCrawlLog,
  updateCrawlLog,
  getLatestCrawlLog,
  getCrawlHistory,
  // 设备作业类型管理
  updateDeviceWorkType,
  getDeviceWorkType,
  batchUpdateDeviceWorkType
};
