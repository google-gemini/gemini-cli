🌐 [查看英文版](../../../docs/index.md)

# 欢迎来到 Gemini CLI 文档

本文档提供了安装、使用和开发 Gemini CLI 的综合指南。该工具可让您通过命令行界面与 Gemini 模型进行交互。

## 概述

Gemini CLI 以交互式读取-求值-打印循环 (REPL) 环境将 Gemini 模型的功能带到您的终端。Gemini CLI 由一个客户端应用程序 (`packages/cli`) 组成，该应用程序与本地服务器 (`packages/core`) 通信，后者又管理对 Gemini API 及其 AI 模型的请求。Gemini CLI 还包含用于执行文件系统操作、运行 shell 和 Web 抓取等任务的各种工具，这些工具由 `packages/core` 管理。

## 浏览文档

本文档分为以下几个部分：

- **[执行和部署](./deployment.md)：** 运行 Gemini CLI 的信息。
- **[架构概述](./architecture.md)：** 了解 Gemini CLI 的高级设计，包括其组件以及它们如何交互。
- **CLI 用法：** `packages/cli` 的文档。
  - **[CLI 简介](./cli/index.md)：** 命令行界面概述。
  - **[命令](./cli/commands.md)：** 可用 CLI 命令的说明。
  - **[配置](./cli/configuration.md)：** 有关配置 CLI 的信息。
  - **[检查点](./checkpointing.md)：** 检查点功能的文档。
  - **[扩展](./extension.md)：** 如何使用新功能扩展 CLI。
  - **[遥测](./telemetry.md)：** CLI 中遥测的概述。
- **核心详细信息：** `packages/core` 的文档。
  - **[核心简介](./core/index.md)：** 核心组件概述。
  - **[工具 API](./core/tools-api.md)：** 有关核心如何管理和公开工具的信息。
- **工具：**
  - **[工具概述](./tools/index.md)：** 可用工具的概述。
  - **[文件系统工具](./tools/file-system.md)：** `read_file` 和 `write_file` 工具的文档。
  - **[多文件读取工具](./tools/multi-file.md)：** `read_many_files` 工具的文档。
  - **[Shell 工具](./tools/shell.md)：** `run_shell_command` 工具的文档。
  - **[Web 抓取工具](./tools/web-fetch.md)：** `web_fetch` 工具的文档。
  - **[Web 搜索工具](./tools/web-search.md)：** `google_web_search` 工具的文档。
  - **[内存工具](./tools/memory.md)：** `save_memory` 工具的文档。
- **[贡献和开发指南](../CONTRIBUTING.md)：** 面向贡献者和开发人员的信息，包括设置、构建、测试和编码约定。
- **[NPM 工作区和发布](./npm.md)：** 有关如何管理和发布项目包的详细信息。
- **[故障排除指南](./troubleshooting.md)：** 查找常见问题和常见问题解答的解决方案。
- **[服务条款和隐私声明](./tos-privacy.md)：** 有关适用于您使用 Gemini CLI 的服务条款和隐私声明的信息。

我们希望本文档能帮助您充分利用 Gemini CLI！