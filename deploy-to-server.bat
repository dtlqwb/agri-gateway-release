@echo off
REM 自动部署脚本 - Windows版本
REM 将本地代码部署到云服务器
REM 使用方法: deploy-to-server.bat

echo ==========================================
echo 🚀 开始部署到云服务器
echo ==========================================
echo.

REM 配置
set SERVER_USER=ubuntu
set SERVER_HOST=82.157.186.237
set SERVER_PATH=/home/ubuntu/agri-gateway

echo 📋 步骤1: 检查文件
if exist ".git" (
    echo ℹ️  Git仓库检测到
) else (
    echo ℹ️  非Git仓库
)
echo.

echo 📦 步骤2: 打包文件（排除不需要的文件）
tar.exe -czf agri-gateway-deploy.tar.gz ^
    --exclude=node_modules ^
    --exclude=.git ^
    --exclude=data ^
    --exclude=*.log ^
    --exclude=.env ^
    --exclude=uploads ^
    --exclude=history ^
    --exclude=check-*.js ^
    --exclude=fix-*.js ^
    --exclude=manual-*.js ^
    --exclude=deploy-*.bat ^
    --exclude=deploy-*.sh ^
    .

if errorlevel 1 (
    echo ❌ 打包失败
    exit /b 1
)
echo ✅ 打包完成: agri-gateway-deploy.tar.gz
echo.

echo 📤 步骤3: 上传到服务器
scp agri-gateway-deploy.tar.gz %SERVER_USER%@%SERVER_HOST%:/tmp/

if errorlevel 1 (
    echo ❌ 上传失败
    del agri-gateway-deploy.tar.gz
    exit /b 1
)
echo ✅ 上传完成
echo.

echo 🔄 步骤4: 在服务器上解压和部署
ssh %SERVER_USER%@%SERVER_HOST% "bash -s" << REMOTE_SCRIPT
    cd /home/ubuntu/agri-gateway
    
    echo "  → 创建备份..."
    TIMESTAMP=$(date +%%Y%%m%%d_%%H%%M%%S)
    mkdir -p /home/ubuntu/agri-gateway-backups
    tar -czf /home/ubuntu/agri-gateway-backups/backup_$TIMESTAMP.tar.gz . 2>/dev/null || true
    echo "  ✅ 备份完成"
    
    echo "  → 清理旧备份（保留最近5个）..."
    cd /home/ubuntu/agri-gateway-backups
    ls -t | tail -n +6 | xargs rm -f 2>/dev/null || true
    echo "  ✅ 清理完成"
    
    echo "  → 解压新代码..."
    cd /home/ubuntu/agri-gateway
    tar -xzf /tmp/agri-gateway-deploy.tar.gz
    rm /tmp/agri-gateway-deploy.tar.gz
    echo "  ✅ 解压完成"
    
    echo "  → 安装依赖..."
    npm install --production
    echo "  ✅ 依赖安装完成"
    
    echo "  → 重启服务..."
    pm2 restart agri-gateway 2>/dev/null || pm2 start ecosystem.config.js
    echo "  ✅ 服务重启完成"
    
    echo "  → 等待服务启动..."
    sleep 3
    
    echo "  → 检查服务状态..."
    pm2 status agri-gateway
    
    echo "  → 测试API..."
    curl -s http://localhost:3000/api/health
    echo ""
REMOTE_SCRIPT

if errorlevel 1 (
    echo ⚠️  远程执行出现警告，请手动检查服务器状态
)

echo.
echo ==========================================
echo ✅ 部署完成！
echo ==========================================
echo.
echo 📊 验证部署：
echo   前端: http://%SERVER_HOST%:3000
echo   API:  http://%SERVER_HOST%:3000/api/health
echo.
echo 💡 提示：
echo   - 查看日志: ssh %SERVER_USER%@%SERVER_HOST% "pm2 logs agri-gateway"
echo   - 查看状态: ssh %SERVER_USER%@%SERVER_HOST% "pm2 status"
echo.

REM 清理临时文件
del agri-gateway-deploy.tar.gz

pause
