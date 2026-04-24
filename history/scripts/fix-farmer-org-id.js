/**
 * 修复农户数据的 org_id
 * 根据 org_name 查找正确的 organizations.id
 */

// 加载环境变量
require('dotenv').config();

const db = require('../services/db');

async function fixFarmerOrgId() {
  console.log('[修复] 开始修复农户数据的 org_id...');

  try {
    // 初始化数据库连接
    await db.init();

    // 获取所有农户
    const farmers = await db.queryAll(`SELECT id, org_id, org_name FROM farmers`);

    console.log(`[修复] 找到 ${farmers.length} 个农户`);

    let fixed = 0;
    let notFound = 0;

    for (const farmer of farmers) {
      if (!farmer.org_name) {
        console.warn(`[修复] 农户 ${farmer.id} 没有合作社名称`);
        continue;
      }

      // 查找正确的组织ID
      const org = await db.queryOne(
        `SELECT id FROM organizations WHERE name = ?`,
        [farmer.org_name]
      );

      if (org && org.id !== farmer.org_id) {
        // 更新 org_id
        await db.runSql(
          `UPDATE farmers SET org_id = ? WHERE id = ?`,
          [org.id, farmer.id]
        );
        console.log(`[修复] 农户 ${farmer.id} (${farmer.org_name}): org_id ${farmer.org_id} -> ${org.id}`);
        fixed++;
      } else if (!org) {
        console.warn(`[修复] 未找到合作社: ${farmer.org_name}`);
        notFound++;
      }
    }

    console.log(`\n[修复] 完成！`);
    console.log(`  - 成功修复: ${fixed} 个`);
    console.log(`  - 未找到合作社: ${notFound} 个`);

    // 显示修复后的农户列表
    console.log(`\n[农户列表]`);
    const updatedFarmers = await db.queryAll(`
      SELECT id, phone, name, org_id, org_name 
      FROM farmers 
      ORDER BY id
    `);
    
    updatedFarmers.forEach(f => {
      console.log(`  ID:${f.id} | ${f.phone} | ${f.name} | org_id=${f.org_id} | ${f.org_name}`);
    });

  } catch (error) {
    console.error('[修复] 失败:', error.message);
    console.error(error.stack);
  } finally {
    await db.close();
    process.exit(0);
  }
}

fixFarmerOrgId();
