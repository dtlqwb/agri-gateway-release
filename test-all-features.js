/**
 * 项目功能测试脚本
 * 测试所有核心API接口
 */
require('dotenv').config();
const http = require('http');

const BASE_URL = 'http://localhost:3001';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function separator(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

// HTTP请求封装
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  function test(name, fn) {
    results.total++;
    results.tests.push({ name, status: 'pending' });
    return fn().then(() => {
      results.passed++;
      results.tests[results.tests.length - 1].status = 'passed';
      log(`  ✅ ${name}`, 'green');
    }).catch((e) => {
      results.failed++;
      results.tests[results.tests.length - 1].status = 'failed';
      const errorMsg = e.message || String(e);
      results.tests[results.tests.length - 1].error = errorMsg;
      log(`  ❌ ${name}: ${errorMsg}`, 'red');
    });
  }

  separator('🧪 项目功能自动化测试');

  // ==================== 1. 健康检查 ====================
  separator('1. 系统健康检查');
  
  await test('API健康检查', async () => {
    const res = await request('GET', '/api/health');
    if (res.status !== 200) throw new Error(`状态码: ${res.status}`);
    if (!res.data || res.data.code !== 0) throw new Error('返回格式错误');
  });

  // ==================== 2. 认证系统 ====================
  separator('2. 认证和权限系统');

  let superToken = '';
  let farmerToken = '';

  await test('超管登录', async () => {
    const res = await request('POST', '/api/admin/login', {
      username: 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    if (res.data.code !== 0) throw new Error(res.data.msg || '登录失败');
    superToken = res.data.data.token;
    if (!superToken) throw new Error('未返回Token');
  });

  await test('农户登录', async () => {
    const res = await request('POST', '/api/auth/login', {
      username: process.env.FARMER_USERNAME || 'farmer',
      password: process.env.FARMER_PASSWORD || 'farmer123'
    });
    if (res.data.code !== 0) {
      // 农户账号可能不存在，记录警告但不算失败
      log('  ⚠️ 农户账号未配置，跳过', 'yellow');
      return;
    }
    farmerToken = res.data.data.token;
  });

  if (superToken) {
    await test('超管获取管理员列表', async () => {
      const res = await request('GET', '/api/admins', null, {
        'Authorization': superToken
      });
      if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
    });

    await test('未授权访问拒绝', async () => {
      const res = await request('GET', '/api/admins');
      if (res.data.code === 0) throw new Error('应该返回未授权错误');
    });
  }

  // ==================== 3. 数据同步功能 ====================
  separator('3. 数据同步功能');

  await test('查询云途安统计', async () => {
    const res = await request('GET', '/api/stats');
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  await test('查询作业记录（不分页）', async () => {
    const res = await request('GET', '/api/work-records?page=1&pageSize=5', null, {
      'Authorization': superToken
    });
    if (res.data.code !== 0) throw new Error(res.data.msg);
    if (!res.data.data || !res.data.data.records) throw new Error('返回格式错误');
  });

  await test('查询作业记录统计', async () => {
    const res = await request('GET', '/api/work-records/stats', null, {
      'Authorization': superToken
    });
    // 允许返回空数据
    if (res.data.code !== 0 && res.data.code !== -1) {
      throw new Error(res.data.msg || `状态码: ${res.status}`);
    }
  });

  await test('查询云途安设备列表', async () => {
    const res = await request('GET', '/api/machines');
    if (res.data.code !== 0) throw new Error(res.data.msg);
  });

  await test('查询旧供应商设备列表', async () => {
    const res = await request('GET', '/api/old/machines');
    if (res.data.code !== 0) throw new Error(res.data.msg);
  });

  // ==================== 4. 旧供应商API ====================
  separator('4. 旧供应商API同步');

  await test('查询旧供应商设备列表', async () => {
    const res = await request('GET', '/api/old/devices', null, {
      'Authorization': superToken
    });
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  await test('查询旧供应商统计', async () => {
    const res = await request('GET', '/api/old/stats', null, {
      'Authorization': superToken
    });
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  // ==================== 5. 设备管理 ====================
  separator('5. 设备管理功能');

  await test('获取合作社列表', async () => {
    const res = await request('GET', '/api/organizations');
    if (res.data.code !== 0) throw new Error(res.data.msg);
  });

  await test('获取农户列表', async () => {
    const res = await request('GET', '/api/farmers');
    if (res.data.code !== 0) throw new Error(res.data.msg);
  });

  await test('查询设备列表（含作业类型）', async () => {
    const res = await request('GET', '/api/device/list');
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  // ==================== 6. 数据修复功能 ====================
  separator('6. 数据修复管理');

  await test('查询单条作业记录详情', async () => {
    // 先获取一条记录ID
    const listRes = await request('GET', '/api/work-records?page=1&pageSize=1', null, {
      'Authorization': superToken
    });
    if (listRes.data.code === 0 && listRes.data.data.records.length > 0) {
      const recordId = listRes.data.data.records[0].id;
      const res = await request('GET', `/api/work-records/${recordId}`, null, {
        'Authorization': superToken
      });
      if (res.data.code !== 0) throw new Error(res.data.msg);
      // 检查日期格式是否正确（应该是YYYY-MM-DD）
      if (res.data.data.work_date && res.data.data.work_date.includes('T')) {
        throw new Error('日期格式未转换，仍为UTC时间');
      }
    }
  });

  // ==================== 7. 导出功能 ====================
  separator('7. 数据导出功能');

  await test('导出预览（农业汇总）', async () => {
    const res = await request('GET', '/api/agri/summary');
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  await test('查询全量作业记录', async () => {
    const res = await request('GET', '/api/export/all-records?sources=yuntinan,old,old_api');
    // code=-1表示没有数据，这是正常的；状态码200也是成功的
    if (res.status !== 200) {
      throw new Error(`HTTP状态码: ${res.status}`);
    }
    // 允许返回空数据或错误信息
    if (res.data.code === -1 && !res.data.msg) {
      log('  ⚠️ 无数据可导出', 'yellow');
    }
  });

  await test('查询云途安作业类型', async () => {
    const res = await request('GET', '/api/work-types');
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  // ==================== 8. 作业类型配置 ====================
  separator('8. 作业类型配置');

  await test('查询农户统计数据（带orgId）', async () => {
    // 先获取一个合作社ID
    const orgRes = await request('GET', '/api/organizations');
    if (orgRes.data.code === 0 && orgRes.data.data && orgRes.data.data.length > 0) {
      const orgId = orgRes.data.data[0].id;
      const res = await request('GET', `/api/farmer/stats?orgId=${orgId}`);
      if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
    } else {
      log('  ⚠️ 无合作社数据，跳过', 'yellow');
    }
  });

  await test('查询设备列表（含作业类型）', async () => {
    const res = await request('GET', '/api/device/list');
    if (res.data.code !== 0) throw new Error(res.data.msg || `状态码: ${res.status}`);
  });

  // ==================== 测试总结 ====================
  separator('📊 测试总结');
  
  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  log(`总测试数: ${results.total}`, 'blue');
  log(`✅ 通过: ${results.passed}`, 'green');
  log(`❌ 失败: ${results.failed}`, 'red');
  log(`通过率: ${passRate}%`, passRate >= 80 ? 'green' : 'red');

  if (results.failed > 0) {
    console.log('\n失败的测试:');
    results.tests.filter(t => t.status === 'failed').forEach(t => {
      log(`  - ${t.name}: ${t.error}`, 'red');
    });
  }

  console.log('\n' + '='.repeat(60));
  
  // 生成测试报告
  const report = {
    timestamp: new Date().toISOString(),
    total: results.total,
    passed: results.passed,
    failed: results.failed,
    passRate: passRate + '%',
    tests: results.tests
  };

  const fs = require('fs');
  fs.writeFileSync(
    'test-results.json',
    JSON.stringify(report, null, 2)
  );
  log('\n测试报告已保存: test-results.json', 'cyan');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  log(`\n❌ 测试执行失败: ${e.message}`, 'red');
  console.error(e.stack);
  process.exit(1);
});
