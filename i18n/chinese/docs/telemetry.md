# Gemini CLI 可观测性指南

<p align="center">
  简体中文 | <a href="../../../docs/telemetry.md">🌐 English</a>
</p>

遥测提供有关 Gemini CLI 性能、运行状况和使用情况的数据。通过启用它，您可以通过跟踪、指标和结构化日志来监控操作、调试问题和优化工具使用。

Gemini CLI 的遥测系统建立在 **[OpenTelemetry] (OTEL)** 标准之上，允许您将数据发送到任何兼容的后端。

[OpenTelemetry]: https://opentelemetry.io/

## 启用遥测

您可以通过多种方式启用遥测。配置主要通过 [`.gemini/settings.json` 文件](./cli/configuration.md)和环境变量进行管理，但 CLI 标志可以覆盖特定会话的这些设置。

### 优先级顺序

以下列表列出了应用遥测设置的优先级，列表中位置越高的项目优先级越高：

1.  **CLI 标志（用于 `gemini` 命令）：**
    - `--telemetry` / `--no-telemetry`：覆盖 `telemetry.enabled`。
    - `--telemetry-target <local|gcp>`：覆盖 `telemetry.target`。
    - `--telemetry-otlp-endpoint <URL>`：覆盖 `telemetry.otlpEndpoint`。
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`：覆盖 `telemetry.logPrompts`。
    - `--telemetry-outfile <path>`：将遥测输出重定向到文件。请参阅[导出到文件](#导出到文件)。

1.  **环境变量：**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`：覆盖 `telemetry.otlpEndpoint`。

1.  **工作区设置文件 (`.gemini/settings.json`)：** 此项目特定文件中 `telemetry` 对象的值。

1.  **用户设置文件 (`~/.gemini/settings.json`)：** 此全局用户文件中 `telemetry` 对象的值。

1.  **默认值：** 如果以上任何一项均未设置，则应用默认值。
    - `telemetry.enabled`：`false`
    - `telemetry.target`：`local`
    - `telemetry.otlpEndpoint`：`http://localhost:4317`
    - `telemetry.logPrompts`：`true`

**对于 `npm run telemetry -- --target=<gcp|local>` 脚本：**
此脚本的 `--target` 参数_仅_覆盖该脚本持续时间和目的的 `telemetry.target`（即选择要启动的收集器）。它不会永久更改您的 `settings.json`。该脚本将首先在 `settings.json` 中查找 `telemetry.target` 以用作其默认值。

### 示例设置

以下代码可以添加到您的工作区 (`.gemini/settings.json`) 或用户 (`~/.gemini/settings.json`) 设置中，以启用遥测并将输出发送到 Google Cloud：

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### 导出到文件

您可以将所有遥测数据导出到文件以供本地检查。

要启用文件导出，请使用 `--telemetry-outfile` 标志以及所需输出文件的路径。这必须使用 `--telemetry-target=local` 运行。

```bash
gemini --telemetry --telemetry-target=local --telemetry-outfile=/path/to/telemetry.log "your prompt"
```

## 运行 OTEL 收集器

OTEL 收集器是接收、处理和导出遥测数据的服务。
CLI 使用 OTLP/gRPC 协议发送数据。

在[文档][otel-config-docs]中了解有关 OTEL 导出器标准配置的更多信息。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### 本地

使用 `npm run telemetry -- --target=local` 命令来自动化设置本地遥测管道的过程，包括在您的 `.gemini/settings.json` 文件中配置必要的设置。底层脚本会安装 `otelcol-contrib`（OpenTelemetry 收集器）和 `jaeger`（用于查看跟踪的 Jaeger UI）。要使用它：

1.  **运行命令**：
    从存储库的根目录执行命令：

    ```bash
    npm run telemetry -- --target=local
    ```

    该脚本将：
    - 如果需要，下载 Jaeger 和 OTEL。
    - 启动本地 Jaeger 实例。
    - 启动配置为从 Gemini CLI 接收数据的 OTEL 收集器。
    - 在您的工作区设置中自动启用遥测。
    - 退出时，禁用遥测。

1.  **查看跟踪**：
    打开您的网络浏览器并导航到 **http://localhost:16686** 以访问 Jaeger UI。在这里，您可以检查 Gemini CLI 操作的详细跟踪。

1.  **检查日志和指标**：
    该脚本将 OTEL 收集器输出（包括日志和指标）重定向到 `~/.gemini/tmp/<projectHash>/otel/collector.log`。该脚本将提供用于查看的链接和用于在本地跟踪遥测数据（跟踪、指标、日志）的命令。

1.  **停止服务**：
    在运行脚本的终端中按 `Ctrl+C` 以停止 OTEL 收集器和 Jaeger 服务。

### Google Cloud

使用 `npm run telemetry -- --target=gcp` 命令来自动化设置将数据转发到您的 Google Cloud 项目的本地 OpenTelemetry 收集器的过程，包括在您的 `.gemini/settings.json` 文件中配置必要的设置。底层脚本会安装 `otelcol-contrib`。要使用它：

1.  **先决条件**：
    - 拥有一个 Google Cloud 项目 ID。
    - 导出 `GOOGLE_CLOUD_PROJECT` 环境变量以使其可用于 OTEL 收集器。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - 向 Google Cloud 进行身份验证（例如，运行 `gcloud auth application-default login` 或确保已设置 `GOOGLE_APPLICATION_CREDENTIALS`）。
    - 确保您的 Google Cloud 帐户/服务帐户具有必要的 IAM 角色：“Cloud Trace Agent”、“Monitoring Metric Writer”和“Logs Writer”。

1.  **运行命令**：
    从存储库的根目录执行命令：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    该脚本将：
    - 如果需要，下载 `otelcol-contrib` 二进制文件。
    - 启动配置为从 Gemini CLI 接收数据并将其导出到您指定的 Google Cloud 项目的 OTEL 收集器。
    - 在您的工作区设置 (`.gemini/settings.json`) 中自动启用遥测并禁用沙盒模式。
    - 提供直接链接以在您的 Google Cloud Console 中查看跟踪、指标和日志。
    - 退出时 (Ctrl+C)，它将尝试恢复您原来的遥测和沙盒设置。

1.  **运行 Gemini CLI：**
    在单独的终端中，运行您的 Gemini CLI 命令。这将生成收集器捕获的遥测数据。

1.  **在 Google Cloud 中查看遥测**：
    使用脚本提供的链接导航到 Google Cloud Console 并查看您的跟踪、指标和日志。

1.  **检查本地收集器日志**：
    该脚本将本地 OTEL 收集器输出重定向到 `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log`。该脚本提供用于查看的链接和用于在本地跟踪收集器日志的命令。

1.  **停止服务**：
    在运行脚本的终端中按 `Ctrl+C` 以停止 OTEL 收集器。

## 日志和指标参考

以下部分描述了为 Gemini CLI 生成的日志和指标的结构。

- `sessionId` 作为所有日志和指标的通用属性包含在内。

### 日志

日志是特定事件的带时间戳的记录。为 Gemini CLI 记录了以下事件：

- `gemini_cli.config`：此事件在启动时发生一次，包含 CLI 的配置。
  - **属性**：
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)

- `gemini_cli.user_prompt`：当用户提交提示时发生此事件。
  - **属性**：
    - `prompt_length`
    - `prompt`（如果 `log_prompts_enabled` 配置为 `false`，则排除此属性）
    - `auth_type`

- `gemini_cli.tool_call`：每次函数调用都会发生此事件。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: “accept”, “reject”, or “modify”, if applicable)
    - `error` (if applicable)
    - `error_type` (if applicable)

- `gemini_cli.api_request`：向 Gemini API 发出请求时发生此事件。
  - **属性**：
    - `model`
    - `request_text` (if applicable)

- `gemini_cli.api_error`：如果 API 请求失败，则发生此事件。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `gemini_cli.api_response`：收到来自 Gemini API 的响应时发生此事件。
  - **属性**：
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (if applicable)
    - `auth_type`

- `gemini_cli.flash_fallback`：当 Gemini CLI 切换到 flash 作为回退时发生此事件。
  - **属性**：
    - `auth_type`

- `gemini_cli.slash_command`：当用户执行斜杠命令时发生此事件。
  - **属性**：
    - `command` (string)
    - `subcommand` (string, if applicable)

### 指标

指标是行为随时间变化的数值度量。为 Gemini CLI 收集了以下指标：

- `gemini_cli.session.count` (Counter, Int)：每次 CLI 启动时递增一次。

- `gemini_cli.tool.call.count` (Counter, Int)：计算工具调用次数。
  - **属性**：
    - `function_name`
    - `success` (boolean)
    - `decision` (string: “accept”, “reject”, or “modify”, if applicable)

- `gemini_cli.tool.call.latency` (Histogram, ms)：测量工具调用延迟。
  - **属性**：
    - `function_name`
    - `decision` (string: “accept”, “reject”, or “modify”, if applicable)

- `gemini_cli.api.request.count` (Counter, Int)：计算所有 API 请求。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type` (if applicable)

- `gemini_cli.api.request.latency` (Histogram, ms)：测量 API 请求延迟。
  - **属性**：
    - `model`

- `gemini_cli.token.usage` (Counter, Int)：计算使用的令牌数。
  - **属性**：
    - `model`
    - `type` (string: “input”, “output”, “thought”, “cache”, or “tool”)

- `gemini_cli.file.operation.count` (Counter, Int)：计算文件操作次数。
  - **属性**：
    - `operation` (string: “create”, “read”, “update”)：文件操作的类型。
    - `lines` (Int, if applicable)：文件中的行数。
    - `mimetype` (string, if applicable)：文件的 mimetype。
    - `extension` (string, if applicable)：文件的文件扩展名。
