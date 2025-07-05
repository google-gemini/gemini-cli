#!/bin/bash

# 测试进度条颜色效果
# 作者: GitHub专家
# 功能: 测试进度条的颜色显示效果

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 进度条函数（带颜色）
show_progress() {
    local current=$1
    local total=$2
    local task_name="$3"
    local width=15
    local percentage=$((current * 100 / total))
    local completed=$((width * current / total))
    local remaining=$((width - completed))
    
    # 确保百分比不超过100%
    if [ "$percentage" -gt 100 ]; then
        percentage=100
    fi
    
    # 构建进度条
    local progress_bar=""
    for ((i=0; i<completed; i++)); do
        progress_bar+="="
    done
    for ((i=0; i<remaining; i++)); do
        progress_bar+="-"
    done
    
    # 显示进度（带颜色）
    printf "\r${BLUE}[%s]${NC} ${GREEN}%s${NC} ${YELLOW}%d%%${NC} ${PURPLE}(%d/%d)${NC}" \
           "$task_name" "$progress_bar" "$percentage" "$current" "$total"
    
    # 如果完成，换行
    if [ "$current" -eq "$total" ]; then
        echo ""
    fi
}

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}        进度条颜色测试工具        ${NC}"
echo -e "${CYAN}========================================${NC}"

# 测试主任务进度条
echo -e "\n${YELLOW}测试主任务进度条:${NC}"
for i in {1..5}; do
    show_progress "$i" "5" "测试任务"
    sleep 0.5
done

# 测试仓库处理进度条
echo -e "\n${YELLOW}测试仓库处理进度条:${NC}"
for i in {1..10}; do
    local percentage=$((i * 100 / 10))
    local width=15
    local completed=$((width * i / 10))
    local remaining=$((width - completed))
    
    local repo_progress_bar=""
    for ((j=0; j<completed; j++)); do
        repo_progress_bar+="="
    done
    for ((j=0; j<remaining; j++)); do
        repo_progress_bar+="-"
    done
    
    printf "\r${YELLOW}[仓库处理]${NC} ${GREEN}%s${NC} ${YELLOW}%d%%${NC} ${PURPLE}(%d/%d)${NC}" \
           "$repo_progress_bar" "$percentage" "$i" "10"
    sleep 0.3
done

# 显示100%完成
local width=15
local completed=$width
local repo_progress_bar=""
for ((j=0; j<completed; j++)); do
    repo_progress_bar+="="
done

printf "\r${YELLOW}[仓库处理]${NC} ${GREEN}%s${NC} ${YELLOW}100%%${NC} ${PURPLE}(10/10)${NC}\n" \
       "$repo_progress_bar"

echo -e "\n${GREEN}颜色测试完成！${NC}"
echo -e "${BLUE}颜色说明:${NC}"
echo -e "  ${BLUE}蓝色${NC}: 任务名称"
echo -e "  ${GREEN}绿色${NC}: 进度条"
echo -e "  ${YELLOW}黄色${NC}: 百分比"
echo -e "  ${PURPLE}紫色${NC}: 计数信息" 