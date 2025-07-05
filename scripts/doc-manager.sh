#!/bin/bash

# Gemini CLI 项目文档管理脚本
# 提供常用的文档操作功能

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
Gemini CLI 项目文档管理脚本

用法: $0 [命令] [选项]

命令:
    list                   列出所有文档文件
    search <关键词>        搜索文档内容
    stats                  显示文档统计信息
    backup                 创建文档备份
    organize               整理文档结构
    clean                  清理临时文件
    index                  生成文档索引
    find-duplicates        查找重复文件
    validate-links         验证文档链接
    help                   显示此帮助信息

选项:
    -v, --verbose          详细输出
    -d, --dry-run          试运行模式
    -f, --force            强制操作

示例:
    $0 list                 # 列出所有文档
    $0 search "架构"        # 搜索包含"架构"的文档
    $0 stats                # 显示文档统计
    $0 backup               # 创建备份
    $0 organize             # 整理文档结构
EOF
}

# 列出所有文档文件
list_docs() {
    log_info "列出项目中的所有文档文件:"
    echo
    
    # 根目录文档
    echo "📄 根目录文档:"
    find "$PROJECT_ROOT" -maxdepth 1 -name "*.md" | sort | while read file; do
        filename=$(basename "$file")
        size=$(du -h "$file" | cut -f1)
        lines=$(wc -l < "$file")
        echo "  - $filename ($size, $lines 行)"
    done
    echo
    
    # docs目录文档
    echo "📁 docs/ 目录文档:"
    find "$PROJECT_ROOT/docs" -name "*.md" | sort | while read file; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$file")
        size=$(du -h "$file" | cut -f1)
        lines=$(wc -l < "$file")
        echo "  - $relpath ($size, $lines 行)"
    done
}

# 搜索文档内容
search_docs() {
    local keyword="$1"
    if [[ -z "$keyword" ]]; then
        log_error "请提供搜索关键词"
        exit 1
    fi
    
    log_info "搜索包含 '$keyword' 的文档:"
    echo
    
    find "$PROJECT_ROOT" -name "*.md" -exec grep -l "$keyword" {} \; | while read file; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$file")
        echo "📄 $relpath"
        
        # 显示匹配的行
        grep -n "$keyword" "$file" | while read line; do
            echo "    $line"
        done
        echo
    done
}

# 显示文档统计信息
show_stats() {
    log_info "文档统计信息:"
    echo
    
    # 总文件数
    total_files=$(find "$PROJECT_ROOT" -name "*.md" | wc -l)
    echo "📊 总文档数量: $total_files"
    
    # 按目录统计
    echo "📁 按目录分布:"
    find "$PROJECT_ROOT" -name "*.md" | sed 's|/[^/]*$||' | sort | uniq -c | sort -nr | while read count dir; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$dir" 2>/dev/null || echo "$dir")
        echo "  $count 个文件 - $relpath"
    done
    echo
    
    # 总大小
    total_size=$(find "$PROJECT_ROOT" -name "*.md" -exec du -ch {} + | tail -1 | cut -f1)
    echo "📏 总大小: $total_size"
    
    # 总行数
    total_lines=$(find "$PROJECT_ROOT" -name "*.md" -exec wc -l {} + | tail -1 | awk '{print $1}')
    echo "📝 总行数: $total_lines"
    echo
    
    # 最大文件
    echo "📄 最大的5个文件:"
    find "$PROJECT_ROOT" -name "*.md" -exec du -h {} \; | sort -hr | head -5 | while read size file; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$file")
        lines=$(wc -l < "$file")
        echo "  $size ($lines 行) - $relpath"
    done
}

# 创建文档备份
create_backup() {
    local backup_dir="$PROJECT_ROOT/backup_$(date +%Y%m%d_%H%M%S)"
    local backup_archive="${backup_dir}.tar.gz"
    
    log_info "创建文档备份..."
    
    # 创建备份目录
    mkdir -p "$backup_dir"
    
    # 复制所有.md文件
    find "$PROJECT_ROOT" -name "*.md" -exec cp --parents {} "$backup_dir" \;
    
    # 创建压缩包
    tar -czf "$backup_archive" -C "$PROJECT_ROOT" "$(basename "$backup_dir")"
    
    # 删除临时目录
    rm -rf "$backup_dir"
    
    log_info "备份完成: $backup_archive"
}

# 整理文档结构
organize_docs() {
    log_info "整理文档结构..."
    
    # 创建分类目录
    local categories=("架构设计" "工程化" "业务分析" "用户指南" "集成扩展" "分析框架")
    
    for category in "${categories[@]}"; do
        mkdir -p "$PROJECT_ROOT/docs/$category"
    done
    
    # 移动相关文档（示例）
    log_info "移动文档到对应分类..."
    
    # 这里可以根据实际需要添加移动规则
    # 例如：
    # mv "$PROJECT_ROOT"/*架构*.md "$PROJECT_ROOT/docs/架构设计/" 2>/dev/null || true
    # mv "$PROJECT_ROOT"/*工程化*.md "$PROJECT_ROOT/docs/工程化/" 2>/dev/null || true
    
    log_info "文档整理完成"
}

# 清理临时文件
clean_temp_files() {
    log_info "清理临时文件..."
    
    # 删除备份文件
    find "$PROJECT_ROOT" -name "*.backup" -delete
    find "$PROJECT_ROOT" -name "*.tmp" -delete
    find "$PROJECT_ROOT" -name "*~" -delete
    
    # 删除空文件
    find "$PROJECT_ROOT" -name "*.md" -size 0 -delete
    
    log_info "清理完成"
}

# 生成文档索引
generate_index() {
    local index_file="$PROJECT_ROOT/文档索引_$(date +%Y%m%d).md"
    
    log_info "生成文档索引: $index_file"
    
    cat > "$index_file" << EOF
# 项目文档索引

生成时间: $(date)

## 文档列表

EOF
    
    find "$PROJECT_ROOT" -name "*.md" | sort | while read file; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$file")
        title=$(head -1 "$file" | sed 's/^# //')
        size=$(du -h "$file" | cut -f1)
        lines=$(wc -l < "$file")
        
        echo "- [$title]($relpath) ($size, $lines 行)" >> "$index_file"
    done
    
    log_info "索引生成完成: $index_file"
}

# 查找重复文件
find_duplicates() {
    log_info "查找重复文件..."
    
    # 使用fdupes查找重复文件（如果可用）
    if command -v fdupes >/dev/null 2>&1; then
        fdupes -r "$PROJECT_ROOT" | grep "\.md$" || log_info "未发现重复文件"
    else
        log_warn "fdupes 未安装，无法查找重复文件"
        log_info "请安装 fdupes: sudo apt-get install fdupes"
    fi
}

# 验证文档链接
validate_links() {
    log_info "验证文档链接..."
    
    find "$PROJECT_ROOT" -name "*.md" | while read file; do
        relpath=$(realpath --relative-to="$PROJECT_ROOT" "$file")
        
        # 提取链接
        grep -o '\[.*\]([^)]*)' "$file" | sed 's/.*](\([^)]*\))/\1/' | while read link; do
            # 跳过外部链接
            if [[ "$link" =~ ^https?:// ]]; then
                continue
            fi
            
            # 检查内部链接
            local target_file="$PROJECT_ROOT/$(dirname "$file")/$link"
            if [[ ! -f "$target_file" ]]; then
                log_warn "无效链接: $relpath -> $link"
            fi
        done
    done
    
    log_info "链接验证完成"
}

# 主函数
main() {
    local command="$1"
    shift
    
    case "$command" in
        list)
            list_docs
            ;;
        search)
            search_docs "$1"
            ;;
        stats)
            show_stats
            ;;
        backup)
            create_backup
            ;;
        organize)
            organize_docs
            ;;
        clean)
            clean_temp_files
            ;;
        index)
            generate_index
            ;;
        find-duplicates)
            find_duplicates
            ;;
        validate-links)
            validate_links
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            show_help
            exit 1
            ;;
        *)
            log_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 脚本入口
main "$@" 