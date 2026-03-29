# IDE Integration

Gemini CLI can integrate with your IDE to provide a more seamless and
context-aware experience. This integration allows the CLI to understand your
workspace better and enables powerful features like native in-editor diffing.

There are two primary ways to integrate Gemini CLI with an IDE:

1.  **VS Code companion extension**: Install the "Gemini CLI Companion"
    extension on [Antigravity](https://antigravity.google),
    [Visual Studio Code](https://code.visualstudio.com/), or other VS Code
    compatible editors.
2.  **Agent Client Protocol (ACP)**: An open protocol for interoperability
    between AI coding agents and IDEs. This method is used for integrations with
    tools like JetBrains and Zed, which leverage the ACP Agent Registry for easy
    discovery and installation of compatible agents like Gemini CLI.

## VS Code companion extension

The **Gemini CLI Companion extension** grants Gemini CLI direct access to your
VS Code compatible IDEs and improves your experience by providing real-time
context such as open files, cursor positions, and text selection. The extension
also enables a native diffing interface so you can seamlessly review and apply
AI-generated code changes directly within your editor.

### Features

- **Workspace context:** The CLI automatically gains awareness of your workspace
  to provide more relevant and accurate responses. This context includes:
  - The **10 most recently accessed files** in your workspace.
  - Your active cursor position.
  - Any text you have selected (up to a 16KB limit; longer selections will be
    truncated).

- **Native diffing:** When Gemini suggests code modifications, you can view the
  changes directly within your IDE's native diff viewer. This lets you review,
  edit, and accept or reject the suggested changes seamlessly.

- **VS Code commands:** You can access Gemini CLI features directly from the VS
  Code Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`):
  - `Gemini CLI: Run`: Starts a new Gemini CLI session in the integrated
    terminal.
  - `Gemini CLI: Accept Diff`: Accepts the changes in the active diff editor.
  - `Gemini CLI: Close Diff Editor`: Rejects the changes and closes the active
    diff editor.
  - `Gemini CLI: View Third-Party Notices`: Displays the third-party notices for
    the extension.

### Installation and setup

There are three ways to set up the IDE integration:

#### 1. Automatic nudge (recommended)

When you run Gemini CLI inside a supported editor, it will automatically detect
your environment and prompt you to connect. Answering "Yes" will automatically
run the necessary setup, which includes installing the companion extension and
enabling the connection.

#### 2. Manual installation from CLI

If you previously dismissed the prompt or want to install the extension
manually, you can run the following command inside Gemini CLI:

```
/ide install
```

This will find the correct extension for your IDE and install it.

#### 3. Manual installation from a marketplace

You can also install the extension directly from a marketplace.

- **For Visual Studio Code:** Install from the
  [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=google.gemini-cli-vscode-ide-companion).
- **For VS Code forks:** To support forks of VS Code, the extension is also
  published on the
  [Open VSX Registry](https://open-vsx.org/extension/google/gemini-cli-vscode-ide-companion).
  Follow your editor's instructions for installing extensions from this
  registry.

<!-- prettier-ignore -->
> [!NOTE]
> The "Gemini CLI Companion" extension may appear towards the bottom of
> search results. If you don't see it immediately, try scrolling down or
> sorting by "Newly Published".
>
> After manually installing the extension, you must run `/ide enable` in the CLI
> to activate the integration.

### Usage

#### Enabling and disabling

You can control the IDE integration from within the CLI:

- To enable the connection to the IDE, run:
  ```
  /ide enable
  ```
- To disable the connection, run:
  ```
  /ide disable
  ```

When enabled, Gemini CLI will automatically attempt to connect to the IDE
companion extension.

#### Checking the status

To check the connection status and see the context the CLI has received from the
IDE, run:

```
/ide status
```

If connected, this command will show the IDE it's connected to and a list of
recently opened files it is aware of.

<!-- prettier-ignore -->
> [!NOTE]
> The file list is limited to 10 recently accessed files within your
> workspace and only includes local files on disk.

#### Working with diffs

When you ask Gemini to modify a file, it can open a diff view directly in your
editor.

**To accept a diff**, you can perform any of the following actions:

- Click the **checkmark icon** in the diff editor's title bar.
- Save the file (e.g., with `Cmd+S` or `Ctrl+S`).
- Open the Command Palette and run **Gemini CLI: Accept Diff**.
- Respond with `yes` in the CLI when prompted.

**To reject a diff**, you can:

- Click the **'x' icon** in the diff editor's title bar.
- Close the diff editor tab.
- Open the Command Palette and run **Gemini CLI: Close Diff Editor**.
- Respond with `no` in the CLI when prompted.

You can also **modify the suggested changes** directly in the diff view before
accepting them.

If you select ‘Allow for this session’ in the CLI, changes will no longer show
up in the IDE as they will be auto-accepted.

## Agent Client Protocol (ACP)

ACP is an open protocol that standardizes how AI coding agents communicate with
code editors and IDEs. It addresses the challenge of fragmented distribution,
where agents traditionally needed custom integrations for each client. With ACP,
developers can implement their agent once, and it becomes compatible with any
ACP-compliant editor.

For a comprehensive introduction to ACP, including its architecture and
benefits, refer to the official
[ACP Introduction](https://agentclientprotocol.com/get-started/introduction)
documentation.

### The ACP Agent Registry

Gemini CLI is officially available in the **ACP Agent Registry**. This allows
you to install and update Gemini CLI directly within supporting IDEs and
eliminates the need for manual downloads or IDE-specific extensions.

Using the registry ensures:

- **Ease of use**: Discover and install agents directly within your IDE
  settings.
- **Latest versions**: Ensures users always have access to the most up-to-date
  agent implementations.

For more details on how the registry works, visit the official
[ACP Agent Registry](https://agentclientprotocol.com/get-started/registry) page.
You can learn about how specific IDEs leverage this integration in the following
section.

### IDE-specific integration

Gemini CLI is an ACP-compatible agent available in the ACP Agent Registry.
Here’s how different IDEs leverage the ACP and the registry:

#### JetBrains IDEs

JetBrains IDEs (like IntelliJ IDEA, PyCharm, or GoLand) offer built-in registry
support, allowing users to find and install ACP-compatible agents directly.

For more details, refer to the official
[JetBrains AI Blog announcement](https://blog.jetbrains.com/ai/2026/01/acp-agent-registry/).

#### Zed

Zed, a modern code editor, also integrates with the ACP Agent Registry. This
allows Zed users to easily browse, install, and manage ACP agents.

Learn more about Zed's integration with the ACP Registry in their
[blog post](https://zed.dev/blog/acp-registry).

#### Other ACP-compatible IDEs

Any other IDE that supports the ACP Agent Registry can install Gemini CLI
directly through their in-built registry features.

## Using with sandboxing

If you are using Gemini CLI within a sandbox, please be aware of the following:

- **On macOS:** The IDE integration requires network access to communicate with
  the IDE companion extension. You must use a Seatbelt profile that allows
  network access.
- **In a Docker container:** If you run Gemini CLI inside a Docker (or Podman)
  container, the IDE integration can still connect to the VS Code extension
  running on your host machine. The CLI is configured to automatically find the
  IDE server on `host.docker.internal`. No special configuration is usually
  required, but you may need to ensure your Docker networking setup allows
  connections from the container to the host.

## Troubleshooting

### VS Code companion extension errors

#### Connection errors

- **Message:**
  `🔴 Disconnected: Failed to connect to IDE companion extension in [IDE Name]. Please ensure the extension is running. To install the extension, run /ide install.`
  - **Cause:** Gemini CLI could not find the necessary environment variables
    (`GEMINI_CLI_IDE_WORKSPACE_PATH` or `GEMINI_CLI_IDE_SERVER_PORT`) to connect
    to the IDE. This usually means the IDE companion extension is not running or
    did not initialize correctly.
  - **Solution:**
    1.  Make sure you have installed the **Gemini CLI Companion** extension in
        your IDE and that it is enabled.
    2.  Open a new terminal window in your IDE to ensure it picks up the correct
        environment.

- **Message:**
  `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Cause:** The connection to the IDE companion was lost.
  - **Solution:** Run `/ide enable` to try and reconnect. If the issue
    continues, open a new terminal window or restart your IDE.

#### Manual PID override

If automatic IDE detection fails, or if you are running Gemini CLI in a
standalone terminal and want to manually associate it with a specific IDE
instance, you can set the `GEMINI_CLI_IDE_PID` environment variable to the
process ID (PID) of your IDE.

**macOS/Linux**

```bash
export GEMINI_CLI_IDE_PID=12345
```

**Windows (PowerShell)**

```powershell
$env:GEMINI_CLI_IDE_PID=12345
```

When this variable is set, Gemini CLI will skip automatic detection and attempt
to connect using the provided PID.

#### Configuration errors

- **Message:**
  `🔴 Disconnected: Directory mismatch. Gemini CLI is running in a different location than the open workspace in [IDE Name]. Please run the CLI from one of the following directories: [List of directories]`
  - **Cause:** The CLI's current working directory is outside the workspace you
    have open in your IDE.
  - **Solution:** `cd` into the same directory that is open in your IDE and
    restart the CLI.

- **Message:**
  `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Cause:** You have no workspace open in your IDE.
  - **Solution:** Open a workspace in your IDE and restart the CLI.

#### General errors

- **Message:**
  `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: [List of IDEs]`
  - **Cause:** You are running Gemini CLI in a terminal or environment that is
    not a supported IDE.
  - **Solution:** Run Gemini CLI from the integrated terminal of a supported
    IDE, like Antigravity or VS Code.

- **Message:**
  `No installer is available for IDE. Please install Gemini CLI Companion extension manually from the marketplace.`
  - **Cause:** You ran `/ide install`, but the CLI does not have an automated
    installer for your specific IDE.
  - **Solution:** Open your IDE's extension marketplace, search for "Gemini CLI
    Companion", and
    [install it manually](#3-manual-installation-from-a-marketplace).

### ACP integration errors

For issues related to ACP integration, please refer to the debugging and
telemetry section in the [ACP Mode](../cli/acp-mode.md) documentation.
