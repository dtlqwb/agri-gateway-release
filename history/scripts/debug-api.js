/**
 * 详细诊断北斗API问题
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

function debugAPI() {
  console.log('\n========== 北斗API详细诊断 ==========\n');
  
  const user = process.env.OLD_API_USER;
  const key = process.env.OLD_API_KEY;
  
  // 生成时间戳和签名
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = crypto.createHash('md5').update(timestamp + key).digest('hex');
  
  console.log('📋 请求信息:');
  console.log('  URL: http://60.188.243.23:28111/machine/gps/area');
  console.log('  Method: POST');
  console.log('  Headers:');
  console.log('    Content-Type: application/json');
  console.log('    user:', user);
  console.log('    timestamp:', timestamp);
  console.log('    sign:', sign);
  console.log();
  
  const postData = JSON.stringify({
    macid: '17070928154',
    day: '2026-04-14'
  });
  
  console.log('📦 请求体:');
  console.log(' ', postData);
  console.log();
  
  const options = {
    hostname: '60.188.243.23',
    port: 28111,
    path: '/machine/gps/area',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'user': user,
      'timestamp': timestamp,
      'sign': sign
    }
  };
  
  console.log('⏳ 发送请求...\n');
  
  const req = http.request(options, (res) => {
    console.log('📨 响应信息:');
    console.log('  状态码:', res.statusCode);
    console.log('  状态消息:', res.statusMessage);
    console.log('  响应头:');
    Object.keys(res.headers).forEach(key => {
      console.log(`    ${key}: ${res.headers[key]}`);
    });
    console.log();
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📄 响应体:');
      console.log(' ', data);
      console.log();
      
      try {
        const json = JSON.parse(data);
        console.log('🔍 解析结果:');
        console.log('  code:', json.code);
        console.log('  message:', json.message);
        console.log();
        
        if (json.code === 0 || json.code === '0') {
          console.log('✅ 业务成功!');
        } else {
          console.log('❌ 业务失败');
          console.log();
          console.log('💡 可能原因:');
          console.log('  1. 时间戳超时 - 检查系统时间是否与API服务器同步');
          console.log('  2. 签名错误 - 检查签名算法');
          console.log('  3. 参数错误 - 检查macid和day格式');
          console.log('  4. 认证失败 - 检查user和key是否正确');
        }
      } catch (e) {
        console.log('❌ 无法解析JSON响应');
      }
      
      console.log('\n================================\n');
    });
  });
  
  req.on('error', (e) => {
    console.error('❌ 请求错误:', e.message);
    console.log('\n================================\n');
  });
  
  req.write(postData);
  req.end();
}

debugAPI();
