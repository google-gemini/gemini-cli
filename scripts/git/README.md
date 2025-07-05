# GitHub账户全面分析工具

这是一个功能强大的GitHub账户分析脚本，可以对GitHub账户进行全面的检查、分析和结构化整理。

## 功能特性

### 🔍 基本信息分析
- 用户基本信息（用户名、姓名、邮箱、个人简介等）
- 账户创建时间和最后更新时间
- 地理位置、公司、博客、Twitter等社交信息

### 📊 仓库统计分析
- 总仓库数量统计
- 星标数、分支数、关注者数统计
- 编程语言使用分析
- 仓库主题标签分析
- 每个仓库的详细信息（包括许可证、大小、活跃度等）

### 👥 社交网络分析
- 关注者列表和统计
- 关注的人列表和统计
- 社交网络连接分析

### 📈 活动分析
- 公开活动记录
- 活动类型统计（Push、Pull Request、Issue等）
- 活跃度分析

### 🏢 组织分析
- 所属组织列表
- 组织成员身份分析

### 📋 数据输出
- 结构化的JSON数据文件
- 详细的Markdown分析报告
- 完整的日志记录
- 分类存储的数据文件
- **脚本目录下的汇总文件** - 快速查看分析结果

### ⏱️ 进度显示
- **实时进度条** - 显示每个任务的执行进度（等号样式，与分隔线一致）
- **任务计数器** - 显示当前任务和总任务数（1/10格式）
- **仓库处理进度** - 显示仓库分析的独立进度条，确保100%完成
- **完成状态** - 每个任务完成后显示100%完成状态
- **百分比控制** - 确保进度不超过100%，每个任务完成时显示100%

## 系统要求

### 必需依赖
- `bash` (4.0+)
- `curl` - HTTP请求工具
- `jq` - JSON处理工具
- `git` - Git版本控制工具

### 安装依赖

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install curl jq git
```

#### CentOS/RHEL:
```bash
sudo yum install curl jq git
# 或者
sudo dnf install curl jq git
```

#### macOS:
```bash
brew install curl jq git
```

## 使用方法

### 1. 基本使用

```bash
# 直接运行脚本
./scripts/git/github_account_check.sh
```

脚本会提示您输入GitHub用户名，然后开始分析。

### 2. 设置GitHub Token（推荐）

为了获得更好的访问权限和更高的API限制，建议设置GitHub Personal Access Token：

```bash
# 设置环境变量
export GITHUB_TOKEN='your_github_token_here'

# 然后运行脚本
./scripts/git/github_account_check.sh
```

#### 如何获取GitHub Token：
1. 访问 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. 点击 "Generate new token"
3. 选择需要的权限（建议选择 `public_repo` 和 `read:user`）
4. 复制生成的token

### 3. 指定用户名

```bash
# 通过环境变量指定用户名
export GITHUB_USERNAME='your_username'
./scripts/git/github_account_check.sh
```

### 4. 查看分析结果

```bash
# 查看最新的分析汇总
./scripts/git/view_summary.sh

# 或者直接查看汇总文件
cat scripts/git/github_analysis_summary.txt
```

## 输出文件结构

脚本运行后会在脚本目录下创建以下文件：

**脚本目录下的汇总文件：**
```
github_analysis_summary.txt   # 分析结果汇总（快速查看）
```

**时间戳命名的详细输出目录：**
```
github_analysis_YYYYMMDD_HHMMSS/
├── analysis.log              # 执行日志
├── analysis_report.md        # 详细分析报告
├── github_data.json          # 汇总JSON数据
├── user_info.json           # 用户基本信息
├── user_summary.json        # 用户信息摘要
├── repositories.json        # 仓库列表
├── repo_stats.json          # 仓库统计
├── followers.json           # 关注者列表
├── following.json           # 关注的人列表
├── social_stats.json        # 社交统计
├── events.json              # 活动记录
├── activity_stats.json      # 活动统计
├── organizations.json       # 组织信息
├── orgs_summary.json        # 组织摘要
├── repos/                   # 单个仓库详细信息
│   ├── repo1.json
│   ├── repo2.json
│   └── ...
├── profiles/                # 配置文件（预留）
└── stats/                   # 统计文件（预留）
```

## 分析报告内容

生成的Markdown报告包含以下内容：

1. **基本信息** - 用户的基本信息和联系方式
2. **统计概览** - 仓库、社交、活动、组织的统计数据
3. **编程语言分析** - 使用的编程语言分布
4. **活动类型分析** - 各种GitHub活动的统计
5. **组织成员** - 所属的组织列表
6. **数据文件说明** - 所有生成文件的说明

## API限制说明

### 无Token访问（公开API）
- 每小时60次请求限制
- 只能访问公开信息
- 无法获取私有仓库信息
- 无法获取仓库主题标签

### 有Token访问
- 每小时5000次请求限制
- 可以访问更多详细信息
- 可以获取仓库主题标签
- 更好的数据完整性

## 错误处理

脚本包含完善的错误处理机制：

- 依赖检查：自动检查必需的工具是否安装
- 用户验证：验证GitHub用户名是否存在
- API错误处理：处理GitHub API的各种错误情况
- 日志记录：详细记录执行过程和错误信息

## 示例输出

```
========================================
    GitHub账户全面分析工具    
========================================

[TASK 1/10] 开始执行: 检查系统依赖
[检查系统依赖] =============== 100% (1/1)[SUCCESS] 检查系统依赖 完成

[TASK 2/10] 开始执行: 创建输出目录
[创建输出目录] =============== 100% (2/2)[SUCCESS] 创建输出目录 完成

[TASK 3/10] 开始执行: 获取用户基本信息
[获取用户基本信息] =============== 100% (3/3)[SUCCESS] 获取用户基本信息 完成

[TASK 4/10] 开始执行: 获取仓库列表
[INFO] 正在处理 8 个仓库...
[仓库处理] =============== 100% (8/8)
[获取仓库列表] =============== 100% (4/4)[SUCCESS] 获取仓库列表 完成

[TASK 5/10] 开始执行: 获取社交连接信息
[获取社交连接信息] ███████████████░░░░░░░░░░░░░░░ 50% (5/10)[SUCCESS] 获取社交连接信息 完成

[TASK 6/10] 开始执行: 获取活动信息
[获取活动信息] ██████████████████░░░░░░░░░░░░ 60% (6/10)[SUCCESS] 获取活动信息 完成

[TASK 7/10] 开始执行: 获取组织信息
[获取组织信息] █████████████████████░░░░░░░░░ 70% (7/10)[SUCCESS] 获取组织信息 完成

[TASK 8/10] 开始执行: 生成分析报告
[生成分析报告] ████████████████████████░░░░░░ 80% (8/10)[SUCCESS] 生成分析报告 完成

[TASK 9/10] 开始执行: 生成JSON汇总文件
[生成JSON汇总文件] ███████████████████████████░░░ 90% (9/10)[SUCCESS] 生成JSON汇总文件 完成

[TASK 10/10] 开始执行: 生成分析结果汇总文件
[生成分析结果汇总文件] ██████████████████████████████ 100% (10/10)[SUCCESS] 生成分析结果汇总文件 完成

[INFO] 分析耗时: 22 秒

========================================
        GitHub账户分析完成        
========================================
用户名: octocat
姓名: The Octocat
仓库数: 8
总星标: 19217
关注者: 100
关注: 9

输出目录: /path/to/github_analysis_20241201_143022
报告文件: /path/to/analysis_report.md
JSON数据: /path/to/github_data.json
日志文件: /path/to/analysis.log
汇总文件: /path/to/github_analysis_summary.txt

分析完成！所有数据已保存到指定目录。
```

## 故障排除

### 常见问题

1. **依赖缺失**
   ```
   [ERROR] 缺少以下依赖: jq
   请安装缺少的依赖后重试
   ```
   解决方案：按照系统要求安装缺失的依赖

2. **用户不存在**
   ```
   [ERROR] 用户 username 不存在
   ```
   解决方案：检查用户名是否正确

3. **API限制**
   ```
   [ERROR] API rate limit exceeded
   ```
   解决方案：设置GitHub Token或等待限制重置

4. **权限不足**
   ```
   [ERROR] 403 Forbidden
   ```
   解决方案：检查Token权限或使用公开API

## 贡献

欢迎提交Issue和Pull Request来改进这个工具！

## 许可证

本项目采用MIT许可证。

## 相关项目

- [GitHub-Account-Analyzer](https://github.com/ALIILAPRO/GitHub-Account-Analyzer) - 类似的GitHub账户分析工具
- [Gitinfo](https://github.com/spraytheunbeaten/Gitinfo) - GitHub信息获取脚本
- [ssh-keys-from-github](https://github.com/mkqavi/ssh-keys-from-github) - 从GitHub获取SSH密钥 