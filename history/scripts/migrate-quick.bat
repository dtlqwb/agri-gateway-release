@echo off
chcp 65001 >nul
echo ========================================
echo   数据库快速迁移工具
echo ========================================
echo.

REM 检查参数
if "%1"=="" (
    echo 用法: migrate-quick.bat ^<云端主机^> ^<用户名^> ^<密码^> [数据库名]
    echo.
    echo 示例: migrate-quick.bat 123.45.67.89 root mypassword agri_gateway
    echo.
    pause
    exit /b 1
)

set CLOUD_HOST=%1
set CLOUD_USER=%2
set CLOUD_PASS=%3
set CLOUD_DB=%4
if "%CLOUD_DB%"=="" set CLOUD_DB=agri_gateway

set BACKUP_FILE=agri_gateway_backup.sql

echo [1/3] 正在导出本地数据库...
mysqldump -u root -proot123 --single-transaction --routines --triggers --default-character-set=utf8mb4 agri_gateway > %BACKUP_FILE%

if errorlevel 1 (
    echo.
    echo ❌ 导出失败！请检查：
    echo    1. MySQL服务是否运行
    echo    2. mysqldump命令是否可用
    echo    3. 用户名密码是否正确
    pause
    exit /b 1
)

echo ✅ 导出成功
for %%A in (%BACKUP_FILE%) do set size=%%~zA
set /a sizeMB=%size%/1024/1024
echo    文件大小: %sizeMB% MB
echo.

echo [2/3] 正在创建云端数据库...
mysql -h %CLOUD_HOST% -u %CLOUD_USER% -p%CLOUD_PASS% -e "CREATE DATABASE IF NOT EXISTS `%CLOUD_DB%` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if errorlevel 1 (
    echo ⚠️  创建数据库警告（可能已存在）
)

echo.
echo [3/3] 正在导入到云端...
mysql -h %CLOUD_HOST% -u %CLOUD_USER% -p%CLOUD_PASS% --default-character-set=utf8mb4 %CLOUD_DB% < %BACKUP_FILE%

if errorlevel 1 (
    echo.
    echo ❌ 导入失败！请检查：
    echo    1. 云端数据库连接是否正常
    echo    2. 防火墙是否开放3306端口
    echo    3. 用户名密码是否正确
    echo    4. 是否有远程访问权限
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✅ 迁移完成！
echo ========================================
echo.
echo 📝 下一步：
echo    1. 更新 .env 文件中的数据库配置
echo    2. 重启服务
echo    3. 验证功能
echo.
echo 💡 备份文件: %BACKUP_FILE%
echo    确认无误后可手动删除
echo.
pause
