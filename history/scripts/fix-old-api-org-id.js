/**
 * 修复旧供应商API数据的 org_id
 * 根据 org_name 查找对应的 organizations.id 并更新
 */

// 加载环境变量
require('dotenv').config();

const db = require('../services/db');

async function fixOrgId() {
  console.log('[修复] 开始修复旧供应商API数据的 org_id...');

  try {
    // 初始化数据库连接
    await db.init();

    // 获取所有需要修复的记录
    const records = await db.queryAll(`
      SELECT id, org_name FROM work_records 
      WHERE source = 'old_api' AND org_id = 0 AND org_name != ''
    `);

    console.log(`[修复] 找到 ${records.length} 条需要修复的记录`);

    let fixed = 0;
    let notFound = 0;

    for (const record of records) {
      // 查找对应的组织
      const org = await db.queryOne(
        `SELECT id FROM organizations WHERE name = ?`,
        [record.org_name]
      );

      if (org) {
        // 更新 org_id
        await db.runSql(
          `UPDATE work_records SET org_id = ? WHERE id = ?`,
          [org.id, record.id]
        );
        fixed++;
      } else {
        console.warn(`[修复] 未找到合作社: ${record.org_name}`);
        notFound++;
      }
    }

    console.log(`[修复] 完成！`);
    console.log(`  - 成功修复: ${fixed} 条`);
    console.log(`  - 未找到合作社: ${notFound} 条`);

    // 统计结果
    const stats = await db.queryOne(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN org_id > 0 THEN 1 ELSE 0 END) as with_org_id,
        SUM(CASE WHEN org_id = 0 THEN 1 ELSE 0 END) as without_org_id
      FROM work_records
      WHERE source = 'old_api'
    `);

    console.log(`\n[统计] 旧供应商API数据:`);
    console.log(`  - 总记录数: ${stats.total}`);
    console.log(`  - 有 org_id: ${stats.with_org_id}`);
    console.log(`  - 无 org_id: ${stats.without_org_id}`);

  } catch (error) {
    console.error('[修复] 失败:', error.message);
    console.error(error.stack);
  } finally {
    await db.close();
    process.exit(0);
  }
}

fixOrgId();
