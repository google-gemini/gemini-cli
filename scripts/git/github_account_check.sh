#!/bin/bash

# GitHub Account Comprehensive Analysis Script
# 作者: GitHub专家
# 功能: 对GitHub账户进行全面检查、分析和结构化整理

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 进度条函数
show_progress() {
    local current=$1
    local total=$2
    local task_name="$3"
    local width=15  # 减小进度条高度一半
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

# 任务进度跟踪
TASK_COUNT=10  # 实际任务数量：检查依赖、创建目录、用户信息、仓库列表、社交连接、活动信息、组织信息、生成报告、JSON汇总、汇总文件
CURRENT_TASK=0

# 开始任务
start_task() {
    local task_name="$1"
    CURRENT_TASK=$((CURRENT_TASK + 1))
    echo -e "\n${CYAN}[TASK $CURRENT_TASK/$TASK_COUNT]${NC} 开始执行: $task_name"
}

# 完成任务
complete_task() {
    local task_name="$1"
    # 任务完成时显示100%
    show_progress "$CURRENT_TASK" "$CURRENT_TASK" "$task_name"
    echo -e "${GREEN}[SUCCESS]${NC} $task_name 完成"
}

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/github_analysis_$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${OUTPUT_DIR}/analysis.log"
JSON_FILE="${OUTPUT_DIR}/github_data.json"
REPORT_FILE="${OUTPUT_DIR}/analysis_report.md"
SUMMARY_FILE="${SCRIPT_DIR}/github_analysis_summary.txt"

# 检查依赖
check_dependencies() {
    start_task "检查系统依赖"
    
    local deps=("curl" "jq" "git")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} 缺少以下依赖: ${missing_deps[*]}"
        echo "请安装缺少的依赖后重试"
        exit 1
    fi
    
    complete_task "检查系统依赖"
}

# 创建输出目录
create_output_dir() {
    start_task "创建输出目录"
    
    mkdir -p "$OUTPUT_DIR"
    mkdir -p "${OUTPUT_DIR}/repos"
    mkdir -p "${OUTPUT_DIR}/profiles"
    mkdir -p "${OUTPUT_DIR}/stats"
    
    complete_task "创建输出目录"
}

# 获取GitHub用户名
get_github_username() {
    if [ -z "$GITHUB_USERNAME" ]; then
        echo -e "${YELLOW}[INPUT]${NC} 请输入GitHub用户名: "
        read -r GITHUB_USERNAME
    fi
    
    if [ -z "$GITHUB_USERNAME" ]; then
        echo -e "${RED}[ERROR]${NC} 用户名不能为空"
        exit 1
    fi
    
    echo -e "${GREEN}[SUCCESS]${NC} 使用GitHub用户名: $GITHUB_USERNAME"
}

# 检查GitHub Token
check_github_token() {
    if [ -z "$GITHUB_TOKEN" ]; then
        echo -e "${YELLOW}[WARNING]${NC} 未设置GITHUB_TOKEN，将使用公开API（限制较多）"
        echo -e "${YELLOW}[TIP]${NC} 建议设置GITHUB_TOKEN以获得更好的访问权限"
        echo "export GITHUB_TOKEN='your_github_token'"
        GITHUB_API_BASE="https://api.github.com"
    else
        echo -e "${GREEN}[SUCCESS]${NC} 使用GitHub Token进行认证"
        GITHUB_API_BASE="https://api.github.com"
    fi
}

# GitHub API请求函数
github_api_request() {
    local endpoint="$1"
    local url="${GITHUB_API_BASE}${endpoint}"
    
    if [ -n "$GITHUB_TOKEN" ]; then
        curl -s -H "Authorization: token $GITHUB_TOKEN" \
             -H "Accept: application/vnd.github.v3+json" \
             "$url"
    else
        curl -s -H "Accept: application/vnd.github.v3+json" \
             "$url"
    fi
}

# 获取用户基本信息
get_user_info() {
    start_task "获取用户基本信息"
    
    local user_data
    user_data=$(github_api_request "/users/$GITHUB_USERNAME")
    
    if echo "$user_data" | jq -e '.message' | grep -q "Not Found"; then
        echo -e "${RED}[ERROR]${NC} 用户 $GITHUB_USERNAME 不存在"
        exit 1
    fi
    
    echo "$user_data" > "${OUTPUT_DIR}/user_info.json"
    
    # 提取关键信息
    local login=$(echo "$user_data" | jq -r '.login')
    local name=$(echo "$user_data" | jq -r '.name // "N/A"')
    local email=$(echo "$user_data" | jq -r '.email // "N/A"')
    local bio=$(echo "$user_data" | jq -r '.bio // "N/A"')
    local location=$(echo "$user_data" | jq -r '.location // "N/A"')
    local company=$(echo "$user_data" | jq -r '.company // "N/A"')
    local blog=$(echo "$user_data" | jq -r '.blog // "N/A"')
    local twitter=$(echo "$user_data" | jq -r '.twitter_username // "N/A"')
    local public_repos=$(echo "$user_data" | jq -r '.public_repos')
    local public_gists=$(echo "$user_data" | jq -r '.public_gists')
    local followers=$(echo "$user_data" | jq -r '.followers')
    local following=$(echo "$user_data" | jq -r '.following')
    local created_at=$(echo "$user_data" | jq -r '.created_at')
    local updated_at=$(echo "$user_data" | jq -r '.updated_at')
    
    # 保存到JSON文件
    cat > "${OUTPUT_DIR}/user_summary.json" << EOF
{
  "username": "$login",
  "name": "$name",
  "email": "$email",
  "bio": "$bio",
  "location": "$location",
  "company": "$company",
  "blog": "$blog",
  "twitter": "$twitter",
  "stats": {
    "public_repos": $public_repos,
    "public_gists": $public_gists,
    "followers": $followers,
    "following": $following
  },
  "dates": {
    "created_at": "$created_at",
    "updated_at": "$updated_at"
  }
}
EOF
    
    complete_task "获取用户基本信息"
}

# 获取仓库列表
get_repositories() {
    start_task "获取仓库列表"
    
    local repos_data
    repos_data=$(github_api_request "/users/$GITHUB_USERNAME/repos?per_page=100&sort=updated")
    
    echo "$repos_data" > "${OUTPUT_DIR}/repositories.json"
    
    local repo_count=$(echo "$repos_data" | jq length)
    
    # 分析仓库信息
    local total_stars=0
    local total_forks=0
    local total_watchers=0
    local languages=()
    local topics=()
    
    # 显示仓库处理进度
    echo -e "${BLUE}[INFO]${NC} 正在处理 $repo_count 个仓库..."
    
    for i in $(seq 0 $((repo_count - 1))); do
        # 显示当前仓库处理进度
        local progress=$((i + 1))
        local percentage=$((progress * 100 / repo_count))
        local width=15
        local completed=$((width * progress / repo_count))
        local remaining=$((width - completed))
        
        # 构建仓库处理进度条
        local repo_progress_bar=""
        for ((j=0; j<completed; j++)); do
            repo_progress_bar+="="
        done
        for ((j=0; j<remaining; j++)); do
            repo_progress_bar+="-"
        done
        
        printf "\r${YELLOW}[仓库处理]${NC} ${GREEN}%s${NC} ${YELLOW}%d%%${NC} ${PURPLE}(%d/%d)${NC}" \
               "$repo_progress_bar" "$percentage" "$progress" "$repo_count"
        
        local repo_name=$(echo "$repos_data" | jq -r ".[$i].name")
        local repo_full_name=$(echo "$repos_data" | jq -r ".[$i].full_name")
        local repo_description=$(echo "$repos_data" | jq -r ".[$i].description // \"\"")
        local repo_language=$(echo "$repos_data" | jq -r ".[$i].language // \"Unknown\"")
        local repo_stars=$(echo "$repos_data" | jq -r ".[$i].stargazers_count")
        local repo_forks=$(echo "$repos_data" | jq -r ".[$i].forks_count")
        local repo_watchers=$(echo "$repos_data" | jq -r ".[$i].watchers_count")
        local repo_size=$(echo "$repos_data" | jq -r ".[$i].size")
        local repo_created=$(echo "$repos_data" | jq -r ".[$i].created_at")
        local repo_updated=$(echo "$repos_data" | jq -r ".[$i].updated_at")
        local repo_pushed=$(echo "$repos_data" | jq -r ".[$i].pushed_at")
        local repo_private=$(echo "$repos_data" | jq -r ".[$i].private")
        local repo_fork=$(echo "$repos_data" | jq -r ".[$i].fork")
        local repo_archived=$(echo "$repos_data" | jq -r ".[$i].archived")
        local repo_disabled=$(echo "$repos_data" | jq -r ".[$i].disabled")
        local repo_license=$(echo "$repos_data" | jq -r ".[$i].license.name // \"N/A\"")
        
        # 累计统计
        total_stars=$((total_stars + repo_stars))
        total_forks=$((total_forks + repo_forks))
        total_watchers=$((total_watchers + repo_watchers))
        
        # 收集语言
        if [ "$repo_language" != "Unknown" ]; then
            languages+=("$repo_language")
        fi
        
        # 保存单个仓库信息
        cat > "${OUTPUT_DIR}/repos/${repo_name}.json" << EOF
{
  "name": "$repo_name",
  "full_name": "$repo_full_name",
  "description": "$repo_description",
  "language": "$repo_language",
  "stats": {
    "stars": $repo_stars,
    "forks": $repo_forks,
    "watchers": $repo_watchers,
    "size": $repo_size
  },
  "dates": {
    "created": "$repo_created",
    "updated": "$repo_updated",
    "pushed": "$repo_pushed"
  },
  "properties": {
    "private": $repo_private,
    "fork": $repo_fork,
    "archived": $repo_archived,
    "disabled": $repo_disabled
  },
  "license": "$repo_license"
}
EOF
        
        # 获取仓库主题标签
        if [ -n "$GITHUB_TOKEN" ]; then
            local topics_data=$(github_api_request "/repos/$repo_full_name/topics")
            local repo_topics=$(echo "$topics_data" | jq -r '.names[]? // empty')
            if [ -n "$repo_topics" ]; then
                topics+=("$repo_topics")
            fi
        fi
    done
    
    # 确保显示100%完成
    local width=15
    local completed=$width
    local repo_progress_bar=""
    for ((j=0; j<completed; j++)); do
        repo_progress_bar+="="
    done
    
    printf "\r${YELLOW}[仓库处理]${NC} ${GREEN}%s${NC} ${YELLOW}100%%${NC} ${PURPLE}(%d/%d)${NC}\n" \
           "$repo_progress_bar" "$repo_count" "$repo_count"
    
    # 保存仓库统计信息
    cat > "${OUTPUT_DIR}/repo_stats.json" << EOF
{
  "total_repositories": $repo_count,
  "total_stars": $total_stars,
  "total_forks": $total_forks,
  "total_watchers": $total_watchers,
  "languages": $(printf '%s\n' "${languages[@]}" | sort | uniq -c | jq -R -s 'split("\n")[:-1] | map(split(" ") | {count: .[0], language: .[1]})'),
  "topics": $(printf '%s\n' "${topics[@]}" | sort | uniq -c | jq -R -s 'split("\n")[:-1] | map(split(" ") | {count: .[0], topic: .[1]})')
}
EOF
    
    complete_task "获取仓库列表"
}

# 获取关注者和关注的人
get_social_connections() {
    start_task "获取社交连接信息"
    
    # 获取关注者
    local followers_data
    followers_data=$(github_api_request "/users/$GITHUB_USERNAME/followers?per_page=100")
    echo "$followers_data" > "${OUTPUT_DIR}/followers.json"
    
    local followers_count=$(echo "$followers_data" | jq length)
    
    # 获取关注的人
    local following_data
    following_data=$(github_api_request "/users/$GITHUB_USERNAME/following?per_page=100")
    echo "$following_data" > "${OUTPUT_DIR}/following.json"
    
    local following_count=$(echo "$following_data" | jq length)
    
    # 保存社交统计
    cat > "${OUTPUT_DIR}/social_stats.json" << EOF
{
  "followers_count": $followers_count,
  "following_count": $following_count,
  "followers": $(echo "$followers_data" | jq 'map({login: .login, id: .id, avatar_url: .avatar_url, html_url: .html_url})'),
  "following": $(echo "$following_data" | jq 'map({login: .login, id: .id, avatar_url: .avatar_url, html_url: .html_url})')
}
EOF
    
    complete_task "获取社交连接信息"
}

# 获取活动信息
get_activity() {
    start_task "获取活动信息"
    
    # 获取公开活动
    local events_data
    events_data=$(github_api_request "/users/$GITHUB_USERNAME/events/public?per_page=100")
    echo "$events_data" > "${OUTPUT_DIR}/events.json"
    
    local events_count=$(echo "$events_data" | jq length)
    
    # 分析活动类型
    local activity_types=()
    for i in $(seq 0 $((events_count - 1))); do
        local event_type=$(echo "$events_data" | jq -r ".[$i].type")
        activity_types+=("$event_type")
    done
    
    # 统计活动类型
    local activity_stats=$(printf '%s\n' "${activity_types[@]}" | sort | uniq -c | jq -R -s 'split("\n")[:-1] | map(split(" ") | {count: .[0], type: .[1]})')
    
    cat > "${OUTPUT_DIR}/activity_stats.json" << EOF
{
  "total_events": $events_count,
  "activity_types": $activity_stats
}
EOF
    
    complete_task "获取活动信息"
}

# 获取组织信息
get_organizations() {
    start_task "获取组织信息"
    
    local orgs_data
    orgs_data=$(github_api_request "/users/$GITHUB_USERNAME/orgs")
    echo "$orgs_data" > "${OUTPUT_DIR}/organizations.json"
    
    local orgs_count=$(echo "$orgs_data" | jq length)
    
    cat > "${OUTPUT_DIR}/orgs_summary.json" << EOF
{
  "total_organizations": $orgs_count,
  "organizations": $(echo "$orgs_data" | jq 'map({login: .login, id: .id, avatar_url: .avatar_url, description: .description // "N/A"})')
}
EOF
    
    complete_task "获取组织信息"
}

# 生成分析报告
generate_report() {
    start_task "生成分析报告"
    
    local user_summary=$(cat "${OUTPUT_DIR}/user_summary.json")
    local repo_stats=$(cat "${OUTPUT_DIR}/repo_stats.json")
    local social_stats=$(cat "${OUTPUT_DIR}/social_stats.json")
    local activity_stats=$(cat "${OUTPUT_DIR}/activity_stats.json")
    local orgs_summary=$(cat "${OUTPUT_DIR}/orgs_summary.json")
    
    cat > "$REPORT_FILE" << EOF
# GitHub账户分析报告

## 基本信息

- **用户名**: $(echo "$user_summary" | jq -r '.username')
- **姓名**: $(echo "$user_summary" | jq -r '.name')
- **邮箱**: $(echo "$user_summary" | jq -r '.email')
- **个人简介**: $(echo "$user_summary" | jq -r '.bio')
- **位置**: $(echo "$user_summary" | jq -r '.location')
- **公司**: $(echo "$user_summary" | jq -r '.company')
- **博客**: $(echo "$user_summary" | jq -r '.blog')
- **Twitter**: $(echo "$user_summary" | jq -r '.twitter')
- **账户创建时间**: $(echo "$user_summary" | jq -r '.dates.created_at')
- **最后更新时间**: $(echo "$user_summary" | jq -r '.dates.updated_at')

## 统计概览

### 仓库统计
- **总仓库数**: $(echo "$repo_stats" | jq -r '.total_repositories')
- **总星标数**: $(echo "$repo_stats" | jq -r '.total_stars')
- **总分支数**: $(echo "$repo_stats" | jq -r '.total_forks')
- **总关注者数**: $(echo "$repo_stats" | jq -r '.total_watchers')

### 社交统计
- **关注者数**: $(echo "$social_stats" | jq -r '.followers_count')
- **关注人数**: $(echo "$social_stats" | jq -r '.following_count')

### 活动统计
- **总活动数**: $(echo "$activity_stats" | jq -r '.total_events')

### 组织统计
- **组织数量**: $(echo "$orgs_summary" | jq -r '.total_organizations')

## 编程语言分析

$(echo "$repo_stats" | jq -r '.languages[] | "- \(.language): \(.count) 个仓库"' 2>/dev/null || echo "暂无语言数据")

## 活动类型分析

$(echo "$activity_stats" | jq -r '.activity_types[] | "- \(.type): \(.count) 次"' 2>/dev/null || echo "暂无活动数据")

## 组织成员

$(echo "$orgs_summary" | jq -r '.organizations[] | "- \(.login): \(.description)"' 2>/dev/null || echo "暂无组织数据")

## 生成时间

报告生成时间: $(date '+%Y-%m-%d %H:%M:%S')

## 数据文件

所有原始数据已保存到以下文件:
- 用户信息: \`user_info.json\`
- 仓库列表: \`repositories.json\`
- 仓库统计: \`repo_stats.json\`
- 关注者: \`followers.json\`
- 关注的人: \`following.json\`
- 活动记录: \`events.json\`
- 组织信息: \`organizations.json\`
EOF
    
    complete_task "生成分析报告"
}

# 生成JSON汇总文件
generate_json_summary() {
    start_task "生成JSON汇总文件"
    
    local user_summary=$(cat "${OUTPUT_DIR}/user_summary.json")
    local repo_stats=$(cat "${OUTPUT_DIR}/repo_stats.json")
    local social_stats=$(cat "${OUTPUT_DIR}/social_stats.json")
    local activity_stats=$(cat "${OUTPUT_DIR}/activity_stats.json")
    local orgs_summary=$(cat "${OUTPUT_DIR}/orgs_summary.json")
    
    cat > "$JSON_FILE" << EOF
{
  "analysis_metadata": {
    "generated_at": "$(date -Iseconds)",
    "target_user": "$GITHUB_USERNAME",
    "script_version": "1.0.0"
  },
  "user_info": $user_summary,
  "repository_stats": $repo_stats,
  "social_stats": $social_stats,
  "activity_stats": $activity_stats,
  "organization_stats": $orgs_summary
}
EOF
    
    complete_task "生成JSON汇总文件"
}

# 生成分析结果汇总文件
generate_summary_file() {
    start_task "生成分析结果汇总文件"
    
    local user_summary=$(cat "${OUTPUT_DIR}/user_summary.json")
    local repo_stats=$(cat "${OUTPUT_DIR}/repo_stats.json")
    local social_stats=$(cat "${OUTPUT_DIR}/social_stats.json")
    local activity_stats=$(cat "${OUTPUT_DIR}/activity_stats.json")
    local orgs_summary=$(cat "${OUTPUT_DIR}/orgs_summary.json")
    
    # 获取编程语言统计
    local languages_info=""
    if [ -f "${OUTPUT_DIR}/repo_stats.json" ]; then
        languages_info=$(echo "$repo_stats" | jq -r '.languages[]? | "\(.language): \(.count) 个仓库"' 2>/dev/null || echo "暂无语言数据")
    fi
    
    # 获取活动类型统计
    local activity_info=""
    if [ -f "${OUTPUT_DIR}/activity_stats.json" ]; then
        activity_info=$(echo "$activity_stats" | jq -r '.activity_types[]? | "\(.type): \(.count) 次"' 2>/dev/null || echo "暂无活动数据")
    fi
    
    # 获取组织信息
    local orgs_info=""
    if [ -f "${OUTPUT_DIR}/orgs_summary.json" ]; then
        orgs_info=$(echo "$orgs_summary" | jq -r '.organizations[]? | "\(.login): \(.description)"' 2>/dev/null || echo "暂无组织数据")
    fi
    
    cat > "$SUMMARY_FILE" << EOF
========================================
        GitHub账户分析结果汇总
========================================

分析时间: $(date '+%Y-%m-%d %H:%M:%S')
目标用户: $(echo "$user_summary" | jq -r '.username')

基本信息:
- 用户名: $(echo "$user_summary" | jq -r '.username')
- 姓名: $(echo "$user_summary" | jq -r '.name')
- 邮箱: $(echo "$user_summary" | jq -r '.email')
- 个人简介: $(echo "$user_summary" | jq -r '.bio')
- 位置: $(echo "$user_summary" | jq -r '.location')
- 公司: $(echo "$user_summary" | jq -r '.company')
- 博客: $(echo "$user_summary" | jq -r '.blog')
- Twitter: $(echo "$user_summary" | jq -r '.twitter')
- 账户创建时间: $(echo "$user_summary" | jq -r '.dates.created_at')
- 最后更新时间: $(echo "$user_summary" | jq -r '.dates.updated_at')

统计概览:
- 总仓库数: $(echo "$repo_stats" | jq -r '.total_repositories')
- 总星标数: $(echo "$repo_stats" | jq -r '.total_stars')
- 总分支数: $(echo "$repo_stats" | jq -r '.total_forks')
- 总关注者数: $(echo "$repo_stats" | jq -r '.total_watchers')
- 关注者数: $(echo "$social_stats" | jq -r '.followers_count')
- 关注人数: $(echo "$social_stats" | jq -r '.following_count')
- 总活动数: $(echo "$activity_stats" | jq -r '.total_events')
- 组织数量: $(echo "$orgs_summary" | jq -r '.total_organizations')

编程语言分析:
$languages_info

活动类型分析:
$activity_info

组织成员:
$orgs_info

输出文件:
- 详细报告: ${REPORT_FILE}
- JSON数据: ${JSON_FILE}
- 日志文件: ${LOG_FILE}
- 输出目录: ${OUTPUT_DIR}

========================================
EOF
    
    complete_task "生成分析结果汇总文件"
}

# 显示分析结果摘要
show_summary() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}        GitHub账户分析完成        ${NC}"
    echo -e "${CYAN}========================================${NC}"
    
    local user_summary=$(cat "${OUTPUT_DIR}/user_summary.json")
    local repo_stats=$(cat "${OUTPUT_DIR}/repo_stats.json")
    local social_stats=$(cat "${OUTPUT_DIR}/social_stats.json")
    
    echo -e "${GREEN}用户名:${NC} $(echo "$user_summary" | jq -r '.username')"
    echo -e "${GREEN}姓名:${NC} $(echo "$user_summary" | jq -r '.name')"
    echo -e "${GREEN}仓库数:${NC} $(echo "$repo_stats" | jq -r '.total_repositories')"
    echo -e "${GREEN}总星标:${NC} $(echo "$repo_stats" | jq -r '.total_stars')"
    echo -e "${GREEN}关注者:${NC} $(echo "$social_stats" | jq -r '.followers_count')"
    echo -e "${GREEN}关注:${NC} $(echo "$social_stats" | jq -r '.following_count')"
    
    echo -e "\n${YELLOW}输出目录:${NC} $OUTPUT_DIR"
    echo -e "${YELLOW}报告文件:${NC} $REPORT_FILE"
    echo -e "${YELLOW}JSON数据:${NC} $JSON_FILE"
    echo -e "${YELLOW}日志文件:${NC} $LOG_FILE"
    echo -e "${YELLOW}汇总文件:${NC} $SUMMARY_FILE"
    
    echo -e "\n${BLUE}分析完成！所有数据已保存到指定目录。${NC}"
}

# 主函数
main() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}    GitHub账户全面分析工具    ${NC}"
    echo -e "${CYAN}========================================${NC}"
    
    # 记录开始时间
    local start_time=$(date +%s)
    
    # 执行分析步骤
    check_dependencies
    create_output_dir
    get_github_username
    check_github_token
    
    # 执行各个任务
    get_user_info
    get_repositories
    get_social_connections
    get_activity
    get_organizations
    generate_report
    generate_json_summary
    generate_summary_file
    
    # 记录结束时间
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo -e "\n${BLUE}[INFO]${NC} 分析耗时: ${duration} 秒"
    
    show_summary
}

# 错误处理
trap 'echo -e "\n${RED}[ERROR]${NC} 脚本执行出错，请检查日志文件: $LOG_FILE"; exit 1' ERR

# 执行主函数
main "$@"
