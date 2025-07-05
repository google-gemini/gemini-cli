#!/bin/bash

# 创建doc分支并提交文档整理工作
# 目标：在doc分支上提交所有文档相关的工作

set -e

echo "🚀 创建doc分支并提交文档整理工作"
echo "=================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Git环境
check_git() {
    echo -e "${BLUE}📋 检查Git环境...${NC}"
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git未安装${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Git已安装${NC}"
}

# 检查Git配置
check_git_config() {
    echo -e "${BLUE}📋 检查Git配置...${NC}"
    
    if ! git config --global user.name &> /dev/null; then
        echo -e "${YELLOW}⚠️  Git用户名未配置${NC}"
        echo "请运行: git config --global user.name 'Your Name'"
        echo "请运行: git config --global user.email 'your.email@example.com'"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Git配置正常${NC}"
    echo "用户: $(git config --global user.name)"
    echo "邮箱: $(git config --global user.email)"
}

# 检查当前状态
check_current_status() {
    echo -e "${BLUE}📋 检查当前Git状态...${NC}"
    
    # 获取当前分支
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    echo "当前分支: $current_branch"
    
    # 检查是否有未提交的更改
    if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
        echo -e "${GREEN}✅ 发现未提交的更改${NC}"
        git status --short
        return 0
    else
        echo -e "${YELLOW}⚠️  没有发现未提交的更改${NC}"
        return 1
    fi
}

# 创建并切换到doc分支
create_doc_branch() {
    echo -e "${BLUE}📋 创建doc分支...${NC}"
    
    # 检查doc分支是否已存在
    if git branch | grep -q "doc"; then
        echo -e "${YELLOW}⚠️  doc分支已存在，切换到该分支${NC}"
        git checkout doc
    else
        echo -e "${GREEN}✅ 创建新的doc分支${NC}"
        git checkout -b doc
    fi
    
    echo -e "${GREEN}✅ 当前分支: $(git branch --show-current)${NC}"
}

# 配置远程仓库
setup_remote() {
    echo -e "${BLUE}📋 配置远程仓库...${NC}"
    
    # 检查远程仓库
    if git remote get-url origin &> /dev/null; then
        current_remote=$(git remote get-url origin)
        echo "当前远程仓库: $current_remote"
        
        if [[ "$current_remote" != "https://github.com/aidencck/gemini-cli.git" ]]; then
            echo -e "${YELLOW}⚠️  更新远程仓库URL${NC}"
            git remote set-url origin https://github.com/aidencck/gemini-cli.git
        fi
    else
        echo -e "${YELLOW}⚠️  添加远程仓库${NC}"
        git remote add origin https://github.com/aidencck/gemini-cli.git
    fi
    
    echo -e "${GREEN}✅ 远程仓库配置完成${NC}"
}

# 添加所有文件
add_all_files() {
    echo -e "${BLUE}📋 添加所有文件到暂存区...${NC}"
    
    git add .
    
    # 显示暂存的文件
    echo "已暂存的文件:"
    git status --short
}

# 提交更改
commit_changes() {
    echo -e "${BLUE}📋 提交文档整理工作...${NC}"
    
    commit_message="feat(docs): 创建doc分支并提交完整的文档整理工作

🎯 本次提交包含完整的项目文档整理和GitHub集成功能

📁 新增文档系统:
- 项目文档索引和分类系统
- 文档质量标准和维护流程
- 项目管理视角的文档组织分析
- 文档迁移计划和实施方案

🔧 GitHub集成工具:
- GitHub仓库分析和设置检查工具
- 多种提交方式和认证配置指南
- 自动化脚本和快速操作工具
- 故障排除和最佳实践指南

📊 技术分析文档:
- GEMINI_CLI深度技术分析报告
- 工程化和Monorepo架构分析
- 业务产品架构和账户体系分析
- 技术亮点和核心功能分析

🤖 自动化脚本:
- GitHub环境分析脚本 (github-analyzer.sh)
- 快速GitHub检查脚本 (quick-github-check.sh)
- 文档管理自动化脚本 (doc-manager.sh)
- 多种提交脚本 (submit-to-github.sh, quick-submit.sh)

📋 操作指南:
- GitHub提交手动操作指南
- GitHub设置总结与行动指南
- 项目文档整理与GitHub提交完整方案
- GitHub提交完成总结

分支: doc
目标: 建立完整的项目文档体系，提升项目管理效率"

    git commit -m "$commit_message"
    echo -e "${GREEN}✅ 文档整理工作已提交${NC}"
}

# 推送到远程仓库
push_doc_branch() {
    echo -e "${BLUE}📋 推送doc分支到远程仓库...${NC}"
    
    if git push -u origin doc; then
        echo -e "${GREEN}✅ doc分支推送成功${NC}"
    else
        echo -e "${YELLOW}⚠️  推送失败，可能需要认证${NC}"
        echo "请确保您有权限推送到该仓库"
        echo "您可能需要配置SSH密钥或个人访问令牌"
        return 1
    fi
}

# 显示成功信息
show_success() {
    echo ""
    echo -e "${GREEN}🎉 doc分支创建和提交成功！${NC}"
    echo ""
    echo "📊 提交统计:"
    echo "分支名称: doc"
    echo "仓库地址: https://github.com/aidencck/gemini-cli"
    echo "提交哈希: $(git rev-parse HEAD)"
    echo ""
    echo "📁 主要提交内容:"
    echo "- 项目文档索引系统"
    echo "- GitHub集成工具和脚本"
    echo "- 项目管理分析报告"
    echo "- 自动化文档管理工具"
    echo "- 技术深度分析文档"
    echo ""
    echo "🔗 查看doc分支: https://github.com/aidencck/gemini-cli/tree/doc"
    echo ""
    echo "💡 后续操作建议:"
    echo "1. 在GitHub上创建Pull Request将doc分支合并到main"
    echo "2. 设置doc分支的保护规则"
    echo "3. 配置GitHub Actions进行文档自动化检查"
    echo "4. 建立文档更新和维护流程"
}

# 显示分支信息
show_branch_info() {
    echo ""
    echo -e "${BLUE}📋 分支信息:${NC}"
    echo "当前分支: $(git branch --show-current)"
    echo "所有分支:"
    git branch -a
    echo ""
    echo "最近提交:"
    git log --oneline -3
}

# 主函数
main() {
    echo "=========================================="
    echo "    创建doc分支并提交文档整理工作"
    echo "=========================================="
    echo ""
    
    # 执行各个步骤
    check_git
    check_git_config
    check_current_status
    create_doc_branch
    setup_remote
    
    # 检查是否有更改需要提交
    if check_current_status; then
        add_all_files
        commit_changes
        if push_doc_branch; then
            show_success
            show_branch_info
        else
            echo -e "${RED}❌ 推送失败，请检查认证和权限${NC}"
            echo "手动推送命令: git push -u origin doc"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  没有更改需要提交${NC}"
        echo "如果您想强制提交当前状态，请手动运行:"
        echo "git add ."
        echo "git commit -m 'your message'"
        echo "git push -u origin doc"
    fi
}

# 错误处理
trap 'echo -e "${RED}❌ 脚本执行失败${NC}"; exit 1' ERR

# 运行主函数
main "$@" 