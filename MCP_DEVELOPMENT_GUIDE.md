# MCP 开发指南：将 Gemini CLI 工具作为 MCP 服务暴露

本文档详细介绍了如何将 Gemini CLI 项目的内置核心工具通过模型上下文协议 (MCP) 接口暴露出来，以便其他程序（包括 Gemini CLI 本身或其他兼容 MCP 的客户端）可以使用这些功能。我们将重点介绍为此目的创建的 `gemini-tools-mcp-server`。

## 1. MCP 与 Gemini CLI 工具服务简介

### 什么是 MCP？

模型上下文协议 (MCP) 是一种规范，允许语言模型（如 Gemini）与外部工具和服务进行交互。MCP 服务器充当这些工具的提供者，使语言模型能够发现工具、了解其功能和参数，并执行它们以获取结果。这极大地扩展了语言模型的能力，使其能够与真实世界的系统和数据进行交互。

### `gemini-tools-mcp-server` 的目标和功能

`gemini-tools-mcp-server` 是一个专门为 Gemini CLI 开发的 MCP 服务器。其主要目标是将 Gemini CLI 内部已经实现的核心工具（例如文件操作、代码执行、Web 搜索等）通过 MCP 协议提供出来。

**核心功能：**

*   **工具发现**：允许 MCP 客户端发现 Gemini CLI 的内置工具。
*   **工具执行**：接收来自 MCP 客户端的工具调用请求，执行相应的 Gemini CLI 工具，并将结果返回。
*   **标准化接口**：为 Gemini CLI 的强大工具集提供一个标准的、可供外部程序访问的接口。

## 2. 先决条件

在开始之前，请确保您的开发环境满足以下要求：

*   **Node.js 和 npm**：建议使用 Node.js 18.x 或更高版本，以及配套的 npm。
*   **Gemini CLI Monorepo 代码库**：您需要拥有 Gemini CLI 的完整 monorepo 代码库，因为 `gemini-tools-mcp-server` 依赖于其中的其他包。
*   **构建工具**：确保 monorepo 的基本构建工具（如 TypeScript 编译器 `tsc`）能够正常工作。

## 3. 安装与构建

以下步骤将指导您完成从代码库设置到构建所有必要组件的过程。

### 3.1. 获取代码

如果您尚未获取 Gemini CLI 的代码库，请先克隆它：

```bash
git clone <repository_url> # 替换为 Gemini CLI 代码库的实际 URL
cd <repository_name>     # 进入 monorepo 的根目录
```

### 3.2. 安装依赖

在 monorepo 的根目录下，安装所有工作区（包括 `gemini-tools-mcp-server`）的依赖项：

```bash
npm install
```

### 3.3. 构建核心模块

`gemini-tools-mcp-server` 依赖于 Gemini CLI 的核心功能和命令行接口。

*   **构建 `@google/gemini-cli-core`** (核心逻辑和工具定义):
    ```bash
    npm run build --workspace @google/gemini-cli-core
    ```

*   **构建 `@google/gemini-cli`** (CLI 应用，特别是 `gemini-execute-tool`):
    ```bash
    npm run build --workspace @google/gemini-cli
    ```
    这将编译 TypeScript 代码到各自包的 `dist` 目录。`gemini-execute-tool` 脚本（实际路径为 `packages/cli/dist/execute-tool-cli.js`）对于 MCP 服务器至关重要。

### 3.4. 生成工具 Schema

MCP 服务器需要知道可用工具的元数据（名称、描述、参数）。我们为此创建了一个脚本。

在 **monorepo 的根目录**下运行：

```bash
npm run generate-tool-schemas
```

此命令会执行 `scripts/generate-tool-schemas.ts` 脚本，该脚本会：
1.  加载 Gemini CLI 的核心工具。
2.  提取每个工具的 schema 信息。
3.  将这些 schema 保存到 monorepo 根目录下的 `dist/tool-schemas.json` 文件中。

**验证**：检查 `dist/tool-schemas.json` 文件是否已成功创建，并且内容看起来是正确的工具 schema 列表。

### 3.5. 构建 MCP 服务器 (`@google/gemini-tools-mcp-server`)

现在，构建实际的 MCP 服务器包：

```bash
npm run build --workspace @google/gemini-tools-mcp-server
```
或者，如果您在 `packages/gemini-tools-mcp-server` 目录下：
```bash
npm run build
```
这将编译 `packages/gemini-tools-mcp-server/src/server.ts` 到 `packages/gemini-tools-mcp-server/dist/server.js`。

## 4. `gemini-tools-mcp-server` 详解

### 4.1. 架构

`gemini-tools-mcp-server` 的工作流程如下：

1.  **启动时**：服务器读取位于 monorepo 根目录下 `dist/tool-schemas.json` 文件。
2.  **工具注册**：对于 `tool-schemas.json` 中的每一个工具 schema，服务器使用 `@modelcontextprotocol/sdk` 在内部注册一个对应的 MCP 工具。
3.  **接收请求**：当 MCP 客户端（如 Gemini CLI）连接并请求执行某个工具时，服务器会收到该请求。
4.  **调用 `gemini-execute-tool`**：服务器的该工具的执行处理函数会构造一个命令行调用。它会执行 `gemini-execute-tool` 脚本（即 `node packages/cli/dist/execute-tool-cli.js`），并将 MCP 客户端提供的工具名称和参数传递给该脚本。
5.  **获取结果**：`gemini-execute-tool` 脚本执行实际的 Gemini CLI 核心工具，并将结果（一个包含 `llmContent` 和 `returnDisplay` 的 JSON 对象）输出到其标准输出。
6.  **返回结果**：MCP 服务器捕获 `gemini-execute-tool` 的输出，解析 JSON，并将其格式化为 MCP 规范所要求的响应格式，然后发送回 MCP 客户端。

### 4.2. 配置文件：`dist/tool-schemas.json`

这个 JSON 文件是 MCP 服务器的数据源。它包含了 Gemini CLI 所有内置工具的元数据：

*   `name`: 工具的唯一名称。
*   `description`: 工具功能的描述。
*   `parameterSchema`: 工具输入参数的 JSON Schema 定义。

如果 Gemini CLI 的核心工具集发生变化（添加、删除或修改工具），需要重新运行 `npm run generate-tool-schemas` 来更新此文件。

### 4.3. 核心脚本：`packages/gemini-tools-mcp-server/src/server.ts`

这是 MCP 服务器的主要实现文件。关键部分包括：

*   使用 `McpServer` 和 `StdioServerTransport` from `@modelcontextprotocol/sdk`。
*   文件系统操作 (`fs`) 来读取 `tool-schemas.json`。
*   子进程操作 (`child_process.spawn`) 来调用 `gemini-execute-tool`。
*   为每个从 schema 加载的工具动态创建执行处理函数。

## 5. 运行 `gemini-tools-mcp-server`

在完成所有构建步骤后，您可以运行 MCP 服务器。

### 5.1. 启动命令

从 **monorepo 的根目录**下运行：

```bash
node packages/gemini-tools-mcp-server/dist/server.js
```

### 5.2. 预期输出和日志

*   如果服务器成功启动并通过 Stdio 连接，它会将一条消息打印到其**标准错误 (stderr)** 流，例如：
    ```
    Gemini Tools MCP Server connected via Stdio.
    ```
    *注意：MCP 服务器通常使用 stderr 进行日志记录，以避免干扰通过 stdout 进行的 MCP 消息交换。*
*   服务器将保持运行状态，等待来自 MCP 客户端的连接和请求。

## 6. 配置 Gemini CLI (或其他 MCP 客户端) 使用此 MCP 服务

要让 Gemini CLI（或其他 MCP 客户端）使用您刚刚运行的 `gemini-tools-mcp-server`，您需要配置客户端。对于 Gemini CLI，这通常通过修改其 `settings.json` 文件来完成。

### 6.1. 修改 `.gemini/settings.json`

找到或创建 Gemini CLI 的设置文件。通常位于：

*   项目本地：`<your_project_directory>/.gemini/settings.json`
*   用户全局：`~/.gemini/settings.json`

向该 JSON 文件添加或修改 `mcpServers` 配置块。

### 6.2. `mcpServers` 配置块详解

一个典型的 MCP 服务器配置条目包含以下字段（对于 Stdio 传输）：

*   `"command"`: 启动 MCP 服务器的命令（例如 `"node"`）。
*   `"args"`: 传递给命令的参数列表（例如 `["packages/gemini-tools-mcp-server/dist/server.js"]`）。
*   `"cwd"`: (可选) 命令的工作目录。对于 `gemini-tools-mcp-server`，如果它依赖于从 monorepo 根目录解析的路径，则应将其设置为 monorepo 的根路径。
*   `"trust"`: (可选, boolean) 如果设置为 `true`，客户端将跳过对此服务器提供的工具的执行确认提示。默认为 `false`。在测试时设为 `true` 可以简化流程。
*   `"timeout"`: (可选, number) 请求超时时间（毫秒）。

### 6.3. 示例配置

将以下内容添加到您的 `settings.json` 文件中（请根据您的实际 monorepo 路径进行调整）：

```json
{
  // ... 其他现有设置 ...

  "mcpServers": {
    "localGeminiBuiltinTools": {
      "command": "node",
      "args": [
        "<path_to_your_gemini_cli_monorepo>/packages/gemini-tools-mcp-server/dist/server.js"
      ],
      "cwd": "<path_to_your_gemini_cli_monorepo>",
      "trust": true, // 推荐在开发和测试时使用
      "timeout": 60000 // 示例超时时间 (60 秒)
    }
  },

  // 可选：如果您只想通过 MCP 使用这些工具，
  // 可以尝试禁用 Gemini CLI 的内置核心工具，以避免名称冲突或确保 MCP 版本被调用。
  // "coreTools": []
  // 或者使用 "excludeTools" 来排除特定的内置工具，如果它们与 MCP 服务器上的工具重名。
}
```

**重要**：将 `<path_to_your_gemini_cli_monorepo>` 替换为您本地 Gemini CLI monorepo 的**绝对路径**。

## 7. 测试 MCP 服务

配置好 Gemini CLI 客户端后，启动一个新的 Gemini CLI 实例（确保它加载了包含上述 MCP 配置的 `settings.json`）。

### 7.1. 检查服务状态和可用工具

在 Gemini CLI 中，使用内置的 `/mcp` 命令：

```
/mcp
```

您应该能看到类似以下的输出，表明 `localGeminiBuiltinTools` 服务器已连接，并列出了它提供的工具：

```
MCP Servers Status:

📡 localGeminiBuiltinTools (CONNECTED)
  Command: node <path_to_your_gemini_cli_monorepo>/packages/gemini-tools-mcp-server/dist/server.js
  Working Directory: <path_to_your_gemini_cli_monorepo>
  Timeout: 60000ms
  Tools: list_directory, read_file, run_shell_command, ... (其他工具)

Discovery State: COMPLETED
```

### 7.2. 通过自然语言调用 MCP 暴露的工具

现在，尝试通过自然语言提示来使用这些工具。例如：

*   `list all files in the current directory`
*   `what is the content of the file named "package.json"`
*   `run the shell command: echo "Hello from MCP!"`

### 7.3. 预期行为和结果验证

*   Gemini CLI 应该能够理解您的请求，并确定需要使用通过 MCP 暴露的工具。
*   由于 `trust: true`，它可能不会要求您确认工具执行。
*   工具应该成功执行，并将结果显示在 Gemini CLI 中。
*   同时，观察运行 `gemini-tools-mcp-server` 的终端，检查是否有任何错误日志。

### 7.4. 测试错误处理

尝试一些会导致错误的场景：

*   请求读取一个不存在的文件。
*   执行一个会失败的 shell 命令。

验证错误是否能从 `gemini-execute-tool` 正确传播回 MCP 服务器，再到 Gemini CLI 客户端，并以适当的方式显示给用户。

## 8. 开发新的 MCP 工具 (通用指南)

虽然本文档专注于将现有的 Gemini CLI 工具通过 MCP 暴露，但如果您想为**其他项目**或功能开发全新的 MCP 工具，可以遵循类似的模式：

1.  **定义工具的 Schema**：
    *   为您的工具创建一个清晰的 JSON Schema，描述其名称、功能以及输入参数。这是 MCP 客户端理解如何使用您的工具的基础。

2.  **创建命令行接口 (CLI) 来执行工具逻辑**：
    *   开发一个独立的命令行脚本或程序，该脚本接收工具名称和 JSON 格式的参数。
    *   此脚本执行工具的核心逻辑。
    *   执行结果（成功或错误）应以结构化的 JSON 格式输出到标准输出或标准错误。
    *   这种方式将工具的执行逻辑与 MCP 服务器的通信逻辑解耦。

3.  **开发 MCP 服务器**：
    *   使用 `@modelcontextprotocol/sdk` (特别是 `McpServer` 和相应的 transport，如 `StdioServerTransport`)。
    *   MCP 服务器读取您在步骤 1 中定义的 schema。
    *   为每个工具注册一个处理函数。
    *   此处理函数将调用您在步骤 2 中创建的命令行接口，传递参数并处理其输出。

这种模式（MCP 服务器 -> CLI 包装器 -> 实际工具逻辑）是一种稳健的方式，可以模块化您的工具，并使其易于通过 MCP 暴露。

## 9. 故障排除

*   **服务器启动失败**：
    *   检查 Node.js 版本。
    *   确保所有依赖已正确安装 (`npm install` 在 MCP 服务器包目录和 monorepo 根目录)。
    *   确认 `dist/tool-schemas.json` 文件存在且路径正确。
    *   确认 `packages/cli/dist/execute-tool-cli.js` 已构建且路径正确。
*   **工具未被发现 (在客户端的 `/mcp` 命令中)**：
    *   确认 MCP 服务器正在运行，并且客户端 `settings.json` 中的配置（命令、参数、cwd）正确无误。
    *   检查 MCP 服务器的日志（stderr）是否有关于 schema 加载或工具注册的错误。
*   **工具执行错误**：
    *   检查 MCP 服务器的日志，看它是否成功调用了 `gemini-execute-tool`。
    *   直接测试 `gemini-execute-tool` 命令（如步骤 7.4 中所述），看它是否能独立工作。
    *   检查 `gemini-execute-tool` 的输出和错误，确保它们是 MCP 服务器期望的 JSON 格式。

## 10. 总结

通过 `gemini-tools-mcp-server` 和 `gemini-execute-tool` 的结合，我们成功地将 Gemini CLI 的核心内置工具功能通过标准的 MCP 接口暴露出来。这不仅使得这些工具可以被其他 MCP 客户端复用，也为 Gemini CLI 本身未来可能的架构演进（例如，将核心工具作为可插拔的 MCP 服务）提供了一种模式。

遵循本文档中的步骤，您应该能够成功构建、运行和使用这个 MCP 服务。
