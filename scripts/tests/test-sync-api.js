/**
 * 测试手动同步API
 */
require('dotenv').config();

async function testSyncAPI() {
  console.log('=== 测试手动同步API ===\n');
  
  const API = 'http://localhost:3000';
  
  try {
    console.log('1. 测试增量同步（最近7天）...');
    const res1 = await fetch(`${API}/api/sync/yuntinan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'recent' })
    });
    
    const data1 = await res1.json();
    console.log('响应状态:', res1.status);
    console.log('响应数据:', JSON.stringify(data1, null, 2));
    console.log();
    
    if (data1.code === 0) {
      console.log('✅ 增量同步API正常');
      console.log('   云途安:', data1.data.yuntinan?.success ? '成功' : '失败');
      console.log('   旧API:', data1.data.oldApi?.success ? '成功' : '失败');
    } else {
      console.log('❌ 增量同步API失败:', data1.msg);
    }
    
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
  }
  
  console.log('\n=== 测试完成 ===');
}

testSyncAPI();
