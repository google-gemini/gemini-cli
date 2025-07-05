#!/bin/bash

echo "🚀 快速创建doc分支并提交文档"
echo "=============================="
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

# 创建doc分支
echo "📋 创建doc分支..."
if git branch | grep -q "doc"; then
    echo "⚠️  doc分支已存在，切换到该分支"
    git checkout doc
else
    echo "✅ 创建新的doc分支"
    git checkout -b doc
fi

echo "✅ 当前分支: $(git branch --show-current)"
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
echo "📋 提交文档整理工作..."
git commit -m "feat(docs): 创建doc分支并提交完整的文档整理工作

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

echo "✅ 文档整理工作已提交"
echo ""

# 推送
echo "📋 推送doc分支到远程仓库..."
if git push -u origin doc; then
    echo ""
    echo "🎉 doc分支创建和提交成功！"
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
else
    echo ""
    echo "❌ 推送失败"
    echo "可能的原因:"
    echo "1. 需要认证 - 请配置SSH密钥或个人访问令牌"
    echo "2. 权限不足 - 请确认仓库权限"
    echo "3. 网络问题 - 请检查网络连接"
    echo ""
    echo "手动推送命令:"
    echo "git push -u origin doc"
fi 