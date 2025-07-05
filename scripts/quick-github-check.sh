#!/bin/bash

# 快速GitHub设置检查脚本
# 简化版本，用于快速诊断GitHub配置

echo "🔍 GitHub 设置快速检查"
echo "======================"
echo ""

# 检查Git
echo "📋 Git 配置检查:"
if command -v git >/dev/null 2>&1; then
    echo "✅ Git 已安装: $(git --version)"
    
    # 检查用户配置
    USER_NAME=$(git config user.name 2>/dev/null || echo "未设置")
    USER_EMAIL=$(git config user.email 2>/dev/null || echo "未设置")
    echo "   用户名: $USER_NAME"
    echo "   邮箱: $USER_EMAIL"
else
    echo "❌ Git 未安装"
fi

echo ""

# 检查当前仓库
echo "📁 仓库状态检查:"
if git status >/dev/null 2>&1; then
    echo "✅ 当前目录是Git仓库"
    
    # 检查远程仓库
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "未设置")
    echo "   远程仓库: $REMOTE_URL"
    
    # 检查当前分支
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "未知")
    echo "   当前分支: $CURRENT_BRANCH"
    
    # 检查未跟踪文件
    UNTRACKED=$(git status --porcelain | grep "^??" | wc -l)
    echo "   未跟踪文件: $UNTRACKED 个"
else
    echo "❌ 当前目录不是Git仓库"
fi

echo ""

# 检查SSH密钥
echo "🔐 SSH 密钥检查:"
if [ -d ~/.ssh ]; then
    SSH_KEYS=$(find ~/.ssh -name "*.pub" 2>/dev/null | wc -l)
    if [ "$SSH_KEYS" -gt 0 ]; then
        echo "✅ 发现 $SSH_KEYS 个SSH公钥:"
        find ~/.ssh -name "*.pub" 2>/dev/null | while read -r key; do
            echo "   $key"
        done
    else
        echo "❌ 未找到SSH公钥"
    fi
else
    echo "❌ SSH目录不存在"
fi

echo ""

# 检查GitHub CLI
echo "🛠️ GitHub CLI 检查:"
if command -v gh >/dev/null 2>&1; then
    echo "✅ GitHub CLI 已安装: $(gh --version | head -n1)"
    
    # 检查认证状态
    if gh auth status >/dev/null 2>&1; then
        echo "✅ GitHub CLI 已认证"
    else
        echo "❌ GitHub CLI 未认证"
    fi
else
    echo "❌ GitHub CLI 未安装"
fi

echo ""

# 检查网络连接
echo "🌐 网络连接检查:"
if ping -c 1 github.com >/dev/null 2>&1; then
    echo "✅ GitHub.com 连接正常"
else
    echo "❌ 无法连接到 GitHub.com"
fi

echo ""

# 检查环境变量
echo "🔧 环境变量检查:"
GITHUB_VARS=("GITHUB_TOKEN" "GITHUB_USERNAME" "GITHUB_EMAIL")
for var in "${GITHUB_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo "✅ $var 已设置"
    else
        echo "❌ $var 未设置"
    fi
done

echo ""

# 生成建议
echo "💡 配置建议:"
if [ "$USER_NAME" = "未设置" ]; then
    echo "   1. 设置Git用户名: git config --global user.name '您的用户名'"
fi

if [ "$USER_EMAIL" = "未设置" ]; then
    echo "   2. 设置Git邮箱: git config --global user.email '您的邮箱'"
fi

if [ "$SSH_KEYS" -eq 0 ]; then
    echo "   3. 生成SSH密钥: ssh-keygen -t ed25519 -C '您的邮箱'"
fi

if ! command -v gh >/dev/null 2>&1; then
    echo "   4. 安装GitHub CLI: 参考 https://cli.github.com/"
fi

if [ "$UNTRACKED" -gt 0 ]; then
    echo "   5. 提交未跟踪文件: git add . && git commit -m '提交信息'"
fi

echo ""
echo "✅ 检查完成！"
echo ""
echo "📖 详细报告请查看: GitHub设置分析报告.md"
echo "🚀 快速开始请查看: GitHub提交快速开始指南.md" 