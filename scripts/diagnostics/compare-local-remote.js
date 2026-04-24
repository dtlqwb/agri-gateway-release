/**
 * 本地 vs 云端项目对比分析脚本
 * 
 * 使用方法:
 * node scripts/diagnostics/compare-local-remote.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===================== 配置 =====================
const CONFIG = {
  serverUser: 'ubuntu',
  serverHost: '82.157.186.237',
  serverPath: '/home/ubuntu/agri-gateway',
  keyFile: 'dtlqnj.pem',  // PEM密钥文件名
  sshCommand: null  // 将在下面构建
};

// 检查密钥文件是否存在（支持多种位置）
const possiblePaths = [
  path.join(__dirname, '..', '..', CONFIG.keyFile),  // 项目根目录
  path.join(process.cwd(), CONFIG.keyFile),           // 当前工作目录
];

let keyPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    keyPath = p;
    break;
  }
}

if (!keyPath) {
  console.error(`❌ 错误: 找不到密钥文件 ${CONFIG.keyFile}`);
  console.error(`   请将密钥文件放在以下位置之一:`);
  console.error(`   - 项目根目录: ${path.join(__dirname, '..', '..')}`);
  console.error(`   - 当前目录: ${process.cwd()}`);
  process.exit(1);
}

// 构建SSH命令
CONFIG.sshCommand = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${CONFIG.serverUser}@${CONFIG.serverHost}`;

console.log('\n=== 📊 本地 vs 云端项目对比分析 ===\n');
console.log(`🔑 使用密钥: ${CONFIG.keyFile}`);
console.log(`🌐 服务器: ${CONFIG.serverUser}@${CONFIG.serverHost}`);
console.log(`📁 项目路径: ${CONFIG.serverPath}`);
console.log('');

// ===================== 工具函数 =====================
function runRemoteCommand(cmd) {
  try {
    const fullCmd = `${CONFIG.sshCommand} "${cmd}"`;
    return execSync(fullCmd, { 
      encoding: 'utf-8', 
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return null;
  }
}

function runLocalCommand(cmd) {
  try {
    return execSync(cmd, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return null;
  }
}

// ===================== 收集本地信息 =====================
console.log('📋 步骤1: 收集本地项目信息');
console.log('-------------------------------------------');

const localInfo = {
  files: [],
  env: {},
  package: null,
  dbConfig: {}
};

// 1. 本地文件列表
try {
  const files = fs.readdirSync(path.join(__dirname, '..', '..'));
  localInfo.files = files.filter(f => !f.startsWith('.') && f !== 'node_modules');
  console.log(`✅ 本地文件/目录数: ${localInfo.files.length} 个`);
} catch (e) {
  console.log('❌ 无法获取本地文件列表');
}

// 2. 本地 .env 配置
try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        localInfo.env[key] = value;
      }
    }
  });
  console.log(`✅ 本地环境变量: ${Object.keys(localInfo.env).length} 个`);
  console.log(`   - PORT: ${localInfo.env.PORT || '未配置'}`);
  console.log(`   - MYSQL_HOST: ${localInfo.env.MYSQL_HOST || '未配置'}`);
  console.log(`   - ENABLE_SCHEDULER: ${localInfo.env.ENABLE_SCHEDULER || '未配置'}`);
  
  localInfo.dbConfig = {
    host: localInfo.env.MYSQL_HOST,
    database: localInfo.env.MYSQL_DATABASE
  };
} catch (e) {
  console.log('❌ 无法读取本地 .env 文件');
}

// 3. 本地 package.json
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  localInfo.package = pkg;
  console.log(`✅ 本地版本: v${pkg.version || '未知'}`);
  console.log(`   - 依赖数: ${Object.keys(pkg.dependencies || {}).length} 个`);
} catch (e) {
  console.log('❌ 无法读取本地 package.json');
}

console.log('');

// ===================== 收集云端信息 =====================
console.log('📋 步骤2: 连接云端并收集信息');
console.log('-------------------------------------------');

const remoteInfo = {
  connected: false,
  files: [],
  env: {},
  package: null,
  pm2Status: null,
  diskUsage: null,
  lastModified: null
};

try {
  // 测试连接
  console.log('  → 测试SSH连接...');
  const testResult = runRemoteCommand('echo "CONNECTED"');
  
  if (testResult === 'CONNECTED') {
    remoteInfo.connected = true;
    console.log('  ✅ SSH连接成功\n');
    
    // 1. 云端文件列表
    console.log('  → 获取云端文件列表...');
    const remoteFiles = runRemoteCommand(`ls -1 ${CONFIG.serverPath}`);
    if (remoteFiles) {
      remoteInfo.files = remoteFiles.split('\n').filter(f => f.trim());
      console.log(`  ✅ 云端文件/目录数: ${remoteInfo.files.length} 个`);
    }
    
    // 2. 云端 .env 配置
    console.log('  → 获取云端环境配置...');
    const envOutput = runRemoteCommand(`grep -E '^(PORT|MYSQL_HOST|MYSQL_DATABASE|ENABLE_SCHEDULER)=' ${CONFIG.serverPath}/.env 2>/dev/null`);
    if (envOutput) {
      envOutput.split('\n').forEach(line => {
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          const key = line.substring(0, eqIndex).trim();
          const value = line.substring(eqIndex + 1).trim();
          remoteInfo.env[key] = value;
        }
      });
      console.log(`  ✅ 云端环境变量: ${Object.keys(remoteInfo.env).length} 个`);
      console.log(`     - PORT: ${remoteInfo.env.PORT || '未配置'}`);
      console.log(`     - MYSQL_HOST: ${remoteInfo.env.MYSQL_HOST || '未配置'}`);
      console.log(`     - ENABLE_SCHEDULER: ${remoteInfo.env.ENABLE_SCHEDULER || '未配置'}`);
    }
    
    // 3. 云端 package.json
    console.log('  → 获取云端版本信息...');
    const pkgOutput = runRemoteCommand(`cat ${CONFIG.serverPath}/package.json 2>/dev/null`);
    if (pkgOutput) {
      try {
        const pkg = JSON.parse(pkgOutput);
        remoteInfo.package = pkg;
        console.log(`  ✅ 云端版本: v${pkg.version || '未知'}`);
      } catch (e) {
        console.log('  ⚠️  无法解析云端 package.json');
      }
    }
    
    // 4. PM2 状态
    console.log('  → 获取PM2服务状态...');
    const pm2Output = runRemoteCommand('pm2 status agri-gateway 2>/dev/null');
    if (pm2Output) {
      if (pm2Output.includes('online')) {
        remoteInfo.pm2Status = 'running';
        console.log('  ✅ PM2状态: 运行中 🟢');
      } else if (pm2Output.includes('stopped')) {
        remoteInfo.pm2Status = 'stopped';
        console.log('  ⚠️  PM2状态: 已停止 🔴');
      } else {
        remoteInfo.pm2Status = 'unknown';
        console.log('  ❓ PM2状态: 未知');
      }
    } else {
      console.log('  ⚠️  PM2未安装或服务不存在');
    }
    
    // 5. 磁盘使用
    console.log('  → 获取项目大小...');
    const diskOutput = runRemoteCommand(`du -sh ${CONFIG.serverPath} 2>/dev/null | cut -f1`);
    if (diskOutput) {
      remoteInfo.diskUsage = diskOutput;
      console.log(`  ✅ 云端项目大小: ${remoteInfo.diskUsage}`);
    }
    
    // 6. 最后修改时间
    console.log('  → 获取最后修改时间...');
    const modOutput = runRemoteCommand(`stat -c %y ${CONFIG.serverPath}/index.js 2>/dev/null | cut -d'.' -f1`);
    if (modOutput) {
      remoteInfo.lastModified = modOutput;
      console.log(`  ✅ 主程序最后修改: ${remoteInfo.lastModified}`);
    }
    
  } else {
    console.log('  ❌ SSH连接失败\n');
  }
  
} catch (error) {
  console.log('  ❌ 连接云端服务器失败');
  console.log('     错误:', error.message.substring(0, 100));
  console.log('\n  💡 可能的原因:');
  console.log('     1. 密钥文件路径不正确');
  console.log('     2. 服务器IP地址错误');
  console.log('     3. 防火墙阻止了SSH连接');
  console.log('     4. 密钥文件权限不正确（Linux/Mac需要 chmod 400）');
}

console.log('');

// ===================== 对比分析 =====================
console.log('📊 步骤3: 对比分析结果');
console.log('===========================================');

// 1. 版本对比
console.log('\n📦 版本对比:');
console.log('-------------------------------------------');
if (localInfo.package && remoteInfo.package) {
  const localVer = localInfo.package.version;
  const remoteVer = remoteInfo.package.version;
  if (localVer === remoteVer) {
    console.log(`✅ 版本一致: v${localVer}`);
  } else {
    console.log(`⚠️  版本不一致:`);
    console.log(`   本地: v${localVer}`);
    console.log(`   云端: v${remoteVer}`);
  }
} else {
  console.log('❌ 无法获取版本信息');
}

// 2. 配置对比
console.log('\n⚙️  配置对比:');
console.log('-------------------------------------------');
const configKeys = ['PORT', 'MYSQL_HOST', 'ENABLE_SCHEDULER'];
configKeys.forEach(key => {
  const localVal = localInfo.env[key] || '(未配置)';
  const remoteVal = remoteInfo.env[key] || '(未配置)';
  
  if (localVal === remoteVal) {
    console.log(`✅ ${key}: ${localVal}`);
  } else {
    console.log(`⚠️  ${key}:`);
    console.log(`   本地: ${localVal}`);
    console.log(`   云端: ${remoteVal}`);
  }
});

// 3. 数据库配置
console.log('\n💾 数据库配置:');
console.log('-------------------------------------------');
if (localInfo.dbConfig.host === remoteInfo.env.MYSQL_HOST) {
  console.log(`✅ 数据库主机一致: ${localInfo.dbConfig.host}`);
} else {
  console.log(`⚠️  数据库主机不一致:`);
  console.log(`   本地: ${localInfo.dbConfig.host || '未配置'}`);
  console.log(`   云端: ${remoteInfo.env.MYSQL_HOST || '未配置'}`);
}

// 4. 文件差异
console.log('\n📁 文件差异:');
console.log('-------------------------------------------');
if (remoteInfo.connected) {
  const localSet = new Set(localInfo.files.map(f => f.toLowerCase()));
  const remoteSet = new Set(remoteInfo.files.map(f => f.toLowerCase()));
  
  const onlyInLocal = [...localSet].filter(f => !remoteSet.has(f));
  const onlyInRemote = [...remoteSet].filter(f => !localSet.has(f));
  
  if (onlyInLocal.length === 0 && onlyInRemote.length === 0) {
    console.log('✅ 文件结构完全一致');
  } else {
    if (onlyInLocal.length > 0) {
      console.log(`📤 仅在本地 (${onlyInLocal.length}个):`);
      onlyInLocal.slice(0, 10).forEach(f => console.log(`   - ${f}`));
      if (onlyInLocal.length > 10) {
        console.log(`   ... 还有 ${onlyInLocal.length - 10} 个`);
      }
    }
    
    if (onlyInRemote.length > 0) {
      console.log(`📥 仅在云端 (${onlyInRemote.length}个):`);
      onlyInRemote.slice(0, 10).forEach(f => console.log(`   - ${f}`));
      if (onlyInRemote.length > 10) {
        console.log(`   ... 还有 ${onlyInRemote.length - 10} 个`);
      }
    }
  }
} else {
  console.log('❌ 无法对比（云端连接失败）');
}

// 5. 服务状态
console.log('\n🚀 服务状态:');
console.log('-------------------------------------------');
if (remoteInfo.pm2Status === 'running') {
  console.log('✅ 云端服务: 运行中');
} else if (remoteInfo.pm2Status === 'stopped') {
  console.log('⚠️  云端服务: 已停止');
} else {
  console.log('❓ 云端服务: 未知');
}

// 6. 项目大小
console.log('\n💿 项目大小:');
console.log('-------------------------------------------');
if (remoteInfo.diskUsage) {
  console.log(`云端项目: ${remoteInfo.diskUsage}`);
}

// ===================== 总结建议 =====================
console.log('\n\n💡 总结与建议');
console.log('===========================================');

if (!remoteInfo.connected) {
  console.log('⚠️  无法连接到云端服务器，请检查:');
  console.log('   1. 网络连接是否正常');
  console.log('   2. 密钥文件是否正确');
  console.log('   3. 服务器IP是否正确');
} else {
  console.log('✅ 成功连接到云端服务器\n');
  
  // 检查关键差异
  const hasVersionDiff = localInfo.package && remoteInfo.package && 
                         localInfo.package.version !== remoteInfo.package.version;
  const hasConfigDiff = configKeys.some(key => 
    localInfo.env[key] !== remoteInfo.env[key]
  );
  
  if (!hasVersionDiff && !hasConfigDiff) {
    console.log('🎉 本地和云端项目基本一致！');
  } else {
    console.log('⚠️  发现以下差异，建议处理:\n');
    
    if (hasVersionDiff) {
      console.log('   1️⃣  版本不一致');
      console.log('      → 建议部署最新代码到云端');
      console.log('      → 运行: deploy-to-server.bat');
    }
    
    if (hasConfigDiff) {
      console.log('\n   2️⃣  配置不一致');
      console.log('      → 检查 .env 文件');
      console.log('      → 确保云端配置正确');
    }
  }
  
  console.log('\n📝 下一步操作建议:');
  console.log('   • 如需部署代码: 运行 deploy-to-server.bat');
  console.log('   • 如需查看云端日志: ssh -i dtlqnj.pem ubuntu@82.157.186.237 "pm2 logs agri-gateway"');
  console.log('   • 如需重启服务: ssh -i dtlqnj.pem ubuntu@82.157.186.237 "pm2 restart agri-gateway"');
}

console.log('\n✅ 对比分析完成！\n');
