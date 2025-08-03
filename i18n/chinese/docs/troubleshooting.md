# 疑难解答

<p align="center">
  简体中文 | <a href="../../../docs/troubleshooting.md">🌐 English</a>
</p>

本文档提供了在使用 Gemini CLI 时可能遇到的常见问题的解决方案。

## 一般问题

### 我收到 "无效的 API 密钥" 错误

- **原因**: 您的 API 密钥不正确或未设置。
- **解决方案**:
  1.  确保您已按照[身份验证](cli/authentication.md)文档中的说明正确配置了您的 API 密钥。
  2.  通过运行 `gemini auth` 检查您的凭据。

### 命令挂起或无响应

- **原因**: 可能是网络连接问题或后端服务暂时中断。
- **解决方案**:
  1.  检查您的互联网连接。
  2.  访问 [Google Cloud 状态仪表板](https://status.cloud.google.com/) 查看 Gemini 服务的任何已知中断。
  3.  尝试使用 `--debug` 标志运行命令以获取更多详细输出。

## 特定于工具的问题

### `run_shell_command` 失败

- **原因**: 该命令可能在沙箱环境中不受支持，或者它可能需要沙箱当前不支持的交互式输入。
- **解决方案**:
  1.  查看[沙箱](sandbox.md)文档，了解有关受支持命令和限制的更多信息。
  2.  尝试在没有沙箱的情况下运行命令（如果不推荐）。

## 联系支持

如果您的问题未在此处列出，或者您需要进一步的帮助，请[在我们的 GitHub 仓库中提交问题](https://github.com/google-gemini/gemini-cli/issues)。
