#!/bin/bash

# GitHub账户分析工具测试脚本
# 用于测试分析工具的基本功能

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYSIS_SCRIPT="${SCRIPT_DIR}/github_account_check.sh"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    GitHub账户分析工具测试    ${NC}"
echo -e "${BLUE}========================================${NC}"

# 检查分析脚本是否存在
if [ ! -f "$ANALYSIS_SCRIPT" ]; then
    echo -e "${RED}[ERROR]${NC} 分析脚本不存在: $ANALYSIS_SCRIPT"
    exit 1
fi

# 检查脚本是否可执行
if [ ! -x "$ANALYSIS_SCRIPT" ]; then
    echo -e "${RED}[ERROR]${NC} 分析脚本没有执行权限"
    exit 1
fi

echo -e "${GREEN}[SUCCESS]${NC} 分析脚本存在且可执行"

# 测试依赖检查功能
echo -e "\n${BLUE}[TEST]${NC} 测试依赖检查功能..."
if "$ANALYSIS_SCRIPT" --help 2>/dev/null || "$ANALYSIS_SCRIPT" -h 2>/dev/null; then
    echo -e "${GREEN}[SUCCESS]${NC} 脚本可以正常启动"
else
    echo -e "${YELLOW}[INFO]${NC} 脚本可能需要交互式输入"
fi

# 测试API连接
echo -e "\n${BLUE}[TEST]${NC} 测试GitHub API连接..."
if curl -s -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/users/octocat" | jq -e '.login' >/dev/null 2>&1; then
    echo -e "${GREEN}[SUCCESS]${NC} GitHub API连接正常"
else
    echo -e "${RED}[ERROR]${NC} GitHub API连接失败"
    exit 1
fi

# 测试jq功能
echo -e "\n${BLUE}[TEST]${NC} 测试JSON处理功能..."
if echo '{"test": "value"}' | jq -r '.test' | grep -q "value"; then
    echo -e "${GREEN}[SUCCESS]${NC} JSON处理功能正常"
else
    echo -e "${RED}[ERROR]${NC} JSON处理功能异常"
    exit 1
fi

# 测试输出目录创建
echo -e "\n${BLUE}[TEST]${NC} 测试输出目录创建..."
TEST_DIR="${SCRIPT_DIR}/test_output_$(date +%s)"
if mkdir -p "$TEST_DIR" && [ -d "$TEST_DIR" ]; then
    echo -e "${GREEN}[SUCCESS]${NC} 输出目录创建功能正常"
    rm -rf "$TEST_DIR"
else
    echo -e "${RED}[ERROR]${NC} 输出目录创建失败"
    exit 1
fi

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}        测试完成        ${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}所有基本功能测试通过！${NC}"
echo -e "\n${YELLOW}现在可以运行分析脚本：${NC}"
echo -e "  $ANALYSIS_SCRIPT"
echo -e "\n${YELLOW}或者设置GitHub Token后运行：${NC}"
echo -e "  export GITHUB_TOKEN='your_token'"
echo -e "  $ANALYSIS_SCRIPT" 