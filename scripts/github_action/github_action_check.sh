#!/bin/bash

# GitHub Actions 效率分析工具
# 基于最佳实践分析GitHub Actions配置并提供优化建议

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置文件路径
TEMP_DIR="/tmp/github-actions-analysis"

# 查找项目根目录
find_project_root() {
    local current_dir=$(pwd)
    local search_dir="$current_dir"
    
    # 向上查找直到找到包含.git目录的目录
    while [ "$search_dir" != "/" ]; do
        if [ -d "$search_dir/.git" ]; then
            echo "$search_dir"
            return 0
        fi
        search_dir=$(dirname "$search_dir")
    done
    
    # 如果没找到.git目录，使用当前目录
    echo "$current_dir"
}

# 初始化
init() {
    echo -e "${BLUE}🔍 GitHub Actions 效率分析工具${NC}"
    echo -e "${CYAN}开始分析您的GitHub Actions配置...${NC}"
    echo ""
    
    # 创建临时目录
    mkdir -p "$TEMP_DIR"
    
    # 查找项目根目录
    PROJECT_ROOT=$(find_project_root)
    CONFIG_FILE="$PROJECT_ROOT/.github/workflows"
    
    # 创建报告输出目录（在执行脚本的目录下）
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    REPORTS_DIR="$SCRIPT_DIR/reports"
    mkdir -p "$REPORTS_DIR"
    OUTPUT_FILE="$REPORTS_DIR/github-actions-analysis-$(date +%Y%m%d-%H%M%S).md"
    
    echo -e "${CYAN}项目根目录: $PROJECT_ROOT${NC}"
    echo -e "${CYAN}配置文件路径: $CONFIG_FILE${NC}"
    echo -e "${CYAN}报告输出目录: $REPORTS_DIR${NC}"
    echo ""
    
    # 检查是否存在GitHub Actions配置
    if [ ! -d "$CONFIG_FILE" ]; then
        echo -e "${RED}❌ 未找到GitHub Actions配置文件 (.github/workflows)${NC}"
        echo -e "${YELLOW}请确保项目根目录下存在 .github/workflows 目录${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ 找到GitHub Actions配置文件${NC}"
}

# 分析工作流文件
analyze_workflows() {
    echo -e "${BLUE}📋 分析工作流文件...${NC}"
    
    local workflow_files=$(find "$CONFIG_FILE" -name "*.yml" -o -name "*.yaml")
    local total_workflows=0
    local issues_found=0
    
    for workflow in $workflow_files; do
        total_workflows=$((total_workflows + 1))
        echo -e "${CYAN}分析: $(basename "$workflow")${NC}"
        
        # 检查基本语法
        check_yaml_syntax "$workflow"
        
        # 检查性能相关配置
        check_performance_configs "$workflow"
        
        # 检查缓存配置
        check_cache_configs "$workflow"
        
        # 检查并行化配置
        check_parallelization "$workflow"
        
        # 检查触发器配置
        check_triggers "$workflow"
        
        echo ""
    done
    
    echo -e "${GREEN}✅ 完成工作流分析 (共 $total_workflows 个文件)${NC}"
}

# 检查YAML语法
check_yaml_syntax() {
    local file="$1"
    
    if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
        echo -e "${RED}  ❌ YAML语法错误${NC}"
        add_issue "YAML语法错误" "修复 $file 中的YAML语法问题" "high"
    else
        echo -e "${GREEN}  ✅ YAML语法正确${NC}"
    fi
}

# 检查性能相关配置
check_performance_configs() {
    local file="$1"
    local content=$(cat "$file")
    
    # 检查是否使用了最新版本的actions
    if echo "$content" | grep -q "actions/checkout@v[1-3]"; then
        local version=$(echo "$content" | grep "actions/checkout@" | head -1 | sed 's/.*@v\([0-9]*\).*/\1/')
        if [ "$version" -lt 4 ]; then
            echo -e "${YELLOW}  ⚠️  建议升级 actions/checkout 到 v4${NC}"
            add_issue "使用旧版本actions" "将 actions/checkout 升级到 v4 以获得更好的性能" "medium"
        fi
    fi
    
    # 检查是否使用了缓存
    if ! echo "$content" | grep -q "actions/cache"; then
        echo -e "${YELLOW}  ⚠️  未配置依赖缓存${NC}"
        add_issue "缺少缓存配置" "添加 actions/cache 来缓存依赖项" "high"
    fi
    
    # 检查是否使用了矩阵策略
    if echo "$content" | grep -q "matrix:"; then
        echo -e "${GREEN}  ✅ 使用了矩阵策略进行并行化${NC}"
    fi
    
    # 检查是否使用了自托管runner
    if echo "$content" | grep -q "runs-on: self-hosted"; then
        echo -e "${GREEN}  ✅ 使用了自托管runner${NC}"
    fi
}

# 检查缓存配置
check_cache_configs() {
    local file="$1"
    local content=$(cat "$file")
    
    # 检查Node.js缓存
    if echo "$content" | grep -q "node_modules" && ! echo "$content" | grep -q "actions/cache"; then
        echo -e "${YELLOW}  ⚠️  Node.js项目建议配置缓存${NC}"
        add_issue "缺少Node.js缓存" "为node_modules配置actions/cache" "high"
    fi
    
    # 检查Docker缓存
    if echo "$content" | grep -q "docker" && ! echo "$content" | grep -q "cache:"; then
        echo -e "${YELLOW}  ⚠️  Docker构建建议配置缓存${NC}"
        add_issue "缺少Docker缓存" "为Docker构建配置缓存" "medium"
    fi
    
    # 检查缓存键配置
    if echo "$content" | grep -q "actions/cache"; then
        if ! echo "$content" | grep -A5 "actions/cache" | grep -q "key:"; then
            echo -e "${YELLOW}  ⚠️  缓存配置缺少key${NC}"
            add_issue "缓存配置不完整" "为缓存配置添加合适的key" "medium"
        fi
    fi
}

# 检查并行化配置
check_parallelization() {
    local file="$1"
    local content=$(cat "$file")
    
    # 检查是否有串行执行的job
    local jobs=$(echo "$content" | grep -A1 "jobs:" | grep "^\s*[a-zA-Z]" | wc -l)
    if [ "$jobs" -gt 1 ]; then
        if ! echo "$content" | grep -q "needs:"; then
            echo -e "${GREEN}  ✅ 多个job可以并行执行${NC}"
        else
            echo -e "${YELLOW}  ⚠️  检查job依赖关系，确保最大化并行化${NC}"
            add_issue "并行化优化" "检查job依赖关系，减少不必要的串行执行" "medium"
        fi
    fi
}

# 检查触发器配置
check_triggers() {
    local file="$1"
    local content=$(cat "$file")
    
    # 检查是否在文档更新时触发
    if echo "$content" | grep -q "paths:" && echo "$content" | grep -q "docs/"; then
        echo -e "${GREEN}  ✅ 文档更新有路径过滤${NC}"
    fi
    
    # 检查是否使用了push触发器但没有路径过滤
    if echo "$content" | grep -q "on:" && echo "$content" | grep -q "push" && ! echo "$content" | grep -q "paths:"; then
        echo -e "${YELLOW}  ⚠️  push触发器建议添加路径过滤${NC}"
        add_issue "触发器优化" "为push触发器添加路径过滤，避免不必要的构建" "medium"
    fi
}

# 添加问题到列表
add_issue() {
    local title="$1"
    local description="$2"
    local priority="$3"
    
    echo "$priority|$title|$description" >> "$TEMP_DIR/issues.txt"
}

# 生成优化建议
generate_recommendations() {
    echo -e "${BLUE}📊 生成优化建议...${NC}"
    
    if [ ! -f "$TEMP_DIR/issues.txt" ]; then
        echo -e "${GREEN}✅ 未发现需要优化的问题${NC}"
        return
    fi
    
    local high_priority=$(grep "^high|" "$TEMP_DIR/issues.txt" | wc -l)
    local medium_priority=$(grep "^medium|" "$TEMP_DIR/issues.txt" | wc -l)
    local low_priority=$(grep "^low|" "$TEMP_DIR/issues.txt" | wc -l)
    
    echo -e "${YELLOW}发现 $high_priority 个高优先级问题${NC}"
    echo -e "${YELLOW}发现 $medium_priority 个中优先级问题${NC}"
    echo -e "${YELLOW}发现 $low_priority 个低优先级问题${NC}"
}

# 生成报告
generate_report() {
    echo -e "${BLUE}📝 生成分析报告...${NC}"
    
    cat > "$OUTPUT_FILE" << EOF
# GitHub Actions 效率分析报告

**生成时间:** $(date)
**项目路径:** $(pwd)

## 📋 执行摘要

本报告分析了您的GitHub Actions配置，识别了潜在的优化机会。

## 🔍 分析结果

### 工作流文件
$(find "$CONFIG_FILE" -name "*.yml" -o -name "*.yaml" | while read file; do
    echo "- $(basename "$file")"
done)

## ⚠️ 发现的问题

EOF

    if [ -f "$TEMP_DIR/issues.txt" ]; then
        echo "### 高优先级问题" >> "$OUTPUT_FILE"
        grep "^high|" "$TEMP_DIR/issues.txt" | while IFS='|' read -r priority title description; do
            echo "- **$title**: $description" >> "$OUTPUT_FILE"
        done
        
        echo "" >> "$OUTPUT_FILE"
        echo "### 中优先级问题" >> "$OUTPUT_FILE"
        grep "^medium|" "$TEMP_DIR/issues.txt" | while IFS='|' read -r priority title description; do
            echo "- **$title**: $description" >> "$OUTPUT_FILE"
        done
        
        echo "" >> "$OUTPUT_FILE"
        echo "### 低优先级问题" >> "$OUTPUT_FILE"
        grep "^low|" "$TEMP_DIR/issues.txt" | while IFS='|' read -r priority title description; do
            echo "- **$title**: $description" >> "$OUTPUT_FILE"
        done
    else
        echo "✅ 未发现需要优化的问题" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << EOF

## 🚀 优化建议

### 1. 缓存策略优化
- 为依赖项配置缓存（如node_modules、pip缓存等）
- 使用合适的缓存键和恢复键
- 定期清理过期缓存

### 2. 并行化优化
- 使用矩阵策略进行并行测试
- 减少job之间的依赖关系
- 利用GitHub Actions的并发限制

### 3. 触发器优化
- 为push事件添加路径过滤
- 使用workflow_dispatch进行手动触发
- 避免在文档更新时触发完整构建

### 4. 资源优化
- 使用最新版本的actions
- 考虑使用自托管runner进行资源密集型任务
- 优化Docker镜像大小

### 5. 监控和分析
- 使用GitHub Actions的运行时分析
- 监控构建时间和资源使用情况
- 定期审查和优化工作流

## 📈 性能基准

根据[GitHub Actions性能指南](https://www.warpbuild.com/blog/github-actions-speeding-up)，以下是一些性能基准：

- **缓存命中率**: 目标 > 80%
- **构建时间**: 目标 < 10分钟
- **并行化率**: 目标 > 70%
- **资源利用率**: 目标 > 60%

## 🔧 推荐工具

- [GitHub Actions Profiler](https://github.com/utgwkk/github-actions-profiler) - 分析工作流性能
- [WarpBuild](https://www.warpbuild.com) - 高性能CI/CD runners
- GitHub Actions内置的性能分析功能

## 📞 下一步行动

1. 优先处理高优先级问题
2. 实施缓存策略
3. 优化并行化配置
4. 监控性能改进
5. 定期审查和更新

---
*报告由GitHub Actions效率分析工具生成*
EOF

    echo -e "${GREEN}✅ 报告已生成: $OUTPUT_FILE${NC}"
}

# 显示确认信息
show_confirmation() {
    echo ""
    echo -e "${PURPLE}🎯 分析完成！${NC}"
    echo -e "${CYAN}报告文件: $OUTPUT_FILE${NC}"
    echo ""
    echo -e "${BLUE}📋 下一步操作建议:${NC}"
    echo "1. 查看生成的报告文件"
    echo "2. 优先处理高优先级问题"
    echo "3. 实施推荐的优化措施"
    echo "4. 定期运行此工具进行监控"
    echo ""
    echo -e "${GREEN}💡 提示: 使用 'cat $OUTPUT_FILE' 查看完整报告${NC}"
}

# 清理临时文件
cleanup() {
    rm -rf "$TEMP_DIR"
}

# 主函数
main() {
    init
    analyze_workflows
    generate_recommendations
    generate_report
    show_confirmation
    cleanup
}

# 错误处理
trap 'echo -e "${RED}❌ 脚本执行出错${NC}"; cleanup; exit 1' ERR

# 执行主函数
main "$@" 