# Scripts 目录结构说明

本目录包含各种工具脚本，按功能分类组织。

## 📁 目录结构

### tests/ - 测试脚本
用于功能测试和验证的脚本。

- `test-all-features.js` - 全量功能自动化测试（根目录）
- `test-remote-db.js` - 远程数据库连接测试
- `test-sync-api.js` - 同步API测试
- `test-export-with-old.js` - 导出功能测试

### diagnostics/ - 诊断和检查脚本
用于数据检查、问题诊断的脚本。

- `check-all-data.js` - 全面数据检查
- `check-device-types.js` - 设备类型分析
- `check-duplicates.js` - 重复记录检查
- `check-machines-sync.js` - 设备同步状态检查
- `check-missing-device.js` - 缺失设备检查
- `check-no-org.js` - 未关联合作社设备检查
- `check-user-devices.js` - 用户设备列表验证
- `check-work-types.js` - 作业类型分布检查
- `diagnose-data-consistency.js` - 数据一致性诊断
- `diagnose-old-sync.js` - 旧供应商同步诊断
- `analyze-data-sources.js` - 数据源分析

### sync-tools/ - 数据同步工具
用于数据同步和导入的工具脚本。

- `sync-and-verify.js` - 数据同步与验证
- `sync-database.js` - 数据库导出导入工具
- `sync-old-history.js` - 旧供应商历史数据同步
- `sync-beidou-range.js` - 北斗设备批量同步
- `manual-sync-today.js` - 手动同步今天数据
- `manual-sync-yuntinan.js` - 手动同步云途安数据
- `manual-sync-old-supplier.js` - 手动同步旧供应商数据

### migration/ - 数据迁移和初始化脚本
用于数据迁移、初始化和批量导入的脚本。

- `import-old-devices.js` - 导入旧供应商设备
- `import-old-devices-from-csv.js` - 从CSV导入旧设备
- `import-beidou-devices.js` - 导入北斗设备
- `add-missing-devices.js` - 添加缺失设备
- `create-device-mapping.js` -创建设备映射
- `setup-agri-admin.js` - 初始化管理员账号

### utilities/ - 实用工具脚本
其他辅助工具和一次性脚本。

- `check-april16-data.js` - 特定日期数据检查（临时）
- `check-data-dates.js` - 数据日期范围检查（临时）
- `check-latest-dates.js` - 最新数据日期检查（临时）
- `check-export-logic.js` - 导出逻辑检查（临时）
- `check-export-sources.js` - 导出数据源检查（临时）
- `verify-export-data.js` - 导出数据验证（临时）
- `test-old-machines-query.js` - 旧设备查询测试（临时）

---

## 📝 使用说明

### 运行脚本

```bash
# 进入scripts目录
cd scripts

# 运行特定脚本
node tests/test-remote-db.js
node diagnostics/check-all-data.js
node sync-tools/sync-and-verify.js
```

### 添加新脚本

1. 根据脚本功能选择合适的子目录
2. 使用描述性的文件名
3. 在脚本开头添加注释说明用途
4. 更新本README文件

### 清理临时脚本

定期清理 `utilities/` 目录中的一次性脚本：
- 已完成的临时检查脚本
- 已过期的数据验证脚本
- 不再使用的调试脚本

---

## 🗂️ 根目录脚本说明

以下脚本保留在根目录，因为它们有特殊用途：

- `deploy-to-server.bat` - Windows部署脚本
- `deploy-to-server.sh` - Linux/Mac部署脚本
- `deploy-old-devices.bat` - 旧设备批量部署脚本
- `test-all-features.js` - 主测试脚本（方便直接运行）
- `OPTIMIZATION_REPORT.md` - 优化报告文档

---

**最后更新**: 2026-04-24  
**维护者**: 开发团队
