# IDE 集成

Gemini CLI 可以与您的 IDE 集成，以提供更无缝、更具上下文感知能力的体验。这种集成使 CLI 能够更好地理解您的工作区，并支持诸如原生编辑器内差异查看等强大功能。

目前，唯一支持的 IDE 是 [Visual Studio Code](https://code.visualstudio.com/) 以及其他支持 VS Code 扩展的编辑器。

## 功能

- **工作区上下文：** CLI 会自动感知您的工作区，以提供更相关、更准确的响应。此上下文包括：
  - 您工作区中**最近访问的 10 个文件**。
  - 您当前的游标位置。
  - 您选择的任何文本（最大 16KB；超出部分将被截断）。

- **原生差异查看：** 当 Gemini 建议代码修改时，您可以在 IDE 的原生差异查看器中直接查看更改。这使您可以无缝地审查、编辑、接受或拒绝建议的更改。

- **VS Code 命令：** 您可以直接从 VS Code 命令面板（`Cmd+Shift+P` 或 `Ctrl+Shift+P`）访问 Gemini CLI 功能：
  - `Gemini CLI: Run`：在集成终端中启动新的 Gemini CLI 会话。
  - `Gemini CLI: Accept Diff`：接受活动差异编辑器中的更改。
  - `Gemini CLI: Close Diff Editor`：拒绝更改并关闭活动差异编辑器。
  - `Gemini CLI: View Third-Party Notices`：显示扩展的第三方通知。

## 安装和设置

有三种设置 IDE 集成的方法：

### 1. 自动提示（推荐）

当您在受支持的编辑器中运行 Gemini CLI 时，它会自动检测您的环境并提示您连接。回答“是”将自动运行必要的设置，包括安装配套扩展并启用连接。

### 2. 从 CLI 手动安装

如果您之前关闭了提示或想手动安装扩展，可以在 Gemini CLI 中运行以下命令：

```
/ide install
```

这将找到适用于您 IDE 的正确扩展并进行安装。

### 3. 从市场手动安装

您也可以直接从市场安装扩展。

- **对于 Visual Studio Code：** 从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=google.gemini-cli-vscode-ide-companion) 安装。
- **对于 VS Code 分支：** 为了支持 VS Code 的分支，该扩展也发布在 [Open VSX Registry](https://open-vsx.org/extension/google/gemini-cli-vscode-ide-companion) 上。请按照您编辑器的说明从该注册表安装扩展。

通过任何安装方法后，建议打开一个新的终端窗口以确保集成正确激活。安装后，您可以使用 `/ide enable` 进行连接。

## 使用

### 启用和禁用

您可以从 CLI 内部控制 IDE 集成：

- 要启用与 IDE 的连接，请运行：
  ```
  /ide enable
  ```
- 要禁用连接，请运行：
  ```
  /ide disable
  ```

启用后，Gemini CLI 将自动尝试连接到 IDE 配套扩展。

### 检查状态

要检查连接状态并查看 CLI 从 IDE 接收到的上下文，请运行：

```
/ide status
```

如果已连接，此命令将显示连接到的 IDE 以及它所知道的最近打开的文件列表。

（注意：文件列表仅限于工作区中最近访问的 10 个文件，并且只包括磁盘上的本地文件。）

### 使用差异

当您要求 Gemini 修改文件时，它可以在您的编辑器中直接打开差异视图。

**要接受差异**，您可以执行以下任何操作：

- 单击差异编辑器标题栏中的**勾选图标**。
- 保存文件（例如，使用 `Cmd+S` 或 `Ctrl+S`）。
- 打开命令面板并运行 **Gemini CLI: Accept Diff**。
- 在 CLI 提示时回复 `yes`。

**要拒绝差异**，您可以：

- 单击差异编辑器标题栏中的 **'x' 图标**。
- 关闭差异编辑器选项卡。
- 打开命令面板并运行 **Gemini CLI: Close Diff Editor**。
- 在 CLI 提示时回复 `no`。

您还可以在接受更改之前直接在差异视图中**修改建议的更改**。

如果您在 CLI 中选择“是，始终允许”，则更改将不再在 IDE 中显示，因为它们将自动接受。

## 在沙盒中使用

如果您在沙盒中使用 Gemini CLI，请注意以下事项：

- **在 macOS 上：** IDE 集成需要网络访问才能与 IDE 配套扩展通信。您必须使用允许网络访问的 Seatbelt 配置文件。
- **在 Docker 容器中：** 如果您在 Docker（或 Podman）容器中运行 Gemini CLI，IDE 集成仍然可以连接到在您的主机上运行的 VS Code 扩展。CLI 配置为自动在 `host.docker.internal` 上找到 IDE 服务器。通常不需要特殊配置，但您可能需要确保您的 Docker 网络设置允许从容器到主机的连接。

## 故障排除

如果您遇到 IDE 集成问题，以下是一些常见的错误消息以及如何解决它们。

### 连接错误

- **消息：** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **原因：** Gemini CLI 无法找到必要的环境变量（`GEMINI_CLI_IDE_WORKSPACE_PATH` 或 `GEMINI_CLI_IDE_SERVER_PORT`）来连接到 IDE。这通常意味着 IDE 配套扩展未运行或未正确初始化。
  - **解决方案：**
    1.  确保您已在 IDE 中安装并启用了 **Gemini CLI Companion** 扩展。
    2.  在 IDE 中打开一个新的终端窗口，以确保它获取正确的环境。

- **消息：** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **原因：** 与 IDE 配套扩展的连接丢失。
  - **解决方案：** 运行 `/ide enable` 尝试重新连接。如果问题仍然存在，请打开一个新的终端窗口或重新启动您的 IDE。

### 配置错误

- **消息：** `🔴 Disconnected: Directory mismatch. Gemini CLI is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **原因：** CLI 的当前工作目录在您 IDE 中打开的文件夹或工作区之外。
  - **解决方案：** `cd` 到您 IDE 中打开的同一目录并重新启动 CLI。

- **消息：** `🔴 Disconnected: To use this feature, please open a single workspace folder in [IDE Name] and try again.`
  - **原因：** 您在 IDE 中打开了多个工作区文件夹，或者根本没有打开任何文件夹。IDE 集成需要单个根工作区文件夹才能正常运行。
  - **解决方案：** 在 IDE 中打开单个项目文件夹并重新启动 CLI。

### 一般错误

- **消息：** `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: [List of IDEs]`
  - **原因：** 您在不受支持的终端或环境中运行 Gemini CLI。
  - **解决方案：** 从受支持的 IDE（如 VS Code）的集成终端中运行 Gemini CLI。

- **消息：** `No installer is available for [IDE Name]. Please install the IDE companion manually from its marketplace.`
  - **原因：** 您运行了 `/ide install`，但 CLI 没有适用于您特定 IDE 的自动化安装程序。
  - **解决方案：** 打开您 IDE 的扩展市场，搜索“Gemini CLI Companion”，然后手动安装。
