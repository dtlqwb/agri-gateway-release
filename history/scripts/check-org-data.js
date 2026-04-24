require('dotenv').config();
const db = require('../services/db');

(async () => {
  await db.init();
  
  const orgIds = [1, 5, 8, 10];
  for (const orgId of orgIds) {
    const count = await db.queryOne('SELECT COUNT(*) as cnt FROM work_records WHERE org_id = ?', [orgId]);
    const org = await db.queryOne('SELECT name FROM organizations WHERE id = ?', [orgId]);
    console.log(`合作社 ${org.name} (ID:${orgId}): ${count.cnt} 条记录`);
  }
  
  await db.close();
  process.exit(0);
})();
