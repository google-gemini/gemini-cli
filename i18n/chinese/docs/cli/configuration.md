# Gemini CLI 配置

<p align="center">
  简体中文 | <a href="../../../../docs/cli/configuration.md">🌐 English</a>
</p>

Gemini CLI 提供了多种配置其行为的方法，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置。

## 配置层

配置按以下优先顺序应用（编号较小的被编号较大的覆盖）：

1.  **默认值：** 应用程序中硬编码的默认值。
2.  **用户设置文件：** 当前用户的全局设置。
3.  **项目设置文件：** 特定于项目的设置。
4.  **系统设置文件：** 系统范围的设置。
5.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
6.  **命令行参数：** 启动 CLI 时传递的值。

## 设置文件

Gemini CLI 使用 `settings.json` 文件进行持久配置。这些文件有三个位置：

- **用户设置文件：**
  - **位置：** `~/.gemini/settings.json`（其中 `~` 是您的主目录）。
  - **范围：** 适用于当前用户的所有 Gemini CLI 会话。
- **项目设置文件：**
  - **位置：** 项目根目录中的 `.gemini/settings.json`。
  - **范围：** 仅在从该特定项目运行 Gemini CLI 时适用。项目设置会覆盖用户设置。
- **系统设置文件：**
  - **位置：** `/etc/gemini-cli/settings.json` (Linux)、`C:\ProgramData\gemini-cli\settings.json` (Windows) 或 `/Library/Application Support/GeminiCli/settings.json` (macOS)。可以使用 `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 环境变量覆盖该路径。
  - **范围：** 适用于系统上所有用户的所有 Gemini CLI 会话。系统设置会覆盖用户和项目设置。对于希望控制用户 Gemini CLI 设置的企业系统管理员可能很有用。

**关于设置中环境变量的说明：** `settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。加载设置时，这些变量将自动解析。例如，如果您有一个环境变量 `MY_API_TOKEN`，您可以在 `settings.json` 中像这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.gemini` 目录

除了项目设置文件外，项目的 `.gemini` 目录还可以包含与 Gemini CLI 操作相关的其他特定于项目的文件，例如：

- [自定义沙盒配置文件](#沙盒)（例如 `.gemini/sandbox-macos-custom.sb`、`.gemini/sandbox.Dockerfile`）。

### `settings.json` 中的可用设置：

- **`contextFileName`** (string or array of strings):
  - **说明：** 指定上下文文件的文件名（例如 `GEMINI.md`、`AGENTS.md`）。可以是单个文件名或接受的文件名列表。
  - **默认值：** `GEMINI.md`
  - **示例：** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (object):
  - **说明：** 覆盖 `/bug` 命令的默认 URL。
  - **默认值：** `"urlTemplate": "https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **属性：**
    - **`urlTemplate`** (string)：可以包含 `{title}` 和 `{info}` 占位符的 URL。
  - **示例：**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (object):
  - **说明：** 控制 @ 命令和文件发现工具的 git 感知文件过滤行为。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`** (boolean)：发现文件时是否遵循 .gitignore 模式。当设置为 `true` 时，git 忽略的文件（如 `node_modules/`、`dist/`、`.env`）会自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`** (boolean)：在提示中完成 @ 前缀时，是否在当前树下递归搜索文件名。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (array of strings):
  - **说明：** 允许您指定应提供给模型的核心工具名称列表。这可用于限制内置工具集。有关核心工具列表，请参阅[内置工具](../core/tools-api.md#内置工具)。您还可以为支持它的工具指定特定于命令的限制，例如 `ShellTool`。例如，`"coreTools": ["ShellTool(ls -l)"]` 将只允许执行 `ls -l` 命令。
  - **默认值：** Gemini 模型可使用所有工具。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`。

- **`excludeTools`** (array of strings):
  - **说明：** 允许您指定应从模型中排除的核心工具名称列表。同时在 `excludeTools` 和 `coreTools` 中列出的工具将被排除。您还可以为支持它的工具指定特定于命令的限制，例如 `ShellTool`。例如，`"excludeTools": ["ShellTool(rm -rf)"]` 将阻止 `rm -rf` 命令。
  - **默认值**：不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`。
  - **安全说明：** `run_shell_command` 的 `excludeTools` 中的特定于命令的限制基于简单的字符串匹配，可以轻松绕过。此功能**不是安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 显式选择可以执行的命令。

- **`allowMCPServers`** (array of strings):
  - **说明：** 允许您指定应提供给模型的 MCP 服务器名称列表。这可用于限制要连接的 MCP 服务器集。请注意，如果设置了 `--allowed-mcp-server-names`，则将忽略此设置。
  - **默认值：** Gemini 模型可使用所有 MCP 服务器。
  - **示例：** `"allowMCPServers": ["myPythonServer"]`。
  - **安全说明：** 这在 MCP 服务器名称上使用简单的字符串匹配，可以修改。如果您是希望阻止用户绕过此设置的系统管理员，请考虑在系统设置级别配置 `mcpServers`，以便用户无法配置自己的任何 MCP 服务器。这不应用作密不透风的安全机制。

- **`excludeMCPServers`** (array of strings):
  - **说明：** 允许您指定应从模型中排除的 MCP 服务器名称列表。同时在 `excludeMCPServers` 和 `allowMCPServers` 中列出的服务器将被排除。请注意，如果设置了 `--allowed-mcp-server-names`，则将忽略此设置。
  - **默认值**：不排除任何 MCP 服务器。
  - **示例：** `"excludeMCPServers": ["myNodeServer"]`。
  - **安全说明：** 这在 MCP 服务器名称上使用简单的字符串匹配，可以修改。如果您是希望阻止用户绕过此设置的系统管理员，请考虑在系统设置级别配置 `mcpServers`，以便用户无法配置自己的任何 MCP 服务器。这不应用作密不透风的安全机制。

- **`autoAccept`** (boolean):
  - **说明：** 控制 CLI 是否自动接受和执行被认为是安全的工具调用（例如，只读操作），而无需用户明确确认。如果设置为 `true`，CLI 将绕过被认为是安全的工具的确认提示。
  - **默认值：** `false`
  - **示例：** `"autoAccept": true`

- **`theme`** (string):
  - **说明：** 设置 Gemini CLI 的视觉[主题](./themes.md)。
  - **默认值：** `"Default"`
  - **示例：** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **说明：** 启用或禁用用于输入编辑的 vim 模式。启用后，输入区域支持 NORMAL 和 INSERT 模式的 vim 风格导航和编辑命令。vim 模式状态显示在页脚中，并在会话之间保持不变。
  - **默认值：** `false`
  - **示例：** `"vimMode": true`

- **`sandbox`** (boolean or string):
  - **说明：** 控制是否以及如何使用沙盒进行工具执行。如果设置为 `true`，Gemini CLI 将使用预构建的 `gemini-cli-sandbox` Docker 映像。有关更多信息，请参阅[沙盒](#沙盒)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **说明：** 定义用于从项目中发现工具的自定义 shell 命令。shell 命令必须在 `stdout` 上返回一个 JSON 数组的[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **说明：** 定义用于调用使用 `toolDiscoveryCommand` 发现的特定工具的自定义 shell 命令。shell 命令必须满足以下条件：
    - 它必须将函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中完全相同）作为第一个命令行参数。
    - 它必须在 `stdin` 上以 JSON 格式读取函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 它必须在 `stdout` 上以 JSON 格式返回函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (object):
  - **说明：** 配置与一个或多个模型上下文协议 (MCP) 服务器的连接，以发现和使用自定义工具。Gemini CLI 会尝试连接到每个配置的 MCP 服务器以发现可用的工具。如果多个 MCP 服务器公开具有相同名称的工具，则工具名称将以您在配置中定义的服务器别名为前缀（例如 `serverAlias__actualToolName`）以避免冲突。请注意，系统可能会从 MCP 工具定义中剥离某些模式属性以实现兼容性。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`** (object)：命名服务器的服务器参数。
      - `command` (string, required)：执行以启动 MCP 服务器的命令。
      - `args` (array of strings, optional)：传递给命令的参数。
      - `env` (object, optional)：为服务器进程设置的环境变量。
      - `cwd` (string, optional)：启动服务器的工作目录。
      - `timeout` (number, optional)：对此 MCP 服务器的请求超时（以毫秒为单位）。
      - `trust` (boolean, optional)：信任此服务器并绕过所有工具调用确认。
      - `includeTools` (array of strings, optional)：要从此 MCP 服务器包含的工具名称列表。指定后，只有此处列出的工具将从此服务器可用（白名单行为）。如果未指定，则默认启用服务器中的所有工具。
      - `excludeTools` (array of strings, optional)：要从此 MCP 服务器排除的工具名称列表。此处列出的工具将对模型不可用，即使它们由服务器公开。**注意：** `excludeTools` 优先于 `includeTools` - 如果一个工具同时在两个列表中，它将被排除。
  - **示例：**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"]
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`** (object):
  - **说明：** 配置检查点功能，该功能允许您保存和恢复对话和文件状态。有关更多详细信息，请参阅[检查点文档](../checkpointing.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`** (boolean)：当为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`** (string):
  - **说明：** 指定用于查看差异的首选编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`** (object)
  - **说明：** 配置 Gemini CLI 的日志记录和指标收集。有关更多信息，请参阅[遥测](../telemetry.md)。
  - **默认值：** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **属性：**
    - **`enabled`** (boolean)：遥测是否已启用。
    - **`target`** (string)：收集的遥测的目标。支持的值为 `local` 和 `gcp`。
    - **`otlpEndpoint`** (string)：OTLP 导出器的端点。
    - **`logPrompts`** (boolean)：是否在日志中包含用户提示的内容。
  - **示例：**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```
- **`usageStatisticsEnabled`** (boolean):
  - **说明：** 启用或禁用使用情况统计信息的收集。有关更多信息，请参阅[使用情况统计信息](#使用情况统计)。
  - **默认值：** `true`
  - **示例：**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (boolean):
  - **说明：** 在 CLI 界面中启用或禁用有用的提示。
  - **默认值：** `false`
  - **示例：**

    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean):
  - **说明：** 在 CLI 界面中启用或禁用启动横幅（ASCII 艺术徽标）。
  - **默认值：** `false`
  - **示例：**

    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (number):
  - **说明：** 设置会话的最大轮次。如果会话超过此限制，CLI 将停止处理并开始新的聊天。
  - **默认值：** `-1`（无限制）
  - **示例：**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (object):
  - **说明：** 启用或禁用工具输出的摘要。您可以使用 `tokenBudget` 设置指定摘要的令牌预算。
  - 注意：目前仅支持 `run_shell_command` 工具。
  - **默认值：** `{}`（默认禁用）
  - **示例：**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

### 示例 `settings.json`：

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  }
}
```

## Shell 历史记录

CLI 会保留您运行的 shell 命令的历史记录。为避免不同项目之间的冲突，此历史记录存储在用户主文件夹内的特定于项目的目录中。

- **位置：** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是从项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量和 `.env` 文件

环境变量是配置应用程序的常用方法，尤其适用于 API 密钥等敏感信息或可能在不同环境之间更改的设置。

CLI 会自动从 `.env` 文件加载环境变量。加载顺序为：

1.  当前工作目录中的 `.env` 文件。
2.  如果未找到，它会向上搜索父目录，直到找到 `.env` 文件或到达项目根目录（由 `.git` 文件夹标识）或主目录。
3.  如果仍未找到，它会查找 `~/.env`（在用户的主目录中）。

- **`GEMINI_API_KEY`** (Required):
  - 您的 Gemini API 的 API 密钥。
  - **操作的关键。** 如果没有它，CLI 将无法运行。
  - 在您的 shell 配置文件（例如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置此项。
- **`GEMINI_MODEL`**:
  - 指定要使用的默认 Gemini 模型。
  - 覆盖硬编码的默认值
  - 示例：`export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`**:
  - 您的 Google Cloud API 密钥。
  - 在快速模式下使用 Vertex AI 时需要。
  - 确保您具有必要的权限。
  - 示例：`export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`。
- **`GOOGLE_CLOUD_PROJECT`**:
  - 您的 Google Cloud 项目 ID。
  - 使用 Code Assist 或 Vertex AI 时需要。
  - 如果使用 Vertex AI，请确保您在此项目中具有必要的权限。
  - **Cloud Shell 注意：** 在 Cloud Shell 环境中运行时，此变量默认为分配给 Cloud Shell 用户的特殊项目。如果您在 Cloud Shell 的全局环境中设置了 `GOOGLE_CLOUD_PROJECT`，它将被此默认值覆盖。要在 Cloud Shell 中使用其他项目，您必须在 `.env` 文件中定义 `GOOGLE_CLOUD_PROJECT`。
  - 示例：`export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`。
- **`GOOGLE_APPLICATION_CREDENTIALS`** (string):
  - **说明：** 您的 Google 应用程序凭据 JSON 文件的路径。
  - **示例：** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - 您在 Google Cloud 中用于遥测的 Google Cloud 项目 ID
  - 示例：`export OLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`。
- **`GOOGLE_CLOUD_LOCATION`**:
  - 您的 Google Cloud 项目位置（例如 us-central1）。
  - 在非快速模式下使用 Vertex AI 时需要。
  - 示例：`export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`。
- **`GEMINI_SANDBOX`**:
  - `settings.json` 中 `sandbox` 设置的替代方案。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。
- **`SEATBELT_PROFILE`** (macOS specific):
  - 在 macOS 上切换 Seatbelt (`sandbox-exec`) 配置文件。
  - `permissive-open`：（默认）限制对项目文件夹（以及其他一些文件夹，请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。
  - `strict`：使用默认拒绝操作的严格配置文件。
  - `<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.gemini/` 目录中创建一个名为 `sandbox-macos-<profile_name>.sb` 的文件（例如 `my-project/.gemini/sandbox-macos-custom.sb`）。
- **`DEBUG` or `DEBUG_MODE`** (often used by underlying libraries or the CLI itself):
  - 设置为 `true` 或 `1` 以启用详细的调试日志记录，这有助于进行故障排除。
- **`NO_COLOR`**:
  - 设置为任何值以禁用 CLI 中的所有颜色输出。
- **`CLI_TITLE`**:
  - 设置为字符串以自定义 CLI 的标题。
- **`CODE_ASSIST_ENDPOINT`**:
  - 指定代码辅助服务器的端点。
  - 这对于开发和测试很有用。

## 命令行参数

直接在运行 CLI 时传递的参数可以覆盖该特定会话的其他配置。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - 指定此会话要使用的 Gemini 模型。
  - 示例：`npm start -- --model gemini-1.5-pro-latest`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - 用于将提示直接传递给命令。这会以非交互模式调用 Gemini CLI。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 使用提供的提示作为初始输入启动交互式会话。
  - 提示在交互式会话中处理，而不是在会话之前。
  - 不能在从 stdin 管道输入时使用。
  - 示例：`gemini -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - 为此会话启用沙盒模式。
- **`--sandbox-image`**:
  - 设置沙盒映像 URI。
- **`--debug`** (**`-d`**):
  - 为此会话启用调试模式，提供更详细的输出。
- **`--all-files`** (**`-a`**):
  - 如果设置，则递归地将当前目录中的所有文件作为提示的上下文包含在内。
- **`--help`** (or **`-h`**):
  - 显示有关命令行参数的帮助信息。
- **`--show-memory-usage`**:
  - 显示当前内存使用情况。
- **`--yolo`**:
  - 启用 YOLO 模式，该模式会自动批准所有工具调用。
- **`--telemetry`**:
  - 启用[遥测](../telemetry.md)。
- **`--telemetry-target`**:
  - 设置遥测目标。有关更多信息，请参阅[遥测](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**:
  - 设置遥测的 OTLP 端点。有关更多信息，请参阅[遥测](../telemetry.md)。
- **`--telemetry-log-prompts`**:
  - 启用遥测的提示日志记录。有关更多信息，请参阅[遥测](../telemetry.md)。
- **`--checkpointing`**:
  - 启用[检查点](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - 指定会话要使用的扩展列表。如果未提供，则使用所有可用的扩展。
  - 使用特殊术语 `gemini -e none` 禁用所有扩展。
  - 示例：`gemini -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 列出所有可用的扩展并退出。
- **`--proxy`**:
  - 设置 CLI 的代理。
  - 示例：`--proxy http://localhost:7890`。
- **`--include-directories <dir1,dir2,...>`**:
  - 在工作区中包含其他目录以支持多目录。
  - 可以多次指定或以逗号分隔的值指定。
  - 最多可以添加 5 个目录。
  - 示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`**:
  - 显示 CLI 的版本。

## 上下文文件（分层教学上下文）

虽然严格来说不是 CLI _行为_ 的配置，但上下文文件（默认为 `GEMINI.md`，但可通过 `contextFileName` 设置进行配置）对于配置提供给 Gemini 模型的 _教学上下文_（也称为“内存”）至关重要。这个强大的功能允许您向 AI 提供特定于项目的说明、编码风格指南或任何相关的背景信息，使其响应更贴合您的需求和准确性。CLI 包含 UI 元素，例如页脚中显示已加载上下文文件数量的指示器，以让您随时了解活动上下文。

- **目的：** 这些 Markdown 文件包含您希望 Gemini 模型在交互期间了解的说明、指南或上下文。该系统旨在分层管理此教学上下文。

### 示例上下文文件内容（例如 `GEMINI.md`）

这是一个 TypeScript 项目根目录中上下文文件的概念性示例：

```markdown
# 项目：我的超棒 TypeScript 库

## 一般说明：

- 生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新函数和类都有 JSDoc 注释。
- 在适当的情况下，优先使用函数式编程范例。
- 所有代码都应与 TypeScript 5.0 和 Node.js 20+ 兼容。

## 编码风格：

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如 `IUserService`）。
- 私有类成员应以下划线 (`_`) 为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`

- 此文件处理所有出站 API 请求。
- 添加新的 API 调用函数时，请确保它们包含强大的错误处理和日志记录。
- 对所有 GET 请求使用现有的 `fetchWithRetry` 实用程序。

## 关于依赖项：

- 除非绝对必要，否则避免引入新的外部依赖项。
- 如果需要新的依赖项，请说明原因。
```

此示例演示了如何提供常规项目上下文、特定编码约定，甚至有关特定文件或组件的注释。您的上下文文件越相关和精确，AI 就越能更好地为您提供帮助。强烈建议使用特定于项目的上下文文件来建立约定和上下文。

- **分层加载和优先级：** CLI 通过从多个位置加载上下文文件（例如 `GEMINI.md`）来实现复杂的分层内存系统。此列表中较低位置的文件（更具体）的内容通常会覆盖或补充较高位置的文件（更通用）的内容。可以使用 `/memory show` 命令检查确切的连接顺序和最终上下文。典型的加载顺序是：
  1.  **全局上下文文件：**
      - 位置：`~/.gemini/<contextFileName>`（例如，用户主目录中的 `~/.gemini/GEMINI.md`）。
      - 范围：为您的所有项目提供默认说明。
  2.  **项目根目录和祖先上下文文件：**
      - 位置：CLI 在当前工作目录中搜索配置的上下文文件，然后在每个父目录中向上搜索，直到项目根目录（由 `.git` 文件夹标识）或您的主目录。
      - 范围：提供与整个项目或其重要部分相关的上下文。
  3.  **子目录上下文文件（上下文/本地）：**
      - 位置：CLI 还会在当前工作目录 _下方_ 的子目录中扫描配置的上下文文件（遵循常见的忽略模式，如 `node_modules`、`.git` 等）。默认情况下，此搜索的广度限制为 200 个目录，但可以使用 `settings.json` 文件中的 `memoryDiscoveryMaxDirs` 字段进行配置。
      - 范围：允许与项目的特定组件、模块或子部分相关的非常具体的说明。
- **连接和 UI 指示：** 所有找到的上下文文件的内容都连接在一起（带有指示其来源和路径的分隔符），并作为系统提示的一部分提供给 Gemini 模型。CLI 页脚显示已加载上下文文件的计数，为您提供有关活动教学上下文的快速视觉提示。
- **导入内容：** 您可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件来模块化您的上下文文件。有关更多详细信息，请参阅[内存导入处理器文档](../core/memport.md)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制从所有配置的位置重新扫描和重新加载所有上下文文件。这将更新 AI 的教学上下文。
  - 使用 `/memory show` 显示当前加载的组合教学上下文，让您可以验证 AI 正在使用的层次结构和内容。
  - 有关 `/memory` 命令及其子命令（`show` 和 `refresh`）的完整详细信息，请参阅[命令文档](./commands.md#memory)。

通过理解和利用这些配置层以及上下文文件的分层性质，您可以有效地管理 AI 的内存，并根据您的特定需求和项目定制 Gemini CLI 的响应。

## 沙盒

Gemini CLI 可以在沙盒环境中执行可能不安全的操作（如 shell 命令和文件修改），以保护您的系统。

默认情况下禁用沙盒，但您可以通过几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `GEMINI_SANDBOX` 环境变量。
- 在 `--yolo` 模式下默认启用沙盒。

默认情况下，它使用预构建的 `gemini-cli-sandbox` Docker 映像。

对于特定于项目的沙盒需求，您可以在项目的根目录中创建自定义 Dockerfile `.gemini/sandbox.Dockerfile`。此 Dockerfile 可以基于基本沙盒映像：

```dockerfile
FROM gemini-cli-sandbox

# 在此处添加您的自定义依赖项或配置
# 例如：
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

当 `.gemini/sandbox.Dockerfile` 存在时，您可以在运行 Gemini CLI 时使用 `BUILD_SANDBOX` 环境变量来自动构建自定义沙盒映像：

```bash
BUILD_SANDBOX=1 gemini -s
```

## 使用情况统计

为了帮助我们改进 Gemini CLI，我们收集匿名的使用情况统计信息。这些数据有助于我们了解 CLI 的使用方式、识别常见问题并确定新功能的优先级。

**我们收集的内容：**

- **工具调用：** 我们记录调用的工具名称、它们是成功还是失败以及执行它们所需的时间。我们不收集传递给工具的参数或它们返回的任何数据。
- **API 请求：** 我们记录用于每个请求的 Gemini 模型、请求的持续时间以及它是否成功。我们不收集提示或响应的内容。
- **会话信息：** 我们收集有关 CLI 配置的信息，例如启用的工具和批准模式。

**我们不收集的内容：**

- **个人身份信息 (PII)：** 我们不收集任何个人信息，例如您的姓名、电子邮件地址或 API 密钥。
- **提示和响应内容：** 我们不记录您的提示内容或 Gemini 模型的响应。
- **文件内容：** 我们不记录 CLI 读取或写入的任何文件的内容。

**如何选择退出：**

您可以随时通过在 `settings.json` 文件中将 `usageStatisticsEnabled` 属性设置为 `false` 来选择退出使用情况统计信息收集：

```json
{
  "usageStatisticsEnabled": false
}
```