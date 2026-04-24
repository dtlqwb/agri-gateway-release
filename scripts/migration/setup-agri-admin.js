/**
 * 农业局账号快速配置脚本
 * 用法: node setup-agri-admin.js
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

async function main() {
  log('\n🌾 农机定位平台 - 农业局账号配置工具', 'cyan');
  log('='.repeat(60), 'cyan');

  // 步骤1: 超管登录
  log('\n📝 步骤1: 超级管理员登录', 'blue');
  
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  log(`   用户名: ${adminUsername}`, 'yellow');
  log(`   密码: ${'*'.repeat(adminPassword.length)}`, 'yellow');
  
  const loginRes = await request('POST', '/api/admin/login', {
    username: adminUsername,
    password: adminPassword
  });

  if (loginRes.data.code !== 0) {
    log(`\n❌ 登录失败: ${loginRes.data.msg}`, 'red');
    log('   请检查 .env 文件中的 ADMIN_USERNAME 和 ADMIN_PASSWORD 配置', 'yellow');
    process.exit(1);
  }

  const superToken = loginRes.data.data.token;
  log('   ✅ 登录成功', 'green');

  // 步骤2: 查看现有管理员
  log('\n📋 步骤2: 查看现有管理员列表', 'blue');
  
  const listRes = await request('GET', '/api/admins', null, {
    'Authorization': superToken
  });

  if (listRes.data.code === 0) {
    log(`   当前共有 ${listRes.data.total} 个管理员账号:`, 'cyan');
    listRes.data.data.forEach(admin => {
      const roleIcon = admin.role === 'super' ? '🔑' : '👁️';
      const roleText = admin.role === 'super' ? '超管' : '只读';
      const statusText = admin.status === 1 ? '✅' : '❌';
      log(`   ${statusText} ${roleIcon} ${admin.username.padEnd(15)} ${admin.name?.padEnd(10) || ''} (${roleText})`, 'cyan');
    });
  }

  // 步骤3: 创建农业局账号
  log('\n➕ 步骤3: 创建农业局账号', 'blue');
  
  const agriAdmins = [
    {
      username: 'nongyeju',
      password: process.env.AGRI_PASSWORD || 'nongye123',
      name: '农业局管理员',
      role: 'viewer',
      status: 1
    }
  ];

  for (const admin of agriAdmins) {
    // 检查是否已存在
    const exists = listRes.data.data.find(a => a.username === admin.username);
    
    if (exists) {
      log(`   ⚠️  账号 "${admin.username}" 已存在，跳过`, 'yellow');
      continue;
    }

    log(`   正在创建账号: ${admin.username}`, 'cyan');
    
    const createRes = await request('POST', '/api/admins', admin, {
      'Authorization': superToken
    });

    if (createRes.data.code === 0) {
      log(`   ✅ 创建成功! ID: ${createRes.data.data.id}`, 'green');
      log(`   📝 用户名: ${admin.username}`, 'cyan');
      log(`   🔑 密码: ${admin.password}`, 'cyan');
      log(`   👤 姓名: ${admin.name}`, 'cyan');
      log(`   🔐 角色: 只读（农业局）`, 'cyan');
    } else {
      log(`   ❌ 创建失败: ${createRes.data.msg}`, 'red');
    }
  }

  // 步骤4: 验证账号
  log('\n🧪 步骤4: 验证农业局账号', 'blue');
  
  const testLogin = await request('POST', '/api/admin/login', {
    username: 'nongyeju',
    password: agriAdmins[0].password
  });

  if (testLogin.data.code === 0) {
    log('   ✅ 农业局账号登录验证成功', 'green');
    
    const agriToken = testLogin.data.data.token;
    log(`   🔑 Token: ${agriToken.substring(0, 20)}...`, 'cyan');
    
    // 测试权限
    log('\n   测试权限控制:', 'cyan');
    
    // 尝试访问超管接口（应该失败）
    const testAdmins = await request('GET', '/api/admins', null, {
      'Authorization': agriToken
    });
    
    if (testAdmins.data.code !== 0) {
      log('   ✅ 权限控制正常（无法访问超管接口）', 'green');
    } else {
      log('   ⚠️  警告：农业局账号可以访问超管接口！', 'yellow');
    }
    
    // 尝试访问统计数据（应该成功）
    const testStats = await request('GET', '/api/stats');
    if (testStats.data.code === 0) {
      log('   ✅ 可以正常查看统计数据', 'green');
    } else {
      log('   ❌ 无法查看统计数据', 'red');
    }
  } else {
    log(`   ❌ 登录验证失败: ${testLogin.data.msg}`, 'red');
  }

  // 总结
  log('\n' + '='.repeat(60), 'cyan');
  log('✨ 配置完成！', 'green');
  log('\n📝 农业局账号信息:', 'cyan');
  log('   用户名: nongyeju', 'yellow');
  log(`   密码: ${agriAdmins[0].password}`, 'yellow');
  log('   角色: 只读（viewer）', 'yellow');
  log('\n🔗 访问地址:', 'cyan');
  log('   管理后台: http://localhost:3001', 'yellow');
  log('   农户端: http://localhost:3001/farmer', 'yellow');
  log('\n⚠️  安全提示:', 'red');
  log('   1. 请立即修改默认密码', 'yellow');
  log('   2. 不要将密码泄露给他人', 'yellow');
  log('   3. 定期更换密码（建议每3个月）', 'yellow');
  log('   4. 离职人员账号及时禁用', 'yellow');
  log('\n📚 详细文档: AGRI_BUREAU_ACCOUNT_SETUP.md', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
}

main().catch(err => {
  log(`\n❌ 执行失败: ${err.message}`, 'red');
  console.error(err.stack);
  process.exit(1);
});
