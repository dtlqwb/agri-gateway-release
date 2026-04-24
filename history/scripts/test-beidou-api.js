/**
 * 测试北斗API响应
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

async function testAPI() {
  console.log('\n========== 测试北斗API ==========\n');
  
  const user = process.env.OLD_API_USER;
  const key = process.env.OLD_API_KEY;
  const baseUrl = process.env.OLD_API_BASE;
  
  console.log('配置信息:');
  console.log('  BASE_URL:', baseUrl);
  console.log('  USER:', user);
  console.log('  KEY:', key ? '***' + key.slice(-8) : '未设置');
  console.log();
  
  // 测试不同的时间戳格式
  const tests = [
    {
      name: '秒级时间戳',
      timestamp: Math.floor(Date.now() / 1000).toString(),
    },
    {
      name: '毫秒级时间戳',
      timestamp: Date.now().toString(),
    }
  ];
  
  for (const test of tests) {
    console.log(`\n测试: ${test.name}`);
    console.log('  时间戳:', test.timestamp);
    
    const sign = crypto.createHash('md5').update(test.timestamp + key).digest('hex');
    console.log('  签名:', sign);
    
    try {
      const response = await axios.post(
        `${baseUrl}/machine/gps/area`,
        {
          macid: '17070928154',
          day: '2026-04-14'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'user': user,
            'timestamp': test.timestamp,
            'sign': sign
          },
          timeout: 5000
        }
      );
      
      console.log('  ✅ HTTP状态:', response.status);
      console.log('  📦 响应数据:', JSON.stringify(response.data));
      
      // 检查业务code
      if (response.data.code === 0 || response.data.code === '0') {
        console.log('  ✅ 业务成功!');
      } else {
        console.log('  ❌ 业务失败 - code:', response.data.code, ', message:', response.data.message);
      }
      
    } catch (error) {
      console.log('  ❌ 请求失败:', error.message);
      if (error.response) {
        console.log('     HTTP状态:', error.response.status);
        console.log('     响应数据:', error.response.data);
      }
    }
    
    // 等待1秒再测试下一个
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n================================\n');
}

testAPI();
