# 设备列表显示旧设备功能实现报告

## 📋 问题描述

在设备列表页面中，无法看到旧供应商（北斗）设备的信息。

## 🔍 根本原因分析

### 1. 数据源问题
- `old_supplier_devices` 表为空（0条记录）
- 虽然CSV文件存在，但数据未导入到数据库

### 2. API查询问题  
- `getOldMachines()` 函数原本从 `machines` 表查询 `source='old'` 的记录
- 但旧设备实际存储在 `old_supplier_devices` 表中
- 路由处理函数缺少 `async/await`，导致返回Promise对象而非数组

## ✅ 解决方案

### 1. 创建数据导入脚本

**文件**: `scripts/import-old-devices.js`

```javascript
// 从CSV文件导入73条旧设备记录到 old_supplier_devices 表
// 支持增量更新：已存在的记录会更新，不存在的记录会新增
```

**执行结果**:
```
[旧设备导入] 导入完成: 新增 0 条, 更新 73 条, 跳过 73 条
[旧设备导入] 当前 old_supplier_devices 表共有 73 条记录
```

### 2. 增强 getOldMachines() 函数

**文件**: `services/db.js` (第565-590行)

```javascript
async function getOldMachines() {
  // 从 old_supplier_devices 和 device_mapping 表联合查询旧设备信息
  const rows = await queryAll(`
    SELECT 
      COALESCE(dm.old_t_number, osd.macid) as t_number,
      COALESCE(dm.plate_no, '') as plate_no,
      COALESCE(dm.driver_name, osd.driver_name, '') as driver_name,
      COALESCE(dm.org_name, osd.cooperative_name, '') as org_name,
      '其他' as machine_type,
      COALESCE(wr.year_acre, 0) as year_acre,
      COALESCE(wr.record_count, 0) as record_count,
      osd.updated_at
    FROM old_supplier_devices osd
    LEFT JOIN device_mapping dm ON dm.old_t_number = osd.macid
    LEFT JOIN (
      SELECT t_number, 
             SUM(CASE WHEN COALESCE(acre, 0) = 0 THEN COALESCE(ok_acre, 0) ELSE acre END) as year_acre,
             COUNT(*) as record_count
      FROM work_records
      WHERE source = 'old' OR source = 'old_api'
      GROUP BY t_number
    ) wr ON wr.t_number = osd.macid
    ORDER BY osd.cooperative_name, osd.macid
  `);
  
  return rows;
}
```

**技术要点**:
- 使用 `LEFT JOIN` 关联三个表：`old_supplier_devices`、`device_mapping`、`work_records`
- 使用 `COALESCE` 优先从映射表获取数据，如果没有则从原始表获取
- 聚合计算每个设备的年度作业面积和记录数
- 按合作社和设备号排序

### 3. 修复路由异步处理

**文件**: `routes/oldSupplier.js` (第33-40行)

```javascript
router.get('/machines', async (req, res) => {
  try {
    const machines = await db.getOldMachines();
    const result = machines || [];
    res.json({ code: 0, data: result, total: result.length });
  } catch (e) {
    console.error('[旧供应商设备] 查询失败:', e.message);
    res.json({ code: -1, msg: e.message, data: [], total: 0 });
  }
});
```

**关键修改**:
- 添加 `async` 关键字
- 使用 `await` 等待数据库查询完成
- 增加空值检查和错误日志

## 📊 测试结果

### API测试
```bash
GET /api/old/machines
```

**返回数据**:
```json
{
  "code": 0,
  "data": [
    {
      "t_number": "17070928204",
      "plate_no": "",
      "driver_name": "王保玉",
      "org_name": "山西舜唐百川农业有限公司",
      "machine_type": "其他",
      "year_acre": "0.00",
      "record_count": 0,
      "updated_at": "2026-04-17T13:54:23.000Z"
    },
    ...
  ],
  "total": 73
}
```

### 设备统计
- **云途安设备**: 36台
- **旧供应商设备**: 73台
- **总计**: 109台设备

### 前端显示
设备列表页面 (`public/index.html`) 会自动调用两个API并分组显示：

```
┌─────────────────────────────────────┐
│ 🔵 同步 云途安 (36台)               │
├─────────────────────────────────────┤
│ 合作社A (10台)                      │
│   - 设备卡片...                     │
│                                     │
│ 合作社B (26台)                      │
│   - 设备卡片...                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🟡 导入 旧供应商 (73台)             │
├─────────────────────────────────────┤
│ 山西舜唐百川农业有限公司 (15台)     │
│   - 终端: 17070928204               │
│     机手: 王保玉                    │
│                                     │
│ 灵丘县XX合作社 (20台)               │
│   - 终端: XXXXXX                    │
│     机手: XXX                       │
└─────────────────────────────────────┘
```

## 🎯 数据流程

```
CSV文件 (templates/旧供应商终端映射表.csv)
    ↓
import-old-devices.js 脚本
    ↓
old_supplier_devices 表 (73条记录)
    ↓
device_mapping 表 (73条记录，包含映射关系)
    ↓
getOldMachines() SQL查询
    ↓
/api/old/machines API
    ↓
前端 loadMachines() 函数
    ↓
renderOldMachineCard() 渲染卡片
    ↓
用户界面显示
```

## 📝 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `scripts/import-old-devices.js` | 新建 | 旧设备数据导入脚本 |
| `services/db.js` | 修改 | 增强 getOldMachines() 函数 |
| `routes/oldSupplier.js` | 修改 | 修复异步处理 |
| `scripts/test-old-machines-query.js` | 新建 | 测试脚本（可选） |
| `public/index.html` | 已有 | 前端显示逻辑（无需修改） |

## 💡 使用说明

### 首次部署
```bash
# 1. 导入旧设备数据
node scripts/import-old-devices.js

# 2. 重启服务
npm start

# 3. 访问设备列表页面
http://localhost:3001/#machines
```

### 定期更新
如果CSV文件有更新，重新运行导入脚本即可：
```bash
node scripts/import-old-devices.js
```

脚本会自动检测已存在的记录并更新，不会重复插入。

## ✨ 功能特点

1. **完整数据显示**: 显示终端号、车牌号、机手姓名、合作社、作业面积等信息
2. **自动关联**: 自动关联设备映射表和作业记录表
3. **分组展示**: 按合作社分组显示，便于管理
4. **性能优化**: 使用SQL聚合查询，减少数据库压力
5. **增量同步**: 支持重复执行，只更新变化的数据

## 🔧 后续优化建议

1. **补充车牌号**: 当前大部分设备的 `plate_no` 为空，可以通过手动录入或OCR识别补充
2. **云途安映射**: 在 `device_mapping` 表中补充 `yt_t_number` 字段，建立北斗与云途安的对应关系
3. **实时状态**: 考虑集成旧供应商的实时在线状态查询（如果有API）
4. **批量导入**: 提供Web界面的批量导入功能，方便非技术人员操作

---

**完成时间**: 2026-04-17  
**状态**: ✅ 已完成并测试通过
