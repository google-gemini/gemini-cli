# Gemini CLI 项目文档索引

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?style=flat-square&logo=github)](https://github.com/google-gemini/gemini-cli)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue?style=flat-square&logo=typescript)](tsconfig.json)
[![Documentation](https://img.shields.io/badge/Documentation-73%20files-orange?style=flat-square)](docs/)

> 📚 **完整的Gemini CLI项目文档索引** - 涵盖技术分析、架构设计、业务分析、工程化实践等多个方面

## 📋 目录

- [🚀 快速开始](#-快速开始)
- [📖 用户文档](#-用户文档)
- [🏗️ 架构设计文档](#️-架构设计文档)
- [🔧 工程化文档](#-工程化文档)
- [💼 业务产品文档](#-业务产品文档)
- [🚀 集成与扩展文档](#-集成与扩展文档)
- [🔍 分析框架文档](#-分析框架文档)
- [📄 法律与隐私文档](#-法律与隐私文档)
- [📊 文档统计](#-文档统计)
- [🎯 快速导航](#-快速导航)
- [📝 文档维护](#-文档维护)

---

## 🚀 快速开始

### 新用户入门
1. **[README.md](./README.md)** - 项目概览和快速开始
2. **[docs/cli/tutorials.md](./docs/cli/tutorials.md)** - 使用教程
3. **[docs/cli/commands.md](./docs/cli/commands.md)** - 命令参考

### 开发者指南
1. **[GEMINI.md](./GEMINI.md)** - 开发和构建指南
2. **[CONTRIBUTING.md](./CONTRIBUTING.md)** - 贡献指南
3. **[docs/architecture.md](./docs/architecture.md)** - 架构文档

---

## 📖 用户文档

### CLI使用指南
- **[docs/cli/index.md](./docs/cli/index.md)** - CLI使用指南
- **[docs/cli/commands.md](./docs/cli/commands.md)** - CLI命令文档（8.6KB，133行）
- **[docs/cli/configuration.md](./docs/cli/configuration.md)** - 配置文档（23KB，417行）
- **[docs/cli/authentication.md](./docs/cli/authentication.md)** - 认证文档（5.6KB，77行）
- **[docs/cli/themes.md](./docs/cli/themes.md)** - 主题文档（2.1KB，86行）
- **[docs/cli/tutorials.md](./docs/cli/tutorials.md)** - 教程文档（2.5KB，70行）
- **[docs/cli/token-caching.md](./docs/cli/token-caching.md)** - 令牌缓存文档（752B，15行）

### 工具文档
- **[docs/tools/index.md](./docs/tools/index.md)** - 工具概览（4.5KB，57行）
- **[docs/tools/file-system.md](./docs/tools/file-system.md)** - 文件系统工具（9.6KB，144行）
- **[docs/tools/multi-file.md](./docs/tools/multi-file.md)** - 多文件读取工具（4.5KB，67行）
- **[docs/tools/shell.md](./docs/tools/shell.md)** - Shell工具（2.7KB，62行）
- **[docs/tools/web-fetch.md](./docs/tools/web-fetch.md)** - Web获取工具（1.9KB，45行）
- **[docs/tools/web-search.md](./docs/tools/web-search.md)** - Web搜索工具（1.1KB，37行）
- **[docs/tools/memory.md](./docs/tools/memory.md)** - 记忆工具（1.5KB，45行）
- **[docs/tools/mcp-server.md](./docs/tools/mcp-server.md)** - MCP服务器工具（14KB，429行）
- **[docs/tools/troubleshooting.md](./docs/tools/troubleshooting.md)** - 故障排除文档（5.0KB，77行）

### 部署与运维
- **[docs/deployment.md](./docs/deployment.md)** - 部署文档（4.6KB，117行）
- **[docs/checkpointing.md](./docs/checkpointing.md)** - 检查点功能（3.1KB，76行）
- **[docs/telemetry.md](./docs/telemetry.md)** - 遥测文档（9.6KB，232行）
- **[docs/sandbox.md](./docs/sandbox.md)** - 沙箱文档（3.5KB，134行）
- **[docs/extension.md](./docs/extension.md)** - 扩展文档（1.9KB，41行）
- **[docs/troubleshooting.md](./docs/troubleshooting.md)** - 故障排除（5.0KB，77行）
- **[docs/integration-tests.md](./docs/integration-tests.md)** - 集成测试（4.6KB，142行）

### 核心组件
- **[docs/core/index.md](./docs/core/index.md)** - 核心组件介绍
- **[docs/core/tools-api.md](./docs/core/tools-api.md)** - 工具API文档

### 项目文件操作
- **[docs/项目文件操作指南.md](./docs/项目文件操作指南.md)** - 项目文件操作指南（7.9KB，404行）

---

## 🏗️ 架构设计文档

### 核心架构分析
- **[docs/项目概览/GEMINI_CLI_深度分析报告_总览.md](./docs/项目概览/GEMINI_CLI_深度分析报告_总览.md)** - 项目整体架构概览和十层架构分析框架（6.5KB，243行）
- **[docs/项目概览/GEMINI_CLI_深度分析报告.md](./docs/项目概览/GEMINI_CLI_深度分析报告.md)** - 完整的深度分析报告（16KB，677行）
- **[docs/项目概览/GEMINI_CLI_深度分析报告_第一部分.md](./docs/项目概览/GEMINI_CLI_深度分析报告_第一部分.md)** - 核心架构与逻辑分析（4.1KB，164行）
- **[docs/项目概览/GEMINI_CLI_深度分析报告_第二部分.md](./docs/项目概览/GEMINI_CLI_深度分析报告_第二部分.md)** - 工具系统与界面分析（6.6KB，270行）
- **[docs/项目概览/GEMINI_CLI_深度分析报告_第三部分.md](./docs/项目概览/GEMINI_CLI_深度分析报告_第三部分.md)** - 构建部署与优化分析（10KB，442行）

### 架构设计文档
- **[docs/架构/设计方案.md](./docs/架构/设计方案.md)** - 系统设计方案（2.7KB，83行）
- **[docs/架构/架构分析.md](./docs/架构/架构分析.md)** - 架构分析文档（1.5KB，45行）
- **[docs/架构/后端架构.md](./docs/架构/后端架构.md)** - 后端架构详细设计（25KB，872行）
- **[docs/架构/核心架构图.md](./docs/架构/核心架构图.md)** - 核心架构图表说明（12KB，359行）

### 官方架构文档
- **[docs/architecture.md](./docs/architecture.md)** - 官方架构文档

---

## 🔧 工程化文档

### 工程化分析
- **[docs/项目概览/GEMINI_CLI_工程化分析报告.md](./docs/项目概览/GEMINI_CLI_工程化分析报告.md)** - 完整的工程化分析（15KB，643行）
- **[docs/项目概览/Monorepo_结构化分析报告.md](./docs/项目概览/Monorepo_结构化分析报告.md)** - Monorepo架构深度分析（15KB，608行）

### 工程化文档
- **[docs/工程化/工程化分析框架.md](./docs/工程化/工程化分析框架.md)** - 工程化分析框架（2.8KB，93行）
- **[docs/工程化/文档质量标准规范.md](./docs/工程化/文档质量标准规范.md)** - 文档质量标准规范（7.5KB，376行）
- **[docs/工程化/文档迁移计划.md](./docs/工程化/文档迁移计划.md)** - 文档迁移计划（8.7KB，312行）
- **[docs/工程化/文档整理工作总结.md](./docs/工程化/文档整理工作总结.md)** - 文档整理工作总结（6.2KB，191行）
- **[docs/工程化/项目RAG技术集成实施方案.md](./docs/工程化/项目RAG技术集成实施方案.md)** - RAG技术集成实施方案（45KB，1467行）
- **[docs/工程化/工程化.md](./docs/工程化/工程化.md)** - 工程化基础说明（1.3KB，44行）
- **[docs/工程化/PROJECT_ANALYSIS.md](./docs/工程化/PROJECT_ANALYSIS.md)** - 项目工程化分析（7.4KB，306行）

### CI/CD文档
- **[docs/CI/创建doc分支操作指南.md](./docs/CI/创建doc分支操作指南.md)** - 创建文档分支操作指南（7.1KB，308行）
- **[docs/CI/CI_CD_Analysis_Report.md](./docs/CI/CI_CD_Analysis_Report.md)** - CI/CD分析报告（5.0KB，192行）
- **[docs/CI/doc分支创建完成总结.md](./docs/CI/doc分支创建完成总结.md)** - 文档分支创建完成总结（7.4KB，302行）
- **[docs/CI/GitHub提交完成总结.md](./docs/CI/GitHub提交完成总结.md)** - GitHub提交完成总结（5.9KB，218行）
- **[docs/CI/GitHub提交手动操作指南.md](./docs/CI/GitHub提交手动操作指南.md)** - GitHub提交手动操作指南（5.0KB，214行）
- **[docs/CI/GitHub设置总结与行动指南.md](./docs/CI/GitHub设置总结与行动指南.md)** - GitHub设置总结与行动指南（7.4KB，336行）
- **[docs/CI/GitHub设置分析报告.md](./docs/CI/GitHub设置分析报告.md)** - GitHub设置分析报告（7.4KB，324行）
- **[docs/CI/GitHub提交快速开始指南.md](./docs/CI/GitHub提交快速开始指南.md)** - GitHub提交快速开始指南（4.4KB，191行）
- **[docs/CI/GitHub仓库分析报告.md](./docs/CI/GitHub仓库分析报告.md)** - GitHub仓库分析报告（6.9KB，308行）

---

## 💼 业务产品文档

### 业务分析
- **[docs/项目概览/Gemini_CLI_业务产品架构分析.md](./docs/项目概览/Gemini_CLI_业务产品架构分析.md)** - 业务产品架构深度分析（18KB，341行）
- **[docs/项目概览/项目账户体系深度分析报告.md](./docs/项目概览/项目账户体系深度分析报告.md)** - 账户体系分析（10KB，363行）
- **[docs/项目概览/Gemini_CLI_技术亮点分析报告.md](./docs/项目概览/Gemini_CLI_技术亮点分析报告.md)** - 技术亮点总结（5.7KB，152行）

### 项目概览文档
- **[docs/项目概览/README.md](./docs/项目概览/README.md)** - 项目概览说明（6.3KB，212行）
- **[docs/项目概览/项目文档整理与GitHub提交完整方案.md](./docs/项目概览/项目文档整理与GitHub提交完整方案.md)** - 项目文档整理与GitHub提交完整方案（9.5KB，317行）
- **[docs/项目概览/项目管理视角的文档组织分析报告.md](./docs/项目概览/项目管理视角的文档组织分析报告.md)** - 项目管理视角的文档组织分析报告（10KB，373行）
- **[docs/项目概览/Gemini_CLI_架构分析表格.md](./docs/项目概览/Gemini_CLI_架构分析表格.md)** - Gemini CLI架构分析表格（10KB，156行）
- **[docs/项目概览/工具参数结构化文档.md](./docs/项目概览/工具参数结构化文档.md)** - 工具参数结构化文档（12KB，473行）

---

## 🚀 集成与扩展文档

### 项目改造文档
- **[docs/项目改造/Gemini_CLI_API改造方案.md](./docs/项目改造/Gemini_CLI_API改造方案.md)** - Gemini CLI API改造方案（17KB，578行）
- **[docs/项目改造/context7_integration_plan.md](./docs/项目改造/context7_integration_plan.md)** - Context7集成落地设计方案（11KB，436行）
- **[docs/项目改造/context7_analysis.md](./docs/项目改造/context7_analysis.md)** - Context7核心产品特性分析（2.5KB，102行）
- **[docs/项目改造/Flowith.io产品深度分析报告.md](./docs/项目改造/Flowith.io产品深度分析报告.md)** - Flowith.io产品深度分析报告（9.5KB，316行）
- **[docs/项目改造/RAG技术应用分析报告.md](./docs/项目改造/RAG技术应用分析报告.md)** - RAG技术应用分析报告（9.9KB，334行）
- **[docs/项目改造/API文档.md](./docs/项目改造/API文档.md)** - API文档（10KB，391行）

### 模型文档
- **[docs/model/prompt核心分析框架.md](./docs/model/prompt核心分析框架.md)** - Prompt核心分析框架（2.2KB，54行）
- **[docs/model/LLM提示词与工具调用深度分析.md](./docs/model/LLM提示词与工具调用深度分析.md)** - LLM提示词与工具调用深度分析（12KB，391行）
- **[docs/model/MCP调用文档.md](./docs/model/MCP调用文档.md)** - MCP调用文档（4.3KB，98行）
- **[docs/model/LLM模型调用文档.md](./docs/model/LLM模型调用文档.md)** - LLM模型调用文档（15KB，566行）

---

## 🔍 分析框架文档

### 分析框架
- **[docs/model/prompt核心分析框架.md](./docs/model/prompt核心分析框架.md)** - Prompt分析框架（2.2KB，54行）
- **[docs/工程化/PROJECT_ANALYSIS.md](./docs/工程化/PROJECT_ANALYSIS.md)** - 项目工程化分析（7.4KB，306行）

---

## 📄 法律与隐私文档

### 法律文档
- **[docs/tos-privacy.md](./docs/tos-privacy.md)** - 服务条款和隐私政策（5.2KB，59行）
- **[LICENSE](./LICENSE)** - 开源许可证（11KB，203行）

---

## 📊 文档统计

### 按类型分类
| 文档类型 | 文件数量 | 总大小 | 主要文件 |
|---------|---------|--------|---------|
| **用户文档** | 15 | ~80KB | CLI命令和配置文档 |
| **架构设计** | 9 | ~80KB | 深度分析报告系列、架构设计文档 |
| **工程化** | 16 | ~120KB | 工程化分析报告、CI/CD文档 |
| **业务产品** | 8 | ~80KB | 业务产品架构分析、项目概览文档 |
| **集成扩展** | 10 | ~100KB | RAG技术集成方案、项目改造文档 |
| **分析框架** | 2 | ~10KB | 分析框架文档、模型文档 |
| **法律隐私** | 2 | ~16KB | 服务条款和许可证 |

### 按位置分类
| 目录 | 文件数量 | 说明 |
|------|---------|------|
| **docs/cli/** | 7 | CLI相关文档 |
| **docs/tools/** | 9 | 工具相关文档 |
| **docs/core/** | 2 | 核心组件文档 |
| **docs/项目概览/** | 10 | 项目概览和分析文档 |
| **docs/工程化/** | 7 | 工程化相关文档 |
| **docs/CI/** | 9 | CI/CD相关文档 |
| **docs/架构/** | 4 | 架构设计文档 |
| **docs/项目改造/** | 6 | 项目改造和集成文档 |
| **docs/model/** | 4 | 模型和AI相关文档 |
| **docs/** | 13 | 其他官方文档 |

---

## 🎯 快速导航

### 架构分析
1. **[docs/项目概览/GEMINI_CLI_深度分析报告_总览.md](./docs/项目概览/GEMINI_CLI_深度分析报告_总览.md)** - 架构总览
2. **[docs/项目概览/Monorepo_结构化分析报告.md](./docs/项目概览/Monorepo_结构化分析报告.md)** - Monorepo分析
3. **[docs/项目概览/GEMINI_CLI_工程化分析报告.md](./docs/项目概览/GEMINI_CLI_工程化分析报告.md)** - 工程化分析

### 业务分析
1. **[docs/项目概览/Gemini_CLI_业务产品架构分析.md](./docs/项目概览/Gemini_CLI_业务产品架构分析.md)** - 业务架构
2. **[docs/项目概览/Gemini_CLI_技术亮点分析报告.md](./docs/项目概览/Gemini_CLI_技术亮点分析报告.md)** - 技术亮点
3. **[docs/项目概览/项目账户体系深度分析报告.md](./docs/项目概览/项目账户体系深度分析报告.md)** - 账户体系

### 集成开发
1. **[docs/工程化/项目RAG技术集成实施方案.md](./docs/工程化/项目RAG技术集成实施方案.md)** - RAG集成方案
2. **[docs/项目改造/Gemini_CLI_API改造方案.md](./docs/项目改造/Gemini_CLI_API改造方案.md)** - API改造方案
3. **[docs/项目改造/context7_integration_plan.md](./docs/项目改造/context7_integration_plan.md)** - Context7集成

### 模型和AI
1. **[docs/model/LLM模型调用文档.md](./docs/model/LLM模型调用文档.md)** - LLM模型调用
2. **[docs/model/LLM提示词与工具调用深度分析.md](./docs/model/LLM提示词与工具调用深度分析.md)** - 提示词分析
3. **[docs/model/MCP调用文档.md](./docs/model/MCP调用文档.md)** - MCP调用

### 工程化和CI/CD
1. **[docs/工程化/文档质量标准规范.md](./docs/工程化/文档质量标准规范.md)** - 文档质量标准
2. **[docs/CI/GitHub提交快速开始指南.md](./docs/CI/GitHub提交快速开始指南.md)** - GitHub提交指南
3. **[docs/CI/CI_CD_Analysis_Report.md](./docs/CI/CI_CD_Analysis_Report.md)** - CI/CD分析

---

## 📝 文档维护

### 文档更新原则
- **保持同步**: 代码变更时及时更新相关文档
- **版本控制**: 重要文档变更需要版本记录
- **质量保证**: 定期检查和更新文档准确性
- **用户反馈**: 根据用户反馈优化文档内容

### 文档贡献
- 遵循项目的贡献指南
- 使用统一的文档格式和风格
- 提供清晰的示例和说明
- 保持文档的简洁性和可读性

---

<div align="center">

**📚 文档总数: 73个文件 | 总大小: ~571KB**

*最后更新: 2024年12月*

[⬆️ 回到顶部](#gemini-cli-项目文档索引)

</div> 