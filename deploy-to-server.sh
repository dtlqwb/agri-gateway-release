#!/bin/bash
# 自动部署脚本 - 将本地代码部署到云服务器
# 使用方法: ./deploy-to-server.sh

set -e  # 遇到错误立即退出

# 配置
SERVER_USER="ubuntu"
SERVER_HOST="82.157.186.237"
SERVER_PATH="/home/ubuntu/agri-gateway"
BACKUP_DIR="/home/ubuntu/agri-gateway-backups"

echo "=========================================="
echo "🚀 开始部署到云服务器"
echo "=========================================="
echo ""

# 1. 检查本地是否有未提交的更改
echo "📋 步骤1: 检查Git状态"
if [ -d ".git" ]; then
    GIT_STATUS=$(git status --porcelain)
    if [ -n "$GIT_STATUS" ]; then
        echo "⚠️  检测到未提交的更改:"
        echo "$GIT_STATUS"
        read -p "是否继续部署？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ 部署取消"
            exit 1
        fi
    fi
else
    echo "ℹ️  非Git仓库，跳过检查"
fi
echo ""

# 2. 创建服务器备份
echo "📦 步骤2: 在服务器上创建备份"
ssh ${SERVER_USER}@${SERVER_HOST} << EOF
    mkdir -p ${BACKUP_DIR}
    TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
    cp -r ${SERVER_PATH} ${BACKUP_DIR}/agri-gateway_\${TIMESTAMP}
    echo "✅ 备份完成: ${BACKUP_DIR}/agri-gateway_\${TIMESTAMP}"
    
    # 保留最近5个备份
    cd ${BACKUP_DIR}
    ls -t | tail -n +6 | xargs rm -rf 2>/dev/null || true
    echo "✅ 清理旧备份完成"
EOF
echo ""

# 3. 上传文件到服务器
echo "📤 步骤3: 上传文件到服务器"

# 排除不需要上传的文件
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'data' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude 'uploads' \
    ./ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/

echo "✅ 文件上传完成"
echo ""

# 4. 在服务器上安装依赖和重启
echo "🔄 步骤4: 在服务器上安装依赖并重启服务"
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
    cd /home/ubuntu/agri-gateway
    
    echo "  → 安装依赖..."
    npm install --production
    
    echo "  → 重启服务..."
    pm2 restart agri-gateway || pm2 start ecosystem.config.js
    
    echo "  → 等待服务启动..."
    sleep 3
    
    echo "  → 检查服务状态..."
    pm2 status agri-gateway
    
    echo "  → 测试API..."
    curl -s http://localhost:3000/api/health | head -c 200
    echo ""
EOF

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "📊 验证部署："
echo "  前端: http://${SERVER_HOST}:3000"
echo "  API:  http://${SERVER_HOST}:3000/api/health"
echo ""
echo "💡 提示："
echo "  - 查看日志: ssh ${SERVER_USER}@${SERVER_HOST} 'pm2 logs agri-gateway'"
echo "  - 回滚: ssh ${SERVER_USER}@${SERVER_HOST} 'cd ${BACKUP_DIR} && ls -t'"
echo ""
