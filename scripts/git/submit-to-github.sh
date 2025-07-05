#!/bin/bash

# Gemini CLI 项目 GitHub 提交脚本
# 用于将当前项目内容提交到 https://github.com/aidencck/gemini-cli.git

set -e

echo "🚀 开始提交项目到 GitHub..."
echo "目标仓库: https://github.com/aidencck/gemini-cli.git"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Git是否可用
check_git() {
    echo -e "${BLUE}📋 检查Git环境...${NC}"
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git未安装，请先安装Git${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Git已安装${NC}"
}

# 检查Git配置
check_git_config() {
    echo -e "${BLUE}📋 检查Git配置...${NC}"
    
    # 检查用户配置
    if ! git config --global user.name &> /dev/null; then
        echo -e "${YELLOW}⚠️  Git用户名未配置，请运行:${NC}"
        echo "git config --global user.name 'Your Name'"
        echo "git config --global user.email 'your.email@example.com'"
        echo ""
        read -p "是否现在配置Git用户信息? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "请输入您的Git用户名: " git_username
            read -p "请输入您的Git邮箱: " git_email
            git config --global user.name "$git_username"
            git config --global user.email "$git_email"
            echo -e "${GREEN}✅ Git用户信息已配置${NC}"
        else
            echo -e "${RED}❌ 需要配置Git用户信息才能继续${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Git用户信息已配置${NC}"
        echo "用户名: $(git config --global user.name)"
        echo "邮箱: $(git config --global user.email)"
    fi
}

# 检查远程仓库
check_remote() {
    echo -e "${BLUE}📋 检查远程仓库配置...${NC}"
    
    # 检查是否已有远程仓库
    if git remote get-url origin &> /dev/null; then
        current_remote=$(git remote get-url origin)
        echo "当前远程仓库: $current_remote"
        
        if [[ "$current_remote" != "https://github.com/aidencck/gemini-cli.git" ]]; then
            echo -e "${YELLOW}⚠️  远程仓库不匹配，正在更新...${NC}"
            git remote set-url origin https://github.com/aidencck/gemini-cli.git
            echo -e "${GREEN}✅ 远程仓库已更新${NC}"
        else
            echo -e "${GREEN}✅ 远程仓库配置正确${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  未找到远程仓库，正在添加...${NC}"
        git remote add origin https://github.com/aidencck/gemini-cli.git
        echo -e "${GREEN}✅ 远程仓库已添加${NC}"
    fi
}

# 检查当前状态
check_status() {
    echo -e "${BLUE}📋 检查当前Git状态...${NC}"
    
    # 检查是否有未提交的更改
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${GREEN}✅ 发现未提交的更改${NC}"
        git status --short
        return 0
    else
        echo -e "${YELLOW}⚠️  没有发现未提交的更改${NC}"
        return 1
    fi
}

# 添加文件到暂存区
add_files() {
    echo -e "${BLUE}📋 添加文件到暂存区...${NC}"
    
    # 添加所有文件（包括新文件）
    git add .
    
    # 显示暂存的文件
    echo "已暂存的文件:"
    git status --short
}

# 提交更改
commit_changes() {
    echo -e "${BLUE}📋 提交更改...${NC}"
    
    # 生成提交信息
    commit_message="feat: 添加项目文档整理和GitHub集成功能

- 添加项目文档索引和分类系统
- 创建文档质量标准和维护流程
- 实现GitHub仓库分析和提交工具
- 添加项目管理视角的文档组织分析
- 创建自动化文档管理脚本
- 完善项目架构和工程化分析报告

包含以下主要功能:
* 项目文档索引系统
* 文档质量评估标准
* GitHub仓库集成工具
* 自动化文档管理脚本
* 项目管理分析报告"

    # 提交
    git commit -m "$commit_message"
    echo -e "${GREEN}✅ 更改已提交${NC}"
}

# 推送到远程仓库
push_to_remote() {
    echo -e "${BLUE}📋 推送到远程仓库...${NC}"
    
    # 检查当前分支
    current_branch=$(git branch --show-current)
    echo "当前分支: $current_branch"
    
    # 尝试推送
    if git push -u origin "$current_branch"; then
        echo -e "${GREEN}✅ 成功推送到远程仓库${NC}"
    else
        echo -e "${YELLOW}⚠️  推送失败，可能需要认证${NC}"
        echo "请确保您有权限推送到该仓库"
        echo "您可能需要:"
        echo "1. 配置SSH密钥"
        echo "2. 使用个人访问令牌"
        echo "3. 确认仓库权限"
        return 1
    fi
}

# 显示成功信息
show_success() {
    echo ""
    echo -e "${GREEN}🎉 项目提交成功！${NC}"
    echo ""
    echo "📊 提交统计:"
    echo "仓库地址: https://github.com/aidencck/gemini-cli"
    echo "分支: $(git branch --show-current)"
    echo "提交哈希: $(git rev-parse HEAD)"
    echo ""
    echo "📁 主要添加的文件:"
    echo "- 项目文档索引系统"
    echo "- 文档质量标准和维护流程"
    echo "- GitHub集成工具和脚本"
    echo "- 项目管理分析报告"
    echo "- 自动化文档管理工具"
    echo ""
    echo "🔗 查看仓库: https://github.com/aidencck/gemini-cli"
}

# 主函数
main() {
    echo "=========================================="
    echo "    Gemini CLI 项目 GitHub 提交工具"
    echo "=========================================="
    echo ""
    
    # 执行各个步骤
    check_git
    check_git_config
    check_remote
    
    # 检查是否有更改需要提交
    if check_status; then
        add_files
        commit_changes
        if push_to_remote; then
            show_success
        else
            echo -e "${RED}❌ 推送失败，请检查认证和权限${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  没有更改需要提交${NC}"
        echo "如果您想强制推送当前状态，请手动运行:"
        echo "git add ."
        echo "git commit -m 'your message'"
        echo "git push origin main"
    fi
}

# 错误处理
trap 'echo -e "${RED}❌ 脚本执行失败${NC}"; exit 1' ERR

# 运行主函数
main "$@" 