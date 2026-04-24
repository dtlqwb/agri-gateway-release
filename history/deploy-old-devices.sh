#!/bin/bash
# 农机定位平台 - 一键导入旧设备数据脚本
# 用法: bash deploy-old-devices.sh

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     农机定位平台 - 旧设备数据导入工具                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Node.js
echo -e "${BLUE}[1/5]${NC} 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到Node.js，请先安装Node.js 16+${NC}"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js版本: $NODE_VERSION${NC}"

# 检查npm
echo -e "\n${BLUE}[2/5]${NC} 检查npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到npm${NC}"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm版本: $NPM_VERSION${NC}"

# 检查CSV文件
echo -e "\n${BLUE}[3/5]${NC} 检查CSV数据文件..."
CSV_FILE="templates/旧供应商终端映射表.csv"
if [ ! -f "$CSV_FILE" ]; then
    echo -e "${RED}❌ 错误: 找不到CSV文件: $CSV_FILE${NC}"
    echo -e "${YELLOW}提示: 请确保在项目根目录运行此脚本${NC}"
    exit 1
fi
echo -e "${GREEN}✅ CSV文件存在: $CSV_FILE${NC}"

# 检查.env文件
echo -e "\n${BLUE}[4/5]${NC} 检查配置文件..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  警告: 未找到.env文件${NC}"
    echo -e "${YELLOW}   正在从.env.example复制...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}   ⚠️  请编辑.env文件，配置数据库信息后重新运行${NC}"
        exit 1
    else
        echo -e "${RED}❌ 错误: 也找不到.env.example文件${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ .env文件存在${NC}"
fi

# 安装依赖
echo -e "\n${BLUE}[5/5]${NC} 安装依赖包..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}   首次安装，可能需要几分钟...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 依赖安装失败${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ 依赖已安装${NC}"
fi

# 运行导入脚本
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}开始导入旧设备数据...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

node import-old-devices-from-csv.js

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    ✅ 导入成功！                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo -e "\n${BLUE}下一步:${NC}"
    echo -e "  1. 刷新页面: http://82.157.186.237:3000/index.html"
    echo -e "  2. 应该能看到\"旧供应商\"区块和73台设备"
    echo -e "  3. 如需设置作业类型，可在前端编辑\n"
else
    echo -e "\n${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    ❌ 导入失败                              ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo -e "\n${YELLOW}请检查:${NC}"
    echo -e "  1. .env文件中的数据库配置是否正确"
    echo -e "  2. MySQL服务是否正常运行"
    echo -e "  3. 数据库 agri_gateway 是否已创建"
    echo -e "  4. 查看详细错误信息 above\n"
    exit 1
fi
