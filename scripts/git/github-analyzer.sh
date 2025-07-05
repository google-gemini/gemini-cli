#!/bin/bash

# GitHub 设置分析脚本 - 美化版本
# 分析当前系统的Git和GitHub配置信息，输出简洁美观的报告

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 美化输出函数
print_header() {
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║                    GitHub 设置分析工具                      ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo -e "${BOLD}${PURPLE}▸ $1${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_subsection() {
    echo -e "${BOLD}${BLUE}  • $1${NC}"
}

print_success() {
    echo -e "    ${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "    ${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "    ${RED}✗${NC} $1"
}

print_info() {
    echo -e "    ${BLUE}ℹ${NC} $1"
}

print_divider() {
    echo -e "${CYAN}────────────────────────────────────────────────────────────────────────────────${NC}"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 分析系统信息
analyze_system() {
    print_section "系统信息"
    
    print_subsection "基本信息"
    print_info "操作系统: $(uname -s) $(uname -r)"
    print_info "主机名: $(hostname)"
    print_info "当前用户: $(whoami)"
    print_info "工作目录: $(pwd)"
    
    print_subsection "Shell环境"
    print_info "Shell: $SHELL"
    print_info "版本: $($SHELL --version 2>/dev/null | head -n1 | cut -d' ' -f4- || echo "未知")"
    echo ""
}

# 分析Git配置
analyze_git_config() {
    print_section "Git 配置"
    
    if ! command_exists git; then
        print_error "Git 未安装"
        return 1
    fi
    
    print_subsection "版本信息"
    print_success "Git $(git --version | cut -d' ' -f3)"
    
    print_subsection "用户配置"
    local user_name=$(git config user.name 2>/dev/null || echo "未设置")
    local user_email=$(git config user.email 2>/dev/null || echo "未设置")
    
    if [ "$user_name" != "未设置" ]; then
        print_success "用户名: $user_name"
    else
        print_warning "用户名: $user_name"
    fi
    
    if [ "$user_email" != "未设置" ]; then
        print_success "邮箱: $user_email"
    else
        print_warning "邮箱: $user_email"
    fi
    
    print_subsection "其他配置"
    local core_editor=$(git config core.editor 2>/dev/null || echo "未设置")
    local init_default_branch=$(git config init.defaultBranch 2>/dev/null || echo "未设置")
    
    print_info "默认编辑器: $core_editor"
    print_info "默认分支: $init_default_branch"
    echo ""
}

# 分析Git仓库状态
analyze_git_repo() {
    print_section "仓库状态"
    
    if ! git status >/dev/null 2>&1; then
        print_error "当前目录不是Git仓库"
        return 1
    fi
    
    print_subsection "基本信息"
    print_success "当前目录是Git仓库"
    
    local current_branch=$(git branch --show-current 2>/dev/null || echo "未知")
    print_info "当前分支: $current_branch"
    
    local remote_url=$(git remote get-url origin 2>/dev/null || echo "未设置")
    if [ "$remote_url" != "未设置" ]; then
        print_success "远程仓库: $remote_url"
    else
        print_warning "远程仓库: $remote_url"
    fi
    
    print_subsection "文件状态"
    local modified=$(git status --porcelain | grep "^ M" | wc -l)
    local staged=$(git status --porcelain | grep "^M " | wc -l)
    local untracked=$(git status --porcelain | grep "^??" | wc -l)
    
    if [ "$modified" -gt 0 ]; then
        print_warning "已修改文件: $modified 个"
    fi
    if [ "$staged" -gt 0 ]; then
        print_info "已暂存文件: $staged 个"
    fi
    if [ "$untracked" -gt 0 ]; then
        print_warning "未跟踪文件: $untracked 个"
    fi
    if [ "$modified" -eq 0 ] && [ "$staged" -eq 0 ] && [ "$untracked" -eq 0 ]; then
        print_success "工作区干净"
    fi
    
    print_subsection "最近提交"
    git log --oneline -3 2>/dev/null | while read -r line; do
        print_info "$line"
    done
    echo ""
}

# 分析GitHub认证
analyze_github_auth() {
    print_section "GitHub 认证"
    
    print_subsection "SSH 密钥"
    if [ -d ~/.ssh ]; then
        local ssh_keys=$(find ~/.ssh -name "*.pub" 2>/dev/null | wc -l)
        if [ "$ssh_keys" -gt 0 ]; then
            print_success "发现 $ssh_keys 个SSH公钥"
            find ~/.ssh -name "*.pub" 2>/dev/null | head -3 | while read -r key; do
                print_info "$(basename "$key")"
            done
            if [ "$ssh_keys" -gt 3 ]; then
                print_info "... 还有 $((ssh_keys - 3)) 个密钥"
            fi
        else
            print_warning "未找到SSH公钥"
        fi
    else
        print_warning "SSH目录不存在"
    fi
    
    print_subsection "GitHub CLI"
    if command_exists gh; then
        local gh_version=$(gh --version | head -n1 | cut -d' ' -f3)
        print_success "GitHub CLI $gh_version"
        
        if gh auth status >/dev/null 2>&1; then
            print_success "已认证"
        else
            print_warning "未认证"
        fi
    else
        print_warning "GitHub CLI 未安装"
    fi
    
    print_subsection "网络连接"
    if ping -c 1 github.com >/dev/null 2>&1; then
        print_success "GitHub.com 连接正常"
    else
        print_error "无法连接到 GitHub.com"
    fi
    echo ""
}

# 分析环境变量
analyze_environment() {
    print_section "环境变量"
    
    local github_vars=("GITHUB_TOKEN" "GITHUB_USERNAME" "GITHUB_EMAIL")
    local found_vars=0
    
    for var in "${github_vars[@]}"; do
        if [ -n "${!var}" ]; then
            if [ "$found_vars" -eq 0 ]; then
                print_subsection "GitHub 相关"
                found_vars=1
            fi
            print_success "$var 已设置"
        fi
    done
    
    if [ "$found_vars" -eq 0 ]; then
        print_warning "未设置GitHub相关环境变量"
    fi
    echo ""
}

# 生成建议
generate_recommendations() {
    print_section "配置建议"
    
    local has_recommendations=false
    
    # 检查Git配置
    if ! git config user.name >/dev/null 2>&1; then
        print_warning "设置Git用户名: git config --global user.name '您的用户名'"
        has_recommendations=true
    fi
    
    if ! git config user.email >/dev/null 2>&1; then
        print_warning "设置Git邮箱: git config --global user.email '您的邮箱'"
        has_recommendations=true
    fi
    
    # 检查SSH密钥
    if [ ! -f ~/.ssh/id_rsa.pub ] && [ ! -f ~/.ssh/id_ed25519.pub ]; then
        print_warning "生成SSH密钥: ssh-keygen -t ed25519 -C '您的邮箱'"
        has_recommendations=true
    fi
    
    # 检查GitHub CLI
    if ! command_exists gh; then
        print_warning "安装GitHub CLI: 参考 https://cli.github.com/"
        has_recommendations=true
    fi
    
    # 检查未跟踪文件
    local untracked=$(git status --porcelain 2>/dev/null | grep "^??" | wc -l)
    if [ "$untracked" -gt 0 ]; then
        print_warning "提交未跟踪文件: git add . && git commit -m '提交信息'"
        has_recommendations=true
    fi
    
    if [ "$has_recommendations" = false ]; then
        print_success "配置看起来很好！"
    fi
    echo ""
}

# 生成简洁报告
generate_report() {
    local report_file="$PROJECT_ROOT/github-analysis-report.md"
    
    print_section "生成报告"
    
    cat > "$report_file" << EOF
# GitHub 设置分析报告

**生成时间:** $(date)  
**系统:** $(uname -s) $(uname -r)  
**用户:** $(whoami)

## 📊 概览

| 项目 | 状态 | 详情 |
|------|------|------|
| Git | $(command_exists git && echo "✅ 已安装" || echo "❌ 未安装") | $(git --version 2>/dev/null || echo "无") |
| 用户名 | $(git config user.name >/dev/null 2>&1 && echo "✅ 已设置" || echo "❌ 未设置") | $(git config user.name 2>/dev/null || echo "无") |
| 邮箱 | $(git config user.email >/dev/null 2>&1 && echo "✅ 已设置" || echo "❌ 未设置") | $(git config user.email 2>/dev/null || echo "无") |
| SSH密钥 | $([ -f ~/.ssh/id_ed25519.pub ] && echo "✅ 已配置" || echo "❌ 未配置") | $(find ~/.ssh -name "*.pub" 2>/dev/null | wc -l) 个 |
| GitHub CLI | $(command_exists gh && echo "✅ 已安装" || echo "❌ 未安装") | $(gh --version 2>/dev/null | head -n1 | cut -d' ' -f3 || echo "无") |
| 网络连接 | $(ping -c 1 github.com >/dev/null 2>&1 && echo "✅ 正常" || echo "❌ 失败") | GitHub.com |

## 🔧 详细配置

### Git 配置
\`\`\`bash
$(git config --global --list 2>/dev/null | head -10 || echo "未设置全局配置")
\`\`\`

### 仓库状态
\`\`\`bash
$(git status --porcelain 2>/dev/null | head -10 || echo "不是Git仓库")
\`\`\`

### 最近提交
\`\`\`bash
$(git log --oneline -5 2>/dev/null || echo "无法获取提交历史")
\`\`\`

## 📝 建议

$(generate_recommendations | sed 's/^/### /')

---

*此报告由 github-analyzer.sh 自动生成*
EOF
    
    print_success "分析报告已生成: $report_file"
}

# 显示总结
show_summary() {
    print_section "检查总结"
    
    local total_checks=0
    local passed_checks=0
    
    # Git配置检查
    total_checks=$((total_checks + 1))
    if command_exists git; then
        passed_checks=$((passed_checks + 1))
    fi
    
    total_checks=$((total_checks + 1))
    if git config user.name >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    total_checks=$((total_checks + 1))
    if git config user.email >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # SSH密钥检查
    total_checks=$((total_checks + 1))
    if [ -f ~/.ssh/id_ed25519.pub ] || [ -f ~/.ssh/id_rsa.pub ]; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # GitHub CLI检查
    total_checks=$((total_checks + 1))
    if command_exists gh; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # 网络连接检查
    total_checks=$((total_checks + 1))
    if ping -c 1 github.com >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    local percentage=$((passed_checks * 100 / total_checks))
    
    echo -e "${BOLD}检查项目: $total_checks${NC}"
    echo -e "${BOLD}通过项目: $passed_checks${NC}"
    echo -e "${BOLD}通过率: $percentage%${NC}"
    
    if [ "$percentage" -eq 100 ]; then
        print_success "🎉 所有检查都通过了！"
    elif [ "$percentage" -ge 80 ]; then
        print_warning "👍 大部分配置正确，还有改进空间"
    else
        print_error "⚠️ 需要完善配置"
    fi
    echo ""
}

# 主函数
main() {
    cd "$PROJECT_ROOT"
    
    print_header
    
    # 分析各个组件
    analyze_system
    analyze_git_config
    analyze_git_repo
    analyze_github_auth
    analyze_environment
    
    print_divider
    
    # 生成建议
    generate_recommendations
    
    # 显示总结
    show_summary
    
    # 生成报告
    generate_report
    
    print_divider
    echo -e "${BOLD}${GREEN}✅ 分析完成！详细报告已保存到 github-analysis-report.md${NC}"
    echo ""
}

# 显示帮助信息
show_help() {
    cat << EOF
${BOLD}GitHub 设置分析工具${NC}

${CYAN}用法:${NC} $0 [选项]

${CYAN}选项:${NC}
    -h, --help      显示帮助信息
    -r, --report    只生成报告文件
    -v, --verbose   详细输出

${CYAN}功能:${NC}
    1. 分析Git配置
    2. 检查仓库状态
    3. 验证GitHub认证
    4. 测试网络连接
    5. 检查环境变量
    6. 生成配置建议
    7. 输出分析报告

${CYAN}示例:${NC}
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
        print_error "未知选项: $1"
        show_help
        exit 1
        ;;
esac 