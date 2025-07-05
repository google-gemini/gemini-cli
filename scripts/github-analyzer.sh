#!/bin/bash

# GitHub 设置分析脚本
# 分析当前系统的Git和GitHub配置信息

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_section() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 分析Git配置
analyze_git_config() {
    log_section "Git 配置分析"
    
    if ! command_exists git; then
        log_error "Git 未安装"
        return 1
    fi
    
    log_info "Git 版本: $(git --version)"
    
    # 检查Git配置
    echo ""
    log_info "Git 全局配置:"
    if git config --global --list 2>/dev/null | grep -q .; then
        git config --global --list | while read -r line; do
            echo "  $line"
        done
    else
        log_warn "未设置Git全局配置"
    fi
    
    echo ""
    log_info "Git 本地配置:"
    if git config --local --list 2>/dev/null | grep -q .; then
        git config --local --list | while read -r line; do
            echo "  $line"
        done
    else
        log_warn "未设置Git本地配置"
    fi
    
    # 检查关键配置
    echo ""
    log_info "关键配置检查:"
    
    local user_name=$(git config user.name 2>/dev/null || echo "未设置")
    local user_email=$(git config user.email 2>/dev/null || echo "未设置")
    local core_editor=$(git config core.editor 2>/dev/null || echo "未设置")
    local init_default_branch=$(git config init.defaultBranch 2>/dev/null || echo "未设置")
    
    echo "  用户名: $user_name"
    echo "  邮箱: $user_email"
    echo "  编辑器: $core_editor"
    echo "  默认分支: $init_default_branch"
}

# 分析Git仓库状态
analyze_git_repo() {
    log_section "Git 仓库状态分析"
    
    if ! git status >/dev/null 2>&1; then
        log_error "当前目录不是Git仓库"
        return 1
    fi
    
    log_info "当前仓库状态:"
    git status --porcelain | while read -r line; do
        echo "  $line"
    done
    
    echo ""
    log_info "当前分支: $(git branch --show-current)"
    
    echo ""
    log_info "分支列表:"
    git branch -a | while read -r line; do
        echo "  $line"
    done
    
    echo ""
    log_info "最近提交:"
    git log --oneline -5 | while read -r line; do
        echo "  $line"
    done
}

# 分析远程仓库
analyze_remote_repos() {
    log_section "远程仓库分析"
    
    if ! git remote >/dev/null 2>&1; then
        log_warn "未配置远程仓库"
        return
    fi
    
    log_info "远程仓库列表:"
    git remote -v | while read -r line; do
        echo "  $line"
    done
    
    echo ""
    log_info "远程分支:"
    git branch -r | while read -r line; do
        echo "  $line"
    done
}

# 分析GitHub认证
analyze_github_auth() {
    log_section "GitHub 认证分析"
    
    # 检查SSH密钥
    echo ""
    log_info "SSH 密钥检查:"
    if [ -d ~/.ssh ]; then
        local ssh_keys=$(find ~/.ssh -name "*.pub" 2>/dev/null | wc -l)
        if [ "$ssh_keys" -gt 0 ]; then
            log_info "发现 $ssh_keys 个SSH公钥:"
            find ~/.ssh -name "*.pub" 2>/dev/null | while read -r key; do
                echo "  $key"
            done
        else
            log_warn "未找到SSH公钥"
        fi
    else
        log_warn "SSH目录不存在"
    fi
    
    # 检查GitHub CLI
    echo ""
    log_info "GitHub CLI 检查:"
    if command_exists gh; then
        log_info "GitHub CLI 已安装: $(gh --version | head -n1)"
        
        # 检查认证状态
        if gh auth status >/dev/null 2>&1; then
            log_info "GitHub CLI 认证状态:"
            gh auth status 2>/dev/null | while read -r line; do
                echo "  $line"
            done
        else
            log_warn "GitHub CLI 未认证"
        fi
    else
        log_warn "GitHub CLI 未安装"
    fi
    
    # 检查Git凭证
    echo ""
    log_info "Git 凭证检查:"
    if command_exists git-credential; then
        log_info "Git 凭证助手可用"
    else
        log_warn "Git 凭证助手不可用"
    fi
}

# 分析网络连接
analyze_network() {
    log_section "网络连接分析"
    
    # 检查GitHub连接
    echo ""
    log_info "GitHub 连接测试:"
    if ping -c 1 github.com >/dev/null 2>&1; then
        log_info "GitHub.com 连接正常"
    else
        log_error "无法连接到 GitHub.com"
    fi
    
    # 检查SSH连接
    echo ""
    log_info "SSH 连接测试:"
    if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        log_info "SSH 连接到 GitHub 成功"
    else
        log_warn "SSH 连接到 GitHub 失败或未配置"
    fi
}

# 分析环境变量
analyze_environment() {
    log_section "环境变量分析"
    
    echo ""
    log_info "GitHub 相关环境变量:"
    local github_vars=("GITHUB_TOKEN" "GITHUB_USERNAME" "GITHUB_EMAIL" "GIT_AUTHOR_NAME" "GIT_AUTHOR_EMAIL" "GIT_COMMITTER_NAME" "GIT_COMMITTER_EMAIL")
    
    for var in "${github_vars[@]}"; do
        if [ -n "${!var}" ]; then
            echo "  $var: ${!var}"
        fi
    done
    
    echo ""
    log_info "Git 相关环境变量:"
    local git_vars=("GIT_SSH_COMMAND" "GIT_SSL_NO_VERIFY" "GIT_HTTP_USER_AGENT")
    
    for var in "${git_vars[@]}"; do
        if [ -n "${!var}" ]; then
            echo "  $var: ${!var}"
        fi
    done
}

# 分析系统信息
analyze_system() {
    log_section "系统信息分析"
    
    echo ""
    log_info "操作系统: $(uname -s) $(uname -r)"
    log_info "主机名: $(hostname)"
    log_info "当前用户: $(whoami)"
    log_info "当前目录: $(pwd)"
    
    echo ""
    log_info "Shell 信息:"
    log_info "  当前Shell: $SHELL"
    log_info "  Shell版本: $($SHELL --version 2>/dev/null | head -n1 || echo "未知")"
}

# 生成建议
generate_recommendations() {
    log_section "配置建议"
    
    echo ""
    log_info "基于分析结果的建议:"
    
    # 检查Git配置
    if ! git config user.name >/dev/null 2>&1; then
        echo "  1. 设置Git用户名: git config --global user.name '您的用户名'"
    fi
    
    if ! git config user.email >/dev/null 2>&1; then
        echo "  2. 设置Git邮箱: git config --global user.email '您的邮箱'"
    fi
    
    # 检查SSH密钥
    if [ ! -f ~/.ssh/id_rsa.pub ] && [ ! -f ~/.ssh/id_ed25519.pub ]; then
        echo "  3. 生成SSH密钥: ssh-keygen -t ed25519 -C '您的邮箱'"
        echo "  4. 添加SSH密钥到GitHub: 复制 ~/.ssh/id_ed25519.pub 内容到GitHub设置"
    fi
    
    # 检查GitHub CLI
    if ! command_exists gh; then
        echo "  5. 安装GitHub CLI: 参考 https://cli.github.com/"
    fi
    
    # 检查远程仓库
    if ! git remote >/dev/null 2>&1; then
        echo "  6. 添加远程仓库: git remote add origin <仓库URL>"
    fi
}

# 生成报告
generate_report() {
    local report_file="$PROJECT_ROOT/github-analysis-report.md"
    
    log_section "生成分析报告"
    
    cat > "$report_file" << EOF
# GitHub 设置分析报告

生成时间: $(date)
系统: $(uname -s) $(uname -r)
用户: $(whoami)

## Git 配置

### 版本信息
\`\`\`
$(git --version 2>/dev/null || echo "Git 未安装")
\`\`\`

### 全局配置
\`\`\`
$(git config --global --list 2>/dev/null || echo "未设置全局配置")
\`\`\`

### 本地配置
\`\`\`
$(git config --local --list 2>/dev/null || echo "未设置本地配置")
\`\`\`

## 仓库状态

### 当前状态
\`\`\`
$(git status --porcelain 2>/dev/null || echo "不是Git仓库")
\`\`\`

### 分支信息
\`\`\`
$(git branch -a 2>/dev/null || echo "无法获取分支信息")
\`\`\`

### 远程仓库
\`\`\`
$(git remote -v 2>/dev/null || echo "未配置远程仓库")
\`\`\`

## 认证状态

### SSH 密钥
\`\`\`
$(find ~/.ssh -name "*.pub" 2>/dev/null || echo "未找到SSH公钥")
\`\`\`

### GitHub CLI
\`\`\`
$(gh --version 2>/dev/null || echo "GitHub CLI 未安装")
\`\`\`

## 网络连接

### GitHub 连接
\`\`\`
$(ping -c 1 github.com >/dev/null 2>&1 && echo "连接正常" || echo "连接失败")
\`\`\`

## 环境变量

### GitHub 相关
\`\`\`
$(env | grep -i github || echo "未设置GitHub相关环境变量")
\`\`\`

### Git 相关
\`\`\`
$(env | grep -i git || echo "未设置Git相关环境变量")
\`\`\`

## 建议

$(generate_recommendations | sed 's/^/### /')

---

*此报告由 github-analyzer.sh 自动生成*
EOF
    
    log_info "分析报告已生成: $report_file"
}

# 主函数
main() {
    cd "$PROJECT_ROOT"
    
    echo "GitHub 设置分析工具"
    echo "=================="
    echo ""
    
    # 分析各个组件
    analyze_system
    analyze_git_config
    analyze_git_repo
    analyze_remote_repos
    analyze_github_auth
    analyze_network
    analyze_environment
    
    # 生成建议
    generate_recommendations
    
    # 生成报告
    generate_report
    
    echo ""
    log_info "分析完成！详细报告已保存到 github-analysis-report.md"
}

# 显示帮助信息
show_help() {
    cat << EOF
GitHub 设置分析工具

用法: $0 [选项]

选项:
    -h, --help      显示帮助信息
    -r, --report    只生成报告文件
    -v, --verbose   详细输出

功能:
    1. 分析Git配置
    2. 检查仓库状态
    3. 验证GitHub认证
    4. 测试网络连接
    5. 检查环境变量
    6. 生成配置建议
    7. 输出分析报告

示例:
    $0              # 完整分析
    $0 --report     # 只生成报告
    $0 --verbose    # 详细输出
EOF
}

# 解析命令行参数
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -r|--report)
        generate_report
        exit 0
        ;;
    -v|--verbose)
        set -x
        main
        ;;
    "")
        main
        ;;
    *)
        log_error "未知选项: $1"
        show_help
        exit 1
        ;;
esac 