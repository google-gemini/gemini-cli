#!/bin/bash

# 查看GitHub分析汇总文件
# 快速查看最新的分析结果

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_FILE="${SCRIPT_DIR}/github_analysis_summary.txt"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}    GitHub分析结果查看器    ${NC}"
echo -e "${CYAN}========================================${NC}"

# 检查汇总文件是否存在
if [ ! -f "$SUMMARY_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} 未找到分析汇总文件: $SUMMARY_FILE"
    echo -e "${YELLOW}[TIP]${NC} 请先运行分析脚本: ./github_account_check.sh"
    exit 1
fi

# 显示文件信息
file_size=$(du -h "$SUMMARY_FILE" | cut -f1)
file_time=$(stat -c %y "$SUMMARY_FILE" | cut -d' ' -f1,2)

echo -e "${BLUE}[INFO]${NC} 汇总文件: $SUMMARY_FILE"
echo -e "${BLUE}[INFO]${NC} 文件大小: $file_size"
echo -e "${BLUE}[INFO]${NC} 最后修改: $file_time"
echo -e ""

# 显示汇总内容
if command -v bat &> /dev/null; then
    # 使用bat进行语法高亮显示
    bat --style=numbers --color=always "$SUMMARY_FILE"
elif command -v cat &> /dev/null; then
    # 使用cat显示
    cat "$SUMMARY_FILE"
else
    echo -e "${RED}[ERROR]${NC} 无法显示文件内容"
    exit 1
fi

echo -e "\n${GREEN}[SUCCESS]${NC} 汇总文件显示完成" 