@echo off
chcp 65001 >nul
REM 农机定位平台 - Windows一键导入旧设备数据脚本
REM 用法: deploy-old-devices.bat

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║     农机定位平台 - 旧设备数据导入工具                      ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM 检查Node.js
echo [1/5] 检查Node.js环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到Node.js，请先安装Node.js 16+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js版本: %NODE_VERSION%

REM 检查npm
echo.
echo [2/5] 检查npm...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到npm
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm版本: %NPM_VERSION%

REM 检查CSV文件
echo.
echo [3/5] 检查CSV数据文件...
if not exist "templates\旧供应商终端映射表.csv" (
    echo ❌ 错误: 找不到CSV文件: templates\旧供应商终端映射表.csv
    echo 提示: 请确保在项目根目录运行此脚本
    pause
    exit /b 1
)
echo ✅ CSV文件存在

REM 检查.env文件
echo.
echo [4/5] 检查配置文件...
if not exist ".env" (
    echo ⚠️  警告: 未找到.env文件
    if exist ".env.example" (
        echo    正在从.env.example复制...
        copy .env.example .env >nul
        echo    ⚠️  请编辑.env文件，配置数据库信息后重新运行
        pause
        exit /b 1
    ) else (
        echo ❌ 错误: 也找不到.env.example文件
        pause
        exit /b 1
    )
) else (
    echo ✅ .env文件存在
)

REM 安装依赖
echo.
echo [5/5] 安装依赖包...
if not exist "node_modules" (
    echo    首次安装，可能需要几分钟...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo ✅ 依赖已安装
)

REM 运行导入脚本
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 开始导入旧设备数据...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

call node import-old-devices-from-csv.js

if %errorlevel% equ 0 (
    echo.
    echo ╔═══════════════════════════════════════════════════════════╗
    echo ║                    ✅ 导入成功！                            ║
    echo ╚═══════════════════════════════════════════════════════════╝
    echo.
    echo 下一步:
    echo   1. 刷新页面: http://82.157.186.237:3000/index.html
    echo   2. 应该能看到"旧供应商"区块和73台设备
    echo   3. 如需设置作业类型，可在前端编辑
    echo.
) else (
    echo.
    echo ╔═══════════════════════════════════════════════════════════╗
    echo ║                    ❌ 导入失败                              ║
    echo ╚═══════════════════════════════════════════════════════════╝
    echo.
    echo 请检查:
    echo   1. .env文件中的数据库配置是否正确
    echo   2. MySQL服务是否正常运行
    echo   3. 数据库 agri_gateway 是否已创建
    echo   4. 查看详细错误信息 above
    echo.
)

pause
