/**
 * 测试使用日期字符串作为时间戳
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

async function testWithDateString() {
  console.log('\n========== 测试日期字符串作为时间戳 ==========\n');
  
  const user = process.env.OLD_API_USER;
  const key = process.env.OLD_API_KEY;
  const baseUrl = process.env.OLD_API_BASE;
  
  // 测试不同的时间戳格式
  const tests = [
    {
      name: 'Unix时间戳（秒）',
      timestamp: Math.floor(Date.now() / 1000).toString(),
    },
    {
      name: '日期字符串 yyyy-MM-dd',
      timestamp: '2026-04-14',
    },
    {
      name: '日期字符串 yyyyMMdd',
      timestamp: '20260414',
    },
    {
      name: '当前日期字符串',
      timestamp: new Date().toISOString().split('T')[0],
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
      console.log('  📦 响应:', JSON.stringify(response.data));
      
      if (response.data.code === 0 || response.data.code === '0') {
        console.log('  ✅✅✅ 业务成功！找到正确的格式了！');
        return; // 成功后退出
      } else {
        console.log('  ❌ 业务失败 - code:', response.data.code, ', message:', response.data.message);
      }
      
    } catch (error) {
      console.log('  ❌ 请求失败:', error.message);
      if (error.response) {
        console.log('     响应:', error.response.data);
      }
    }
    
    // 等待500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n================================\n');
}

testWithDateString();
