# 数据同步方案指南

## 📋 问题背景

本地开发环境和服务器环境使用**独立的数据库**，导致数据可能出现差异：
- 本地 MySQL: `localhost:3306/agri_gateway`
- 服务器 MySQL: `82.157.186.237:3306/agri_gateway`

---

## 🎯 解决方案对比

### 方案1: API重新同步（推荐）⭐⭐⭐

**原理**: 两个环境都从相同的API源获取数据，定期执行全量或增量同步

**优点**:
- ✅ 数据来源一致（都是云途安API和旧供应商API）
- ✅ 无需直接访问对方数据库
- ✅ 可以控制同步频率和范围
- ✅ 适合分布式部署

**缺点**:
- ⚠️ 需要同步时间窗口内API数据不变
- ⚠️ 依赖API的稳定性

**适用场景**: 
- 开发和生产环境独立部署
- 不需要实时数据一致性
- API数据是权威数据源

**使用方法**:
```bash
# 在本地或服务器上执行
node scripts/sync-and-verify.js
```

**自动化建议**:
- 设置定时任务，每天凌晨执行一次全量同步
- 或者每4小时执行增量同步（只同步昨天的数据）

---

### 方案2: 数据库导出导入

**原理**: 定期将一个环境的数据库导出，导入到另一个环境

**优点**:
- ✅ 数据完全一致（包括所有表）
- ✅ 可以保留历史快照
- ✅ 适合迁移或备份

**缺点**:
- ⚠️ 需要网络连接或文件传输
- ⚠️ 会覆盖目标环境的本地修改
- ⚠️ 不适合频繁同步

**适用场景**:
- 初始化新环境
- 定期备份
- 重大版本升级前

**使用方法**:
```bash
# 从服务器同步到本地
node scripts/sync-database.js from-remote

# 从本地同步到服务器
node scripts/sync-database.js to-remote

# 仅同步指定表
node scripts/sync-database.js tables --tables=work_records,machines --direction=from-remote
```

**注意事项**:
1. 使用前需配置 `scripts/sync-database.js` 中的服务器数据库信息
2. 确保 `mysqldump` 和 `mysql` 命令可用
3. 同步前会自动备份原有数据

---

### 方案3: 共享数据库（不推荐）

**原理**: 本地和服务器连接同一个远程数据库

**优点**:
- ✅ 数据实时一致
- ✅ 无需同步逻辑

**缺点**:
- ❌ 网络延迟影响性能
- ❌ 单点故障风险
- ❌ 需要VPN或内网穿透
- ❌ 安全性问题

**适用场景**: 
- 小型团队内部开发
- 测试环境

---

## 📊 推荐的最佳实践

### 日常开发流程

#### 1. 代码同步
```bash
# 使用Git管理代码（需要先初始化Git）
git pull origin main          # 拉取最新代码
git push origin main          # 推送本地修改
```

#### 2. 数据同步（每天一次）
```bash
# 在本地执行
node scripts/sync-and-verify.js

# 或在服务器上执行（通过SSH）
ssh ubuntu@82.157.186.237 "cd /home/ubuntu/agri-gateway && node scripts/sync-and-verify.js"
```

#### 3. 验证数据一致性
```bash
# 检查统计数据
curl http://localhost:3000/api/agri/summary
curl http://82.157.186.237:3000/api/agri/summary

# 对比返回的 acre、machines、records 是否接近
```

---

### 定期维护流程（每周）

#### 1. 完整数据备份
```bash
# 服务器备份
ssh ubuntu@82.157.186.237 "mysqldump -u root -p agri_gateway > /backup/agri_$(date +%Y%m%d).sql"

# 本地备份
mysqldump -u root -p agri_gateway > ./data/backups/local_$(date +%Y%m%d).sql
```

#### 2. 清理临时文件
```bash
# 删除旧的调试脚本
rm check-*.js fix-*.js manual-*.js

# 清理日志文件
find . -name "*.log" -mtime +7 -delete
```

#### 3. 更新依赖
```bash
npm audit fix        # 修复安全漏洞
npm update           # 更新依赖包
```

---

## 🔧 自动化同步配置

### 方案A: 使用cron定时任务（Linux服务器）

编辑crontab:
```bash
crontab -e
```

添加以下内容:
```cron
# 每天凌晨2点执行全量同步
0 2 * * * cd /home/ubuntu/agri-gateway && /usr/bin/node scripts/sync-and-verify.js >> /var/log/agri-sync.log 2>&1

# 每4小时执行增量同步（仅昨天数据）
0 */4 * * * cd /home/ubuntu/agri-gateway && /usr/bin/node services/scheduler.js --sync-yesterday >> /var/log/agri-incremental.log 2>&1
```

### 方案B: 使用Windows任务计划程序（本地）

创建批处理文件 `auto-sync.bat`:
```batch
@echo off
cd /d "d:\360MoveData\Users\wangbo\Desktop\农机定位\nongji\agri-gateway-release"
node scripts/sync-and-verify.js >> logs\sync-%date:~0,4%%date:~5,2%%date:~8,2%.log
```

在任务计划程序中设置每天执行。

---

## 📈 监控数据一致性

### 创建健康检查接口

在 `routes/index.js` 中添加:
```javascript
router.get('/api/data-health', async (req, res) => {
  try {
    const stats = await db.queryOne(`
      SELECT 
        COUNT(*) as total_records,
        MAX(updated_at) as last_update,
        SUM(CASE WHEN source = 'yuntinan' THEN acre ELSE 0 END) as yuntinan_acre,
        SUM(CASE WHEN source = 'old_api' THEN acre ELSE 0 END) as old_api_acre
      FROM work_records
    `);
    
    res.json({
      code: 0,
      data: {
        status: 'healthy',
        lastSync: stats.last_update,
        totalRecords: stats.total_records,
        yuntinanAcre: stats.yuntinan_acre,
        oldApiAcre: stats.old_api_acre,
        totalAcre: parseFloat(stats.yuntinan_acre) + parseFloat(stats.old_api_acre)
      }
    });
  } catch (e) {
    res.json({ code: -1, msg: e.message });
  }
});
```

### 对比检查脚本

创建 `scripts/compare-environments.js`:
```javascript
const axios = require('axios');

async function compareEnvironments() {
  const localUrl = 'http://localhost:3000/api/data-health';
  const serverUrl = 'http://82.157.186.237:3000/api/data-health';
  
  try {
    const [local, server] = await Promise.all([
      axios.get(localUrl),
      axios.get(serverUrl)
    ]);
    
    console.log('=== 数据一致性对比 ===\n');
    console.log('本地环境:');
    console.log('  总记录:', local.data.data.totalRecords);
    console.log('  总面积:', local.data.data.totalAcre, '亩');
    console.log('  最后更新:', local.data.data.lastSync);
    
    console.log('\n服务器环境:');
    console.log('  总记录:', server.data.data.totalRecords);
    console.log('  总面积:', server.data.data.totalAcre, '亩');
    console.log('  最后更新:', server.data.data.lastSync);
    
    const recordDiff = Math.abs(local.data.data.totalRecords - server.data.data.totalRecords);
    const acreDiff = Math.abs(local.data.data.totalAcre - server.data.data.totalAcre);
    
    console.log('\n差异:');
    console.log('  记录数差异:', recordDiff);
    console.log('  面积差异:', acreDiff.toFixed(2), '亩');
    
    if (recordDiff < 10 && acreDiff < 100) {
      console.log('\n✅ 数据基本一致');
    } else {
      console.log('\n⚠️  数据差异较大，建议执行同步');
    }
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  }
}

compareEnvironments();
```

---

## ⚠️ 注意事项

### 1. 数据冲突处理
- **原则**: API数据是权威数据源
- **策略**: 使用 `ON DUPLICATE KEY UPDATE` 避免重复插入
- **注意**: 手动修改的数据可能会被同步覆盖

### 2. 同步时机选择
- **最佳时间**: 业务低峰期（凌晨2-4点）
- **避免**: 业务高峰期执行全量同步
- **建议**: 增量同步可以更频繁

### 3. 网络问题
- 服务器API访问可能受网络影响
- 建议添加重试机制和超时处理
- 记录同步日志便于排查问题

### 4. 数据安全
- 不要将 `.env` 文件提交到Git
- 数据库密码使用强密码
- 定期更换API密钥

### 5. 性能考虑
- 全量同步可能耗时较长（5-10分钟）
- 建议在后台执行，不要阻塞主服务
- 可以考虑分批同步大量数据

---

## 🎯 总结建议

### 对于当前项目

**推荐方案**: **方案1（API重新同步）** + **方案2（定期备份）**

**具体实施**:
1. ✅ 每天凌晨2点在服务器执行全量同步
2. ✅ 每4小时执行增量同步（昨天数据）
3. ✅ 每周进行一次数据库备份
4. ✅ 每月对比一次本地和服务器数据
5. ✅ 重大变更前先备份再同步

**工具清单**:
- `scripts/sync-and-verify.js` - API数据同步和验证
- `scripts/sync-database.js` - 数据库导出导入
- `scripts/compare-environments.js` - 环境对比检查

---

## 📞 常见问题

### Q1: 为什么不用Git同步数据？
A: Git用于代码版本控制，不适合存储数据库数据。数据库应该通过专门的同步工具管理。

### Q2: 同步会不会丢失数据？
A: 使用 `ON DUPLICATE KEY UPDATE` 策略，不会丢失数据，只会更新已有记录。

### Q3: 如果API挂了怎么办？
A: 同步脚本有错误处理，会跳过失败的请求。可以稍后重试，或使用缓存的最后一次成功数据。

### Q4: 如何知道同步是否成功？
A: 查看同步日志，或运行 `scripts/compare-environments.js` 进行对比检查。

### Q5: 本地和服务器的配置不同怎么办？
A: 使用 `.env` 文件管理环境变量，每个环境有自己的配置。代码保持一致，配置各自独立。

---

**最后更新**: 2026-04-24  
**维护者**: 开发团队
