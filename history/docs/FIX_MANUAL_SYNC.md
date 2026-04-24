# 手动同步功能修复说明

## 问题描述

在核对页面点击"手动同步"按钮时，提示错误：
```
同步请求失败: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

## 问题原因

前端调用的是 `/api/sync/yuntinan` 接口，但该路由在后端不存在，导致服务器返回HTML错误页面（404页面），而不是JSON响应。

## 解决方案

### 1. 新增同步路由

在 `routes/yunTinan.js` 中添加了 `POST /api/sync/yuntinan` 路由，实现以下功能：

#### 功能特性

✅ **同时同步两种数据源**：
- 云途安（新设备）
- 旧供应商API（旧设备）

✅ **支持三种同步模式**：
- `recent` - 增量同步（最近7天，默认）
- `all` - 全量同步
- `single` - 单日期同步（需指定date参数）

✅ **详细的返回结果**：
```json
{
  "code": 0,
  "data": {
    "yuntinan": {
      "success": true,
      "mode": "recent",
      "message": "同步完成，请查看日志"
    },
    "oldApi": {
      "success": true,
      "date": "2026-04-17",
      "totalDevices": 42,
      "successCount": 23,
      "failCount": 0,
      "totalAcre": 1080.85,
      "batchCount": 1,
      "elapsedSeconds": 8.90
    },
    "startTime": "2026-04-18T07:30:00.000Z",
    "endTime": "2026-04-18T07:30:30.000Z"
  },
  "msg": "同步完成"
}
```

### 2. 同步流程

```
用户点击"手动同步"
    ↓
前端发送 POST /api/sync/yuntinan
    ↓
后端执行同步：
  1. 同步云途安数据（新设备）
     - 根据mode选择同步策略
     - 调用 yunTinanService.syncData()
     - 保存到 work_records 表
  
  2. 同步旧供应商API数据（旧设备）
     - 自动同步昨天的数据
     - 调用 oldSupplierService.syncDayData()
     - 分批处理（每批200条）
     - 保存到 work_records 表
    ↓
返回同步结果
    ↓
前端轮询同步状态
    ↓
同步完成后刷新数据
```

### 3. 代码位置

**新增路由**：
- 文件：`routes/yunTinan.js`
- 行数：第129-247行

**关键代码**：
```javascript
router.post('/sync/yuntinan', async (req, res) => {
  try {
    const { mode = 'recent', date } = req.body;
    
    // 1. 同步云途安数据
    if (mode === 'single' && date) {
      // 单日期同步
      const result = await ytService.syncSingleDate(date);
      // ... 保存到数据库
    } else {
      // 全量或增量同步
      await scheduler.runYuntinanSync(mode);
    }
    
    // 2. 同步旧供应商API数据（昨天）
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const oldResult = await oldService.syncDayData(yesterdayStr);
    
    // 返回结果
    res.json({ code: 0, data: results, msg: '同步完成' });
  } catch (error) {
    res.json({ code: -1, msg: error.message });
  }
});
```

## 使用方法

### 前端使用

1. 打开核对页面（`http://localhost:3001`）
2. 切换到"📋 核对"标签
3. 点击"📥 手动同步"按钮
4. 等待同步完成（会自动刷新数据）

### API调用

```bash
# 增量同步（最近7天）
curl -X POST http://localhost:3001/api/sync/yuntinan \
  -H "Content-Type: application/json" \
  -d '{"mode": "recent"}'

# 全量同步
curl -X POST http://localhost:3001/api/sync/yuntinan \
  -H "Content-Type: application/json" \
  -d '{"mode": "all"}'

# 单日期同步
curl -X POST http://localhost:3001/api/sync/yuntinan \
  -H "Content-Type: application/json" \
  -d '{"mode": "single", "date": "2026-04-17"}'
```

## 测试验证

### 测试结果

✅ 路由正常工作
✅ 云途安数据同步成功
✅ 旧供应商API数据同步成功
✅ 返回正确的JSON格式
✅ 同步耗时合理（约30-60秒）

### 日志示例

```
[手动同步] 开始同步: mode=recent, date=N/A
[手动同步] 1/2 同步云途安数据...
[自动同步] 每日增量同步，拉取最近7天数据...
[云途安] 共获取 42 台设备
[云途安] 旋耕作业: API返回 1409 条, 符合条件 598 条
[云途安] 玉米收获: API返回 139 条, 符合条件 2 条
[云途安] 玉米播种: API返回 1028 条, 符合条件 371 条
[云途安] 最近7天同步完成, 共 971 条作业记录
[手动同步] 云途安同步完成
[手动同步] 2/2 同步旧供应商API数据...
[旧供应商] 共 42 台设备，采用分批处理（每批200条）
[旧供应商] 处理第 1 批 (1-42)...
[旧供应商] 第 1 批完成，累计成功 23 台
[旧供应商] 同步完成: 成功 23, 失败 0, 总面积 1080.85 亩, 耗时 8.90秒
[手动同步] 旧供应商API同步完成
[手动同步] 全部同步完成
```

## 注意事项

1. **同步时间**：
   - 云途安同步：约20-40秒（取决于设备数量）
   - 旧供应商API同步：约10-30秒（42台设备）
   - 总耗时：约30-70秒

2. **旧供应商数据**：
   - 自动同步**昨天**的数据
   - 如需同步其他日期，请使用旧供应商API管理页面

3. **并发控制**：
   - 同步过程中会检查是否已有同步任务在运行
   - 避免重复同步导致数据混乱

4. **错误处理**：
   - 单个数据源同步失败不影响另一个
   - 返回结果中会标明哪个成功、哪个失败

## 相关文件

- `routes/yunTinan.js` - 新增同步路由
- `services/scheduler.js` - 云途安同步逻辑
- `services/yunTinanService.js` - 云途安API服务
- `services/oldSupplierService.js` - 旧供应商API服务
- `public/index.html` - 前端同步按钮（L1818-1862）

## 总结

✅ 问题已完全解决
✅ 路由已正确注册
✅ 同时支持新旧设备同步
✅ 返回标准JSON格式
✅ 提供详细的同步结果

现在用户可以正常使用"手动同步"功能，不会再出现"Unexpected token '<'"的错误。
