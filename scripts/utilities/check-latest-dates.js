/**
 * 检查数据库中作业记录的最新日期
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkLatestDates() {
  console.log('=== 检查作业记录最新日期 ===\n');
  
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });
  
  try {
    // 1. 检查云途安数据的最新日期
    const [yuntinan] = await conn.execute(
      'SELECT MAX(work_date) as max_date, COUNT(*) as count FROM work_records WHERE source="yuntinan"'
    );
    console.log('【云途安数据】');
    yuntinan.forEach(r => {
      const maxDate = r.max_date ? new Date(r.max_date).toISOString().split('T')[0] : '无数据';
      console.log(`  最新日期: ${maxDate}`);
      console.log(`  总记录数: ${r.count} 条`);
    });
    
    // 2. 检查旧供应商API数据的最新日期
    const [oldApi] = await conn.execute(
      'SELECT MAX(work_date) as max_date, COUNT(*) as count FROM work_records WHERE source="old_api"'
    );
    console.log('\n【旧供应商API数据】');
    oldApi.forEach(r => {
      const maxDate = r.max_date ? new Date(r.max_date).toISOString().split('T')[0] : '无数据';
      console.log(`  最新日期: ${maxDate}`);
      console.log(`  总记录数: ${r.count} 条`);
    });
    
    // 3. 检查所有数据的最新日期（不分来源）
    const [all] = await conn.execute(
      'SELECT MAX(work_date) as max_date, COUNT(*) as count FROM work_records'
    );
    console.log('\n【全部数据】');
    all.forEach(r => {
      const maxDate = r.max_date ? new Date(r.max_date).toISOString().split('T')[0] : '无数据';
      console.log(`  最新日期: ${maxDate}`);
      console.log(`  总记录数: ${r.count} 条`);
    });
    
    // 4. 检查最近7天每天的数据量
    console.log('\n【最近7天每日数据量】');
    const [recentDays] = await conn.execute(`
      SELECT 
        work_date,
        source,
        COUNT(*) as count
      FROM work_records
      WHERE work_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY work_date, source
      ORDER BY work_date DESC, source
    `);
    
    let currentDate = null;
    recentDays.forEach(r => {
      const dateStr = new Date(r.work_date).toISOString().split('T')[0];
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        console.log(`\n  ${dateStr}:`);
      }
      const sourceLabel = r.source === 'yuntinan' ? '云途安' : 
                         r.source === 'old_api' ? '旧API' : r.source;
      console.log(`    ${sourceLabel}: ${r.count} 条`);
    });
    
    // 5. 检查同步日志
    console.log('\n【同步日志】');
    const logs = await getSyncLogs(conn);
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        console.log(`  ${log.sync_date} | 模式: ${log.mode} | 状态: ${log.status}`);
        if (log.total_records) {
          console.log(`    处理: ${log.total_records} 条 (新增: ${log.new_records}, 更新: ${log.update_records})`);
        }
        if (log.error) {
          console.log(`    错误: ${log.error}`);
        }
        console.log(`    完成时间: ${log.finished_at || '未完成'}`);
      });
    } else {
      console.log('  无同步日志');
    }
    
    // 6. 当前时间
    console.log('\n【当前系统时间】');
    const now = new Date();
    console.log(`  ${now.toLocaleString('zh-CN')}`);
    console.log(`  ISO: ${now.toISOString()}`);
    
  } catch (error) {
    console.error('检查失败:', error.message);
    console.error(error.stack);
  } finally {
    await conn.end();
    process.exit(0);
  }
}

async function getSyncLogs(conn) {
  try {
    const [logs] = await conn.execute(`
      SELECT sync_date, mode, status, total_records, new_records, update_records, error, finished_at
      FROM yuntinan_sync_logs
      ORDER BY sync_date DESC
      LIMIT 5
    `);
    return logs;
  } catch (e) {
    console.log('同步日志表可能不存在，跳过检查');
    return [];
  }
}

checkLatestDates();
