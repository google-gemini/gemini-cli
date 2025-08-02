# 工具

<p align="center">
  简体中文 | <a href="../../../../docs/tools/index.md">🌐 English</a>
</p>

Gemini CLI 提供了一套强大的工具，使模型能够与您的本地环境进行交互。这些工具旨在安全可靠，默认情况下在沙箱环境中运行。

## 可用工具

-   [**文件系统工具**](file-system.md)：允许模型读取和写入您的文件系统。
-   [**多文件工具**](multi-file.md)：允许模型一次性读取多个文件。
-   [**Shell 工具**](shell.md)：允许模型在您的本地机器上执行 shell 命令。
-   [**内存工具**](memory.md)：允许模型在对话中存储和检索信息。
-   [**MCP 服务器工具**](mcp-server.md)：允许模型与模型上下文协议 (MCP) 服务器进行交互。
-   [**网页抓取工具**](web-fetch.md)：允许模型从 URL 抓取内容。
-   [**Google 网页搜索工具**](web-search.md)：允许模型使用 Google 搜索在网络上查找信息。

## 安全

所有与文件系统和 shell 执行交互的工具默认都在沙箱环境中运行。有关更多信息，请参阅[沙箱](../sandbox.md)文档。