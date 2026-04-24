-- 修复旧供应商API数据的 org_id
-- 根据 org_name 查找对应的 organizations.id 并更新

UPDATE work_records wr
INNER JOIN organizations org ON wr.org_name = org.name
SET wr.org_id = org.id
WHERE wr.source = 'old_api'
  AND wr.org_id = 0
  AND wr.org_name != '';

-- 查看修复结果
SELECT 
  source,
  COUNT(*) as record_count,
  SUM(CASE WHEN org_id > 0 THEN 1 ELSE 0 END) as with_org_id,
  SUM(CASE WHEN org_id = 0 THEN 1 ELSE 0 END) as without_org_id
FROM work_records
WHERE source = 'old_api'
GROUP BY source;
