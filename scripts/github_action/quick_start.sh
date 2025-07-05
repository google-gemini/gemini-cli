#!/bin/bash

# GitHub Actions 效率分析工具 - 快速启动脚本

set -e

# 颜色定义
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 脚本路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SCRIPT="$SCRIPT_DIR/github_action_check.sh"
TEMPLATE_FILE="$SCRIPT_DIR/github-actions-templates.yml"

echo -e "${BLUE}🚀 GitHub Actions 效率分析工具 - 快速启动${NC}"
echo ""

# 检查主脚本是否存在
if [ ! -f "$MAIN_SCRIPT" ]; then
    echo -e "${RED}❌ 未找到主分析脚本: $MAIN_SCRIPT${NC}"
    exit 1
fi

# 检查是否在Git仓库中
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}⚠️  当前目录不是Git仓库${NC}"
    echo -e "${YELLOW}建议在Git项目根目录运行此工具${NC}"
    echo ""
    read -p "是否继续？(y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 检查是否存在GitHub Actions配置
if [ ! -d ".github/workflows" ]; then
    echo -e "${YELLOW}⚠️  未找到GitHub Actions配置文件 (.github/workflows)${NC}"
    echo ""
    echo -e "${BLUE}📋 可用的操作:${NC}"
    echo "1. 创建示例GitHub Actions配置"
    echo "2. 查看最佳实践模板"
    echo "3. 退出"
    echo ""
    read -p "请选择操作 (1-3): " choice
    
    case $choice in
        1)
            echo -e "${BLUE}📝 创建示例GitHub Actions配置...${NC}"
            mkdir -p .github/workflows
            cp "$TEMPLATE_FILE" .github/workflows/example-ci.yml
            echo -e "${GREEN}✅ 已创建示例配置文件: .github/workflows/example-ci.yml${NC}"
            echo -e "${YELLOW}💡 请根据您的项目需求修改配置文件${NC}"
            ;;
        2)
            echo -e "${BLUE}📋 显示最佳实践模板...${NC}"
            if [ -f "$TEMPLATE_FILE" ]; then
                cat "$TEMPLATE_FILE"
            else
                echo -e "${RED}❌ 模板文件不存在${NC}"
            fi
            exit 0
            ;;
        3)
            echo -e "${BLUE}👋 退出${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 无效选择${NC}"
            exit 1
            ;;
    esac
fi

# 显示当前项目信息
echo -e "${BLUE}📊 项目信息:${NC}"
echo "项目路径: $(pwd)"
echo "Git仓库: $(git remote get-url origin 2>/dev/null || echo '未配置远程仓库')"

# 显示现有的工作流文件
if [ -d ".github/workflows" ]; then
    echo -e "${BLUE}📋 现有的工作流文件:${NC}"
    find .github/workflows -name "*.yml" -o -name "*.yaml" | while read file; do
        echo "  - $(basename "$file")"
    done
fi

echo ""

# 运行分析
echo -e "${BLUE}🔍 开始分析GitHub Actions配置...${NC}"
echo ""

# 执行主分析脚本
"$MAIN_SCRIPT"

echo ""
echo -e "${GREEN}🎉 分析完成！${NC}"
echo ""
echo -e "${BLUE}📋 后续操作建议:${NC}"
echo "1. 查看生成的报告文件"
echo "2. 根据建议优化您的GitHub Actions配置"
echo "3. 定期运行此工具监控性能"
echo "4. 查看最佳实践模板获取更多优化建议"
echo ""
echo -e "${YELLOW}💡 提示: 使用 'cat github-actions-analysis-*.md' 查看最新报告${NC}" 