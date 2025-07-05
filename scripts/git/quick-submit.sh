#!/bin/bash

echo "🚀 快速提交到 GitHub"
echo "目标: https://github.com/aidencck/gemini-cli.git"
echo ""

# 检查Git
if ! command -v git &> /dev/null; then
    echo "❌ Git未安装"
    exit 1
fi

# 检查用户配置
if ! git config --global user.name &> /dev/null; then
    echo "⚠️  请先配置Git用户信息:"
    echo "git config --global user.name 'Your Name'"
    echo "git config --global user.email 'your.email@example.com'"
    exit 1
fi

echo "✅ Git环境检查通过"
echo "用户: $(git config --global user.name)"
echo "邮箱: $(git config --global user.email)"
echo ""

# 设置远程仓库
if ! git remote get-url origin &> /dev/null; then
    echo "📋 添加远程仓库..."
    git remote add origin https://github.com/aidencck/gemini-cli.git
else
    echo "📋 更新远程仓库..."
    git remote set-url origin https://github.com/aidencck/gemini-cli.git
fi

echo "✅ 远程仓库配置完成"
echo ""

# 添加所有文件
echo "📋 添加文件到暂存区..."
git add .

# 检查是否有更改
if [[ -z $(git status --porcelain) ]]; then
    echo "⚠️  没有发现需要提交的更改"
    echo "当前状态:"
    git status
    exit 0
fi

echo "✅ 文件已添加到暂存区"
echo ""

# 提交
echo "📋 提交更改..."
git commit -m "feat: 添加项目文档整理和GitHub集成功能

- 项目文档索引和分类系统
- 文档质量标准和维护流程  
- GitHub仓库分析和提交工具
- 项目管理视角的文档组织分析
- 自动化文档管理脚本
- 项目架构和工程化分析报告"

echo "✅ 更改已提交"
echo ""

# 推送
echo "📋 推送到远程仓库..."
current_branch=$(git branch --show-current)
echo "当前分支: $current_branch"

if git push -u origin "$current_branch"; then
    echo ""
    echo "🎉 提交成功！"
    echo "仓库地址: https://github.com/aidencck/gemini-cli"
    echo "分支: $current_branch"
    echo "提交哈希: $(git rev-parse HEAD)"
else
    echo ""
    echo "❌ 推送失败"
    echo "可能的原因:"
    echo "1. 需要认证 - 请配置SSH密钥或个人访问令牌"
    echo "2. 权限不足 - 请确认仓库权限"
    echo "3. 网络问题 - 请检查网络连接"
    echo ""
    echo "手动推送命令:"
    echo "git push -u origin $current_branch"
fi 