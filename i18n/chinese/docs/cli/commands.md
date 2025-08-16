# 命令

<p align="center">
  简体中文 | <a href="../../../../docs/cli/commands.md">🌐 English</a>
</p>

Gemini CLI 支持多种内置命令，可帮助您管理会话、自定义界面和控制其行为。这些命令以正斜杠 (`/`)、at 符号 (`@`) 或感叹号 (`!`) 为前缀。

## 斜杠命令 (`/`)

斜杠命令提供对 CLI 本身的元级别控制。

### 内置命令

- **`/bug`**
  - **说明：** 提交有关 Gemini CLI 的问题。默认情况下，问题在 Gemini CLI 的 GitHub 存储库中提交。您在 `/bug` 后输入的字符串将成为所提交错误报告的标题。可以使用 `.gemini/settings.json` 文件中的 `bugCommand` 设置修改默认的 `/bug` 行为。

- **`/chat`**
  - **说明：** 保存和恢复对话历史记录，以便以交互方式分支对话状态，或从以后的会话中恢复以前的状态。
  - **子命令：**
    - **`save`**
      - **说明：** 保存当前对话历史记录。您必须添加一个 `<tag>` 来标识对话状态。
      - **用法：** `/chat save <tag>`
      - **关于检查点位置的详细信息：** 保存的聊天检查点的默认位置是：
        - Linux/macOS：`~/.config/google-generative-ai/checkpoints/`
        - Windows：`C:\Users\<YourUsername>\AppData\Roaming\google-generative-ai\checkpoints\`
        - 当您运行 `/chat list` 时，CLI 仅扫描这些特定目录以查找可用的检查点。
        - **注意：** 这些检查点用于手动保存和恢复对话状态。有关在文件修改之前创建的自动检查点，请参阅[检查点文档](../checkpointing.md)。
    - **`resume`**
      - **说明：** 从以前的保存中恢复对话。
      - **用法：** `/chat resume <tag>`
    - **`list`**
      - **说明：** 列出可用于聊天状态恢复的标签。

- **`/clear`**
  - **说明：** 清除终端屏幕，包括 CLI 中可见的会话历史记录和回滚。底层的会话数据（用于历史记录调用）可能会根据具体实现而保留，但可视显示将被清除。
  - **键盘快捷键：** 随时按 **Ctrl+L** 执行清除操作。

- **`/compress`**
  - **说明：** 用摘要替换整个聊天上下文。这样可以在保留已发生事件的高级摘要的同时节省用于未来任务的令牌。

- **`/copy`**
  - **说明：** 将 Gemini CLI 生成的最后一个输出复制到剪贴板，以便于共享或重复使用。

- **`/editor`**
  - **说明：** 打开一个对话框，用于选择支持的编辑器。

- **`/extensions`**
  - **说明：** 列出当前 Gemini CLI 会话中的所有活动扩展。请参阅 [Gemini CLI 扩展](../extension.md)。

- **`/help`** (或 **`/?`**)
  - **说明：** 显示有关 Gemini CLI 的帮助信息，包括可用命令及其用法。

- **`/mcp`**
  - **说明：** 列出配置的模型上下文协议 (MCP) 服务器、其连接状态、服务器详细信息和可用工具。
  - **子命令：**
    - **`desc`** 或 **`descriptions`**：
      - **说明：** 显示 MCP 服务器和工具的详细说明。
    - **`nodesc`** 或 **`nodescriptions`**：
      - **说明：** 隐藏工具说明，仅显示工具名称。
    - **`schema`**：
      - **说明：** 显示工具配置参数的完整 JSON 模式。
  - **键盘快捷键：** 随时按 **Ctrl+T** 在显示和隐藏工具说明之间切换。

- <a id="memory"></a>**`/memory`**
  - **说明：** 管理 AI 的教学上下文（从 `GEMINI.md` 文件加载的分层内存）。
  - **子命令：**
    - **`add`**：
      - **说明：** 将以下文本添加到 AI 的内存中。用法：`/memory add <text to remember>`
    - **`show`**：
      - **说明：** 显示从所有 `GEMINI.md` 文件加载的当前分层内存的完整连接内容。这使您可以检查提供给 Gemini 模型的教学上下文。
    - **`refresh`**：
      - **说明：** 从在配置位置（全局、项目/祖先和子目录）中找到的所有 `GEMINI.md` 文件重新加载分层教学内存。此命令使用最新的 `GEMINI.md` 内容更新模型。
    - **注意：** 有关 `GEMINI.md` 文件如何为分层内存做出贡献的更多详细信息，请参阅 [CLI 配置文档](./configuration.md#上下文文件分层教学上下文)。

- **`/restore`**
  - **说明：** 将项目文件恢复到执行工具之前的状态。这对于撤消工具所做的文件编辑特别有用。如果在没有工具调用 ID 的情况下运行，它将列出可从中恢复的可用检查点。
  - **用法：** `/restore [tool_call_id]`
  - **注意：** 仅当使用 `--checkpointing` 选项调用 CLI 或通过[设置](./configuration.md)进行配置时才可用。有关更多详细信息，请参阅[检查点文档](../checkpointing.md)。

- **`/stats`**
  - **说明：** 显示当前 Gemini CLI 会话的详细统计信息，包括令牌使用情况、缓存的令牌节省（如果可用）和会话持续时间。注意：仅当正在使用缓存的令牌时才显示缓存的令牌信息，这在 API 密钥身份验证中发生，但目前在 OAuth 身份验证中不发生。

- [**`/theme`**](./themes.md)
  - **说明：** 打开一个对话框，让您更改 Gemini CLI 的视觉主题。

- **`/auth`**
  - **说明：** 打开一个对话框，让您更改身份验证方法。

- **`/about`**
  - **说明：** 显示版本信息。提交问题时请分享此信息。

- [**`/tools`**](../tools/index.md)
  - **说明：** 显示 Gemini CLI 中当前可用的工具列表。
  - **子命令：**
    - **`desc`** 或 **`descriptions`**：
      - **说明：** 显示每个工具的详细说明，包括每个工具的名称及其提供给模型的完整说明。
    - **`nodesc`** 或 **`nodescriptions`**：
      - **说明：** 隐藏工具说明，仅显示工具名称。

- **`/privacy`**
  - **说明：** 显示隐私声明，并允许用户选择是否同意为服务改进目的收集其数据。

- **`/quit`** (或 **`/exit`**)
  - **说明：** 退出 Gemini CLI。

- **`/vim`**
  - **说明：** 打开或关闭 vim 模式。启用 vim 模式后，输入区域支持 NORMAL 和 INSERT 模式下的 vim 风格导航和编辑命令。
  - **功能：**
    - **NORMAL 模式：** 使用 `h`、`j`、`k`、`l` 导航；使用 `w`、`b`、`e` 按单词跳转；使用 `0`、`$`、`^` 转到行首/行尾；使用 `G`（或 `gg` 表示第一行）转到特定行
    - **INSERT 模式：** 标准文本输入，按 escape 返回 NORMAL 模式
    - **编辑命令：** 使用 `x` 删除，使用 `c` 更改，使用 `i`、`a`、`o`、`O` 插入；复杂操作，如 `dd`、`cc`、`dw`、`cw`
    - **计数支持：** 在命令前加上数字（例如 `3h`、`5w`、`10G`）
    - **重复上一个命令：** 使用 `.` 重复上一个编辑操作
    - **持久设置：** Vim 模式首选项保存到 `~/.gemini/settings.json` 并在会话之间恢复
  - **状态指示器：** 启用后，在页脚中显示 `[NORMAL]` 或 `[INSERT]`

- **`/init`**
  - **说明：** 为了帮助用户轻松创建 `GEMINI.md` 文件，此命令会分析当前目录并生成一个量身定制的上下文文件，使他们可以更轻松地向 Gemini 代理提供特定于项目的说明。

### 自定义命令

有关快速入门，请参阅下面的[示例](#示例一个纯函数重构命令)。

自定义命令允许您在 Gemini CLI 中将您喜欢或最常用的提示保存和重用为个人快捷方式。您可以创建特定于单个项目的命令，也可以创建在所有项目中全局可用的命令，从而简化您的工作流程并确保一致性。

#### 文件位置和优先级

Gemini CLI 从两个位置发现命令，并按特定顺序加载：

1.  **用户命令（全局）：** 位于 `~/.gemini/commands/` 中。这些命令在您正在处理的任何项目中都可用。
2.  **项目命令（本地）：** 位于 `<your-project-root>/.gemini/commands/` 中。这些命令特定于当前项目，可以检入版本控制以与您的团队共享。

如果项目目录中的命令与用户目录中的命令同名，则**始终使用项目命令。** 这允许项目使用特定于项目的版本覆盖全局命令。

#### 命名和命名空间

命令的名称由其相对于其 `commands` 目录的文件路径确定。子目录用于创建命名空间命令，路径分隔符（`/` 或 `\`）将转换为冒号 (`:`)。

- `~/.gemini/commands/test.toml` 处的文件成为 `/test` 命令。
- `<project>/.gemini/commands/git/commit.toml` 处的文件成为命名空间命令 `/git:commit`。

#### TOML 文件格式 (v1)

您的命令定义文件必须以 TOML 格式编写，并使用 `.toml` 文件扩展名。

##### 必填字段

- `prompt` (String)：执行命令时将发送到 Gemini 模型的提示。可以是单行或多行字符串。

##### 可选字段

- `description` (String)：对命令功能的简要单行描述。此文本将显示在 `/help` 菜单中您的命令旁边。**如果省略此字段，将从文件名生成通用描述。**

#### 处理参数

自定义命令支持两种强大、低摩擦的参数处理方法。CLI 会根据命令 `prompt` 的内容自动选择正确的方法。

##### 1. 使用 `{{args}}` 的简写注入

如果您的 `prompt` 包含特殊的占位符 `{{args}}`，CLI 会将该确切的占位符替换为用户在命令名称后键入的所有文本。这非常适合于需要将用户输入注入到较大提示模板中特定位置的简单、确定性命令。

**示例 (`git/fix.toml`)：**

```toml
# In: ~/.gemini/commands/git/fix.toml
# Invoked via: /git:fix "Button is misaligned on mobile"

description = "Generates a fix for a given GitHub issue."
prompt = "Please analyze the staged git changes and provide a code fix for the issue described here: {{args}}."
```

模型将收到最终提示：`Please analyze the staged git changes and provide a code fix for the issue described here: "Button is misaligned on mobile".`

##### 2. 默认参数处理

如果您的 `prompt` **不**包含特殊的占位符 `{{args}}`，CLI 将使用默认行为来处理参数。

如果您向命令提供参数（例如 `/mycommand arg1`），CLI 会将您键入的完整命令附加到提示的末尾，并用两个换行符分隔。这使模型能够看到原始指令和您刚刚提供的特定参数。

如果您**不**提供任何参数（例如 `/mycommand`），则提示将完全按原样发送到模型，不附加任何内容。

**示例 (`changelog.toml`)：**

此示例演示了如何通过定义模型的角色、解释在哪里可以找到用户的输入以及指定预期的格式和行为来创建强大的命令。

```toml
# In: <project>/.gemini/commands/changelog.toml
# Invoked via: /changelog 1.2.0 added "Support for default argument parsing."

description = "Adds a new entry to the project's CHANGELOG.md file."
prompt = """
# Task: Update Changelog

You are an expert maintainer of this software project. A user has invoked a command to add a new entry to the changelog.

**The user's raw command is appended below your instructions.**

Your task is to parse the `<version>`, `<change_type>`, and `<message>` from their input and use the `write_file` tool to correctly update the `CHANGELOG.md` file.

## Expected Format
The command follows this format: `/changelog <version> <type> <message>`
- `<type>` must be one of: "added", "changed", "fixed", "removed".

## Behavior
1. Read the `CHANGELOG.md` file.
2. Find the section for the specified `<version>`.
3. Add the `<message>` under the correct `<type>` heading.
4. If the version or type section doesn't exist, create it.
5. Adhere strictly to the "Keep a Changelog" format.
"""
```

当您运行 `/changelog 1.2.0 added "New feature"` 时，发送到模型的最终文本将是原始提示，后跟两个换行符和您键入的命令。

##### 3. 使用 `!{...}` 执行 Shell 命令

您可以通过直接在 `prompt` 中执行 shell 命令并注入其输出来使您的命令动态化。这非常适合从本地环境收集上下文，例如读取文件内容或检查 Git 的状态。

当自定义命令尝试执行 shell 命令时，Gemini CLI 现在会在继续之前提示您进行确认。这是一种安全措施，以确保只有预期的命令才能运行。

**工作原理：**

1.  **注入命令：** 在 `prompt` 中使用 `!{...}` 语法来指定应在何处运行命令并注入其输出。
2.  **确认执行：** 当您运行命令时，将出现一个对话框，其中列出提示要执行的 shell 命令。
3.  **授予权限：** 您可以选择：
    - **允许一次：** 命令将运行一次。
    - **在此会话中始终允许：** 命令将被添加到当前 CLI 会话的临时允许列表中，并且不会再次需要确认。
    - **否：** 取消 shell 命令的执行。

CLI 仍然遵循全局 `excludeTools` 和 `coreTools` 设置。如果命令在您的配置中被明确禁止，则该命令将被阻止，而不会出现确认提示。

**示例 (`git/commit.toml`)：**

此命令获取暂存的 git diff 并使用它来要求模型编写提交消息。

````toml
# In: <project>/.gemini/commands/git/commit.toml
# Invoked via: /git:commit

description = "Generates a Git commit message based on staged changes."

# The prompt uses !{...} to execute the command and inject its output.
prompt = """
Please generate a Conventional Commit message based on the following git diff:

```diff
!{git diff --staged}
````

"""

````

当您运行 `/git:commit` 时，CLI 首先执行 `git diff --staged`，然后在将最终的完整提示发送到模型之前，将 `!{git diff --staged}` 替换为该命令的输出。

---

#### 示例：一个“纯函数”重构命令

让我们创建一个全局命令，要求模型重构一段代码。

**1. 创建文件和目录：**

首先，确保用户命令目录存在，然后为组织创建一个 `refactor` 子目录和最终的 TOML 文件。

```bash
mkdir -p ~/.gemini/commands/refactor
touch ~/.gemini/commands/refactor/pure.toml
````

**2. 将内容添加到文件中：**

在您的编辑器中打开 `~/.gemini/commands/refactor/pure.toml` 并添加以下内容。为了最佳实践，我们包含了可选的 `description`。

```toml
# In: ~/.gemini/commands/refactor/pure.toml
# This command will be invoked via: /refactor:pure

description = "Asks the model to refactor the current context into a pure function."

prompt = """
Please analyze the code I've provided in the current context.
Refactor it into a pure function.

Your response should include:
1. The refactored, pure function code block.
2. A brief explanation of the key changes you made and why they contribute to purity.
"""
```

**3. 运行命令：**

就是这样！您现在可以在 CLI 中运行您的命令。首先，您可以将文件添加到上下文中，然后调用您的命令：

```
> @my-messy-function.js
> /refactor:pure
```

然后，Gemini CLI 将执行您在 TOML 文件中定义的多行提示。

## At 命令 (`@`)

At 命令用于将文件或目录的内容作为 Gemini 提示的一部分包含在内。这些命令包括 git 感知过滤。

- **`@<path_to_file_or_directory>`**
  - **说明：** 将指定文件或文件的内容注入到当前提示中。这对于询问有关特定代码、文本或文件集合的问题很有用。
  - **示例：**
    - `@path/to/your/file.txt Explain this text.`
    - `@src/my_project/ Summarize the code in this directory.`
    - `What is this file about? @README.md`
  - **详细信息：**
    - 如果提供了单个文件的路径，则读取该文件的内容。
    - 如果提供了目录的路径，则该命令会尝试读取该目录和任何子目录中文件的内容。
    - 路径中的空格应使用反斜杠进行转义（例如 `@My\ Documents/file.txt`）。
    - 该命令在内部使用 `read_many_files` 工具。在发送到 Gemini 模型之前，会获取内容并将其插入到您的查询中。
    - **Git 感知过滤：** 默认情况下，会排除 git 忽略的文件（如 `node_modules/`、`dist/`、`.env`、`.git/`）。可以通过 `fileFiltering` 设置更改此行为。
    - **文件类型：** 该命令适用于基于文本的文件。虽然它可能会尝试读取任何文件，但二进制文件或非常大的文件可能会被底层的 `read_many_files` 工具跳过或截断，以确保性能和相关性。该工具会指示是否跳过了文件。
  - **输出：** CLI 将显示一条工具调用消息，指示已使用 `read_many_files`，以及一条详细说明状态和已处理路径的消息。

- **`@` (单独的 at 符号)**
  - **说明：** 如果您键入一个单独的 `@` 符号而没有路径，则查询将按原样传递给 Gemini 模型。如果您在提示中专门讨论 `@` 符号，这可能很有用。

### `@` 命令的错误处理

- 如果在 `@` 之后指定的路径未找到或无效，将显示一条错误消息，并且查询可能不会发送到 Gemini 模型，或者将在没有文件内容的情况下发送。
- 如果 `read_many_files` 工具遇到错误（例如权限问题），也将报告此错误。

## Shell 模式和直通命令 (`!`)

`!` 前缀可让您直接从 Gemini CLI 内部与系统的 shell 进行交互。

- **`!<shell_command>`**
  - **说明：** 使用 Linux/macOS 上的 `bash` 或 Windows 上的 `cmd.exe` 执行给定的 `<shell_command>`。命令的任何输出或错误都显示在终端中。
  - **示例：**
    - `!ls -la`（执行 `ls -la` 并返回到 Gemini CLI）
    - `!git status`（执行 `git status` 并返回到 Gemini CLI）

- **`!` (切换 shell 模式)**
  - **说明：** 单独键入 `!` 可切换 shell 模式。
    - **进入 shell 模式：**
      - 激活后，shell 模式使用不同的颜色和“Shell 模式指示器”。
      - 在 shell 模式下，您键入的文本将直接解释为 shell 命令。
    - **退出 shell 模式：**
      - 退出后，UI 将恢复其标准外观并恢复正常的 Gemini CLI 行为。

- **所有 `!` 用法的注意事项：** 您在 shell 模式下执行的命令具有与直接在终端中运行它们相同的权限和影响。

- **环境变量：** 当通过 `!` 或在 shell 模式下执行命令时，`GEMINI_CLI=1` 环境变量会在子进程的环境中设置。这允许脚本或工具检测它们是否在 Gemini CLI 中运行。
