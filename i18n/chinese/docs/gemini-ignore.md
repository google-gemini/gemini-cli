[查看英文版](../../../docs/gemini-ignore.md)

# 忽略文件

本文档概述了 Gemini CLI 的 Gemini Ignore (`.geminiignore`) 功能。

Gemini CLI 能够自动忽略文件，类似于 `.gitignore`（由 Git 使用）和 `.aiexclude`（由 Gemini Code Assist 使用）。将路径添加到您的 `.geminiignore` 文件将从支持此功能的工具中排除它们，但它们仍对其他服务（例如 Git）可见。

## 工作原理

当您将路径添加到 `.geminiignore` 文件时，遵循此文件的工具将从其操作中排除匹配的文件和目录。例如，当您使用 [`read_many_files`](./tools/multi-file.md) 命令时，`.geminiignore` 文件中的任何路径都将被自动排除。

在大多数情况下，`.geminiignore` 遵循 `.gitignore` 文件的约定：

- 空白行和以 `#` 开头的行将被忽略。
- 支持标准 glob 模式（例如 `*`、`?` 和 `[]`）。
- 在末尾添加 `/` 将仅匹配目录。
- 在开头添加 `/` 会将路径锚定到相对于 `.geminiignore` 文件的位置。
- `!` 对模式取反。

您可以随时更新您的 `.geminiignore` 文件。要应用更改，您必须重新启动 Gemini CLI 会话。

## 如何使用 `.geminiignore`

要启用 `.geminiignore`：

1. 在项目目录的根目录中创建一个名为 `.geminiignore` 的文件。

要将文件或目录添加到 `.geminiignore`：

1. 打开您的 `.geminiignore` 文件。
2. 添加您要忽略的路径或文件，例如：`/archive/` 或 `apikeys.txt`。

### `.geminiignore` 示例

您可以使用 `.geminiignore` 忽略目录和文件：

```
# 排除您的 /packages/ 目录和所有子目录
/packages/

# 排除您的 apikeys.txt 文件
apikeys.txt
```

您可以在 `.geminiignore` 文件中使用 `*` 通配符：

```
# 排除所有 .md 文件
*.md
```

最后，您可以使用 `!` 从排除项中排除文件和目录：

```
# 排除除 README.md 之外的所有 .md 文件
*.md
!README.md
```

要从 `.geminiignore` 文件中删除路径，请删除相关行。