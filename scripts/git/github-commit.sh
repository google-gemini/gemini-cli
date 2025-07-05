#!/bin/bash

# Gemini CLI 文档整理 GitHub 提交脚本
# 用于将文档整理工作提交到个人GitHub仓库

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
Gemini CLI 文档整理 GitHub 提交脚本

用法: $0 [命令] [选项]

命令:
    setup                  设置Git配置和远程仓库
    commit                 提交文档整理工作
    push                   推送到远程仓库
    create-fork           创建Fork仓库
    all                    执行完整的提交流程

选项:
    --username <用户名>    设置GitHub用户名
    --email <邮箱>         设置Git邮箱
    --repo <仓库名>        设置目标仓库名
    --branch <分支名>      设置分支名 (默认: docs-improvement)
    --message <提交信息>   设置提交信息

示例:
    $0 setup --username your-username --email your-email@example.com
    $0 commit --message "docs: 完善项目文档结构和质量标准"
    $0 all --username your-username --repo gemini-cli-docs
EOF
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --username)
                GITHUB_USERNAME="$2"
                shift 2
                ;;
            --email)
                GITHUB_EMAIL="$2"
                shift 2
                ;;
            --repo)
                REPO_NAME="$2"
                shift 2
                ;;
            --branch)
                BRANCH_NAME="$2"
                shift 2
                ;;
            --message)
                COMMIT_MESSAGE="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                COMMAND="$1"
                shift
                ;;
        esac
    done
}

# 设置默认值
setup_defaults() {
    BRANCH_NAME=${BRANCH_NAME:-"docs-improvement"}
    COMMIT_MESSAGE=${COMMIT_MESSAGE:-"docs: 完善项目文档结构和质量标准"}
    REPO_NAME=${REPO_NAME:-"gemini-cli-docs"}
}

# 检查Git状态
check_git_status() {
    log_info "检查Git状态..."
    
    if ! git status > /dev/null 2>&1; then
        log_error "当前目录不是Git仓库"
        exit 1
    fi
    
    log_info "Git仓库状态正常"
}

# 设置Git配置
setup_git_config() {
    log_info "设置Git配置..."
    
    if [[ -n "$GITHUB_USERNAME" ]]; then
        git config user.name "$GITHUB_USERNAME"
        log_info "设置用户名: $GITHUB_USERNAME"
    fi
    
    if [[ -n "$GITHUB_EMAIL" ]]; then
        git config user.email "$GITHUB_EMAIL"
        log_info "设置邮箱: $GITHUB_EMAIL"
    fi
    
    # 检查配置
    local username=$(git config user.name)
    local email=$(git config user.email)
    
    if [[ -z "$username" || -z "$email" ]]; then
        log_warn "Git配置不完整，请手动设置:"
        echo "git config user.name '您的用户名'"
        echo "git config user.email '您的邮箱'"
    else
        log_info "Git配置完成: $username <$email>"
    fi
}

# 创建新分支
create_branch() {
    log_info "创建新分支: $BRANCH_NAME"
    
    # 检查分支是否已存在
    if git branch --list "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
        log_warn "分支 $BRANCH_NAME 已存在，切换到该分支"
        git checkout "$BRANCH_NAME"
    else
        git checkout -b "$BRANCH_NAME"
        log_info "成功创建并切换到分支: $BRANCH_NAME"
    fi
}

# 添加文件到暂存区
add_files() {
    log_info "添加文档文件到暂存区..."
    
    # 添加新创建的文档文件
    local files_to_add=(
        "docs/README.md"
        "docs/文档迁移计划.md"
        "docs/文档质量标准规范.md"
        "项目管理视角的文档组织分析报告.md"
        "项目文档索引.md"
        "项目文件操作指南.md"
        "文档整理工作总结.md"
        "scripts/doc-manager.sh"
        "scripts/github-commit.sh"
    )
    
    for file in "${files_to_add[@]}"; do
        if [[ -f "$file" ]]; then
            git add "$file"
            log_info "添加文件: $file"
        else
            log_warn "文件不存在: $file"
        fi
    done
    
    # 添加其他未跟踪的文档文件
    git add "*.md" 2>/dev/null || true
    git add "docs/*.md" 2>/dev/null || true
    git add "scripts/*.sh" 2>/dev/null || true
    
    log_info "文件添加完成"
}

# 提交更改
commit_changes() {
    log_info "提交更改..."
    
    if git diff --cached --quiet; then
        log_warn "没有更改需要提交"
        return
    fi
    
    git commit -m "$COMMIT_MESSAGE"
    log_info "提交完成: $COMMIT_MESSAGE"
}

# 设置远程仓库
setup_remote() {
    log_info "设置远程仓库..."
    
    # 检查是否已有远程仓库
    if git remote get-url origin > /dev/null 2>&1; then
        local current_remote=$(git remote get-url origin)
        log_info "当前远程仓库: $current_remote"
        
        # 如果是官方仓库，添加新的远程仓库
        if [[ "$current_remote" == *"google-gemini/gemini-cli"* ]]; then
            if [[ -n "$GITHUB_USERNAME" ]]; then
                local new_remote="https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
                git remote add fork "$new_remote"
                log_info "添加Fork仓库: $new_remote"
            else
                log_warn "请提供GitHub用户名来设置Fork仓库"
            fi
        fi
    else
        log_warn "没有设置远程仓库"
    fi
}

# 推送到远程仓库
push_to_remote() {
    log_info "推送到远程仓库..."
    
    local remote_name="origin"
    
    # 检查是否有fork远程仓库
    if git remote get-url fork > /dev/null 2>&1; then
        remote_name="fork"
        log_info "推送到Fork仓库"
    fi
    
    git push -u "$remote_name" "$BRANCH_NAME"
    log_info "推送完成"
}

# 创建Fork仓库
create_fork() {
    log_info "创建Fork仓库..."
    
    if [[ -z "$GITHUB_USERNAME" ]]; then
        log_error "请提供GitHub用户名"
        exit 1
    fi
    
    log_info "请在GitHub上手动创建仓库: $REPO_NAME"
    log_info "仓库URL: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
    
    # 等待用户确认
    read -p "仓库创建完成后按回车继续..."
    
    # 设置远程仓库
    git remote add fork "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
    log_info "Fork仓库设置完成"
}

# 显示提交摘要
show_summary() {
    log_info "=== 提交摘要 ==="
    echo "分支: $BRANCH_NAME"
    echo "提交信息: $COMMIT_MESSAGE"
    echo "仓库: $REPO_NAME"
    
    if [[ -n "$GITHUB_USERNAME" ]]; then
        echo "GitHub用户: $GITHUB_USERNAME"
        echo "Fork仓库URL: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
    fi
    
    echo ""
    log_info "=== 提交的文件 ==="
    git diff --cached --name-only
    
    echo ""
    log_info "=== 下一步操作 ==="
    echo "1. 检查提交的文件是否正确"
    echo "2. 推送到远程仓库: git push -u origin $BRANCH_NAME"
    echo "3. 在GitHub上创建Pull Request"
    echo "4. 或者直接推送到您的个人仓库"
}

# 主函数
main() {
    cd "$PROJECT_ROOT"
    
    # 解析参数
    parse_args "$@"
    setup_defaults
    
    case "$COMMAND" in
        setup)
            check_git_status
            setup_git_config
            setup_remote
            log_info "Git配置设置完成"
            ;;
        commit)
            check_git_status
            create_branch
            add_files
            commit_changes
            show_summary
            ;;
        push)
            check_git_status
            push_to_remote
            ;;
        create-fork)
            create_fork
            ;;
        all)
            check_git_status
            setup_git_config
            create_branch
            add_files
            commit_changes
            setup_remote
            push_to_remote
            show_summary
            ;;
        *)
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@" 