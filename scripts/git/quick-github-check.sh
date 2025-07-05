#!/bin/bash

# 快速GitHub设置检查脚本 - 美化版本
# 简化版本，用于快速诊断GitHub配置

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 美化输出函数
print_header() {
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║                GitHub 设置快速检查工具                      ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo -e "${BOLD}${PURPLE}▸ $1${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

print_summary() {
    echo -e "${BOLD}${GREEN}📊 检查总结${NC}"
    echo -e "${BOLD}检查项目: $1${NC}"
    echo -e "${BOLD}通过项目: $2${NC}"
    echo -e "${BOLD}通过率: $3%${NC}"
}

# 检查Git配置
check_git() {
    print_section "Git 配置检查"
    
    if command -v git >/dev/null 2>&1; then
        local git_version=$(git --version | cut -d' ' -f3)
        print_success "Git 已安装: $git_version"
        
        # 检查用户配置
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
        
        echo ""
        return 0
    else
        print_error "Git 未安装"
        echo ""
        return 1
    fi
}

# 检查仓库状态
check_repository() {
    print_section "仓库状态检查"
    
    if git status >/dev/null 2>&1; then
        print_success "当前目录是Git仓库"
        
        # 检查远程仓库
        local remote_url=$(git remote get-url origin 2>/dev/null || echo "未设置")
        if [ "$remote_url" != "未设置" ]; then
            print_success "远程仓库: $remote_url"
        else
            print_warning "远程仓库: $remote_url"
        fi
        
        # 检查当前分支
        local current_branch=$(git branch --show-current 2>/dev/null || echo "未知")
        print_info "当前分支: $current_branch"
        
        # 检查文件状态
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
        
        echo ""
        return 0
    else
        print_error "当前目录不是Git仓库"
        echo ""
        return 1
    fi
}

# 检查SSH密钥
check_ssh() {
    print_section "SSH 密钥检查"
    
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
    
    echo ""
    return $ssh_keys
}

# 检查GitHub CLI
check_github_cli() {
    print_section "GitHub CLI 检查"
    
    if command -v gh >/dev/null 2>&1; then
        local gh_version=$(gh --version | head -n1 | cut -d' ' -f3)
        print_success "GitHub CLI 已安装: $gh_version"
        
        # 检查认证状态
        if gh auth status >/dev/null 2>&1; then
            print_success "GitHub CLI 已认证"
        else
            print_warning "GitHub CLI 未认证"
        fi
    else
        print_warning "GitHub CLI 未安装"
    fi
    
    echo ""
    return $(command -v gh >/dev/null 2>&1 && echo 0 || echo 1)
}

# 检查网络连接
check_network() {
    print_section "网络连接检查"
    
    if ping -c 1 github.com >/dev/null 2>&1; then
        print_success "GitHub.com 连接正常"
    else
        print_error "无法连接到 GitHub.com"
    fi
    
    echo ""
    return $(ping -c 1 github.com >/dev/null 2>&1 && echo 0 || echo 1)
}

# 检查环境变量
check_environment() {
    print_section "环境变量检查"
    
    local github_vars=("GITHUB_TOKEN" "GITHUB_USERNAME" "GITHUB_EMAIL")
    local found_vars=0
    
    for var in "${github_vars[@]}"; do
        if [ -n "${!var}" ]; then
            if [ "$found_vars" -eq 0 ]; then
                found_vars=1
            fi
            print_success "$var 已设置"
        fi
    done
    
    if [ "$found_vars" -eq 0 ]; then
        print_warning "未设置GitHub相关环境变量"
    fi
    
    echo ""
    return $found_vars
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
    if ! command -v gh >/dev/null 2>&1; then
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

# 计算检查结果
calculate_summary() {
    local total_checks=0
    local passed_checks=0
    
    # Git检查
    total_checks=$((total_checks + 1))
    if command -v git >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # 用户名检查
    total_checks=$((total_checks + 1))
    if git config user.name >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # 邮箱检查
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
    if command -v gh >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    # 网络连接检查
    total_checks=$((total_checks + 1))
    if ping -c 1 github.com >/dev/null 2>&1; then
        passed_checks=$((passed_checks + 1))
    fi
    
    local percentage=$((passed_checks * 100 / total_checks))
    
    print_summary $total_checks $passed_checks $percentage
    
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
    print_header
    
    # 执行各项检查
    check_git
    check_repository
    check_ssh
    check_github_cli
    check_network
    check_environment
    
    print_divider
    
    # 生成建议
    generate_recommendations
    
    # 显示总结
    calculate_summary
    
    print_divider
    echo -e "${BOLD}${GREEN}✅ 检查完成！${NC}"
    echo ""
    echo -e "${BOLD}📖 详细报告请查看:${NC} GitHub设置分析报告.md"
    echo -e "${BOLD}🚀 快速开始请查看:${NC} GitHub提交快速开始指南.md"
    echo ""
}

# 执行主函数
main 