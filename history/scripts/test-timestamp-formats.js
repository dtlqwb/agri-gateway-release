const crypto = require('crypto');
const key = '998c50f71d4740a79d11d0101f196f8f';

console.log('\n测试不同的时间戳格式:\n');

// 测试不同的时间戳格式
const formats = [
  { name: '10位秒级', value: Math.floor(Date.now() / 1000).toString() },
  { name: '13位毫秒级', value: Date.now().toString() },
  { name: '日期字符串ISO', value: new Date().toISOString() },
  { name: '格式化日期YYYYMMDDHHmmss', value: new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14) }
];

formats.forEach(f => {
  const sign = crypto.createHash('md5').update(f.value + key).digest('hex');
  console.log(`${f.name}:`);
  console.log(`  值: ${f.value}`);
  console.log(`  签名: ${sign}\n`);
});
