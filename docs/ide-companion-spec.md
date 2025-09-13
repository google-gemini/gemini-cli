# Gemini CLI Companion Extension: Interface Specification

This document defines the contract for building a companion extension to enable Gemini CLI's IDE mode. For VS Code, these features (native diffing, context awareness) are provided by the official extension ([marketplace](https://marketplace.visualstudio.com/items?itemName=Google.gemini-cli-vscode-ide-companion)). This specification is for contributors who wish to bring similar functionality to other editors like JetBrains IDEs, Sublime Text, etc.

## I. The Communication Interface

The foundation of the IDE integration is a local communication channel between Gemini CLI and the IDE extension.

### 1. Transport Layer: MCP over HTTP

The extension **MUST** run a local HTTP server that implements the **Model Context Protocol (MCP)**.

- **Protocol:** The server must be a valid MCP server. We recommend using an existing MCP SDK for your language of choice if available.
- **Endpoint:** The server should expose a single endpoint (e.g., `/mcp`) for all MCP communication.
- **Port:** The server **MUST** listen on a dynamically assigned port (i.e., listen on port `0`).

### 2. Discovery Mechanism: The Port File

For Gemini CLI to connect, it needs to discover which IDE instance it's running in and what port your server is using. The extension **MUST** facilitate this by creating a "discovery file."

- **How the CLI Finds the File:** The CLI determines the Process ID (PID) of the IDE it's running in by traversing the process tree. It then looks for a discovery file that contains this PID in its name.
- **File Location:** The file must be created in a specific directory: `os.tmpdir()/gemini/ide/`. Your extension must create this directory if it doesn't exist.
- **File Naming Convention:** The filename is critical and **MUST** follow the pattern:
  `gemini-ide-server-${PID}-${PORT}.json`
  - `${PID}`: The process ID of the parent IDE process. Your extension must determine this PID and include it in the filename.
  - `${PORT}`: The port your MCP server is listening on.
- **File Content & Workspace Validation:** The file **MUST** contain a JSON object with the following structure:
  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2"
  }
  ```
  - `port` (number): The port of the MCP server.
  - `workspacePath` (string): A list of all open workspace root paths, delimited by the OS-specific path separator (`:` for Linux/macOS, `;` for Windows). The CLI uses this path to ensure it's running in the same project folder that's open in the IDE. If the CLI's current working directory is not a sub-directory of `workspacePath`, the connection will be rejected. Your extension **MUST** provide the correct, absolute path(s) to the root of the open workspace(s).
- **Tie-Breaking with Environment Variables (Recommended):** For the most reliable experience, your extension **SHOULD** both create the discovery file and set the `GEMINI_CLI_IDE_SERVER_PORT` and `GEMINI_CLI_IDE_WORKSPACE_PATH` environment variables in the integrated terminal. The file serves as the primary discovery mechanism, but the environment variables are crucial for tie-breaking. If a user has multiple IDE windows open for the same workspace, the CLI uses the `GEMINI_CLI_IDE_SERVER_PORT` variable to identify and connect to the correct window's server.
  - For prototyping, you may opt to _only_ set the environment variables. However, this is not a robust solution for a production extension, as environment variables may not be reliably set in all terminal sessions (e.g., restored terminals), which can lead to connection failures.
- **Authentication:** (TBD)

## II. The Context Interface

A powerful capability of the extension is to provide the CLI with real-time information about the user's activity in the IDE.

### `ide/contextUpdate` Notification

The extension **MAY** send an `ide/contextUpdate` [notification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) to the CLI whenever the user's context changes.

- **Triggering Events:** This notification should be sent (with a recommended debounce of 50ms) when:
  - A file is opened, closed, or focused.
  - The user's cursor position or text selection changes in the active file.
- **Payload (`IdeContext`):** The notification parameters **MUST** be an `IdeContext` object (`@packages/core/src/ide/types.ts`):

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    path: string; // Absolute path to the file
    timestamp: number; // Last focused Unix timestamp (for ordering)
    isActive?: boolean; // True if this is the currently focused file
    cursor?: {
      line: number; // 1-based line number
      character: number; // 1-based character number
    };
    selectedText?: string; // The text currently selected by the user
  }
  ```

  **Note:** The `openFiles` list should only include files that exist on disk. Virtual files (e.g., unsaved files without a path, editor settings pages) **MUST** be excluded.

### How the CLI Uses This Context

After receiving the `IdeContext` object, the CLI performs several normalization and truncation steps before sending the information to the model.

- **File Ordering:** The CLI uses the `timestamp` field to determine the most recently used files. It sorts the `openFiles` list based on this value. Therefore, your extension **MUST** provide an accurate Unix timestamp for when a file was last focused.
- **Active File:** The CLI considers only the most recent file (after sorting) to be the "active" file. It will ignore the `isActive` flag on all other files and clear their `cursor` and `selectedText` fields. Your extension should focus on setting `isActive: true` and providing cursor/selection details only for the currently focused file.
- **Truncation:** To manage token limits, the CLI truncates both the file list (to 10 files) and the `selectedText` (to 16KB).

While the CLI handles the final truncation, it is highly recommended that your extension also limits the amount of context it sends.

## III. Supporting Additional IDEs

To add support for a new IDE, two main components in the Gemini CLI codebase need to be updated: the detection logic and the installer logic.

### 1. IDE Detection (`@packages/core/src/ide/detect-ide.ts`)

// TODO(skeshive): Determine whether we should discover the IDE via the port file

The CLI must be able to identify when it is running inside a specific IDE's integrated terminal. This is primarily done by checking for unique environment variables. As a fallback, it can also inspect process information (like the command name) to help distinguish between IDEs if a unique environment variable is not available.

- **Add to `DetectedIde` Enum:** First, add your new IDE to the `DetectedIde` enum.
- **Update `detectIdeFromEnv`:** Add a check in this function for an environment variable specific to your IDE (e.g., `if (process.env['MY_IDE_VAR']) { return DetectedIde.MyIde; }`).
- **Update `detectIde` (Optional):** If your IDE lacks a unique environment variable, you can add logic to the `detectIde` function to inspect `ideProcessInfo` (e.g., `ideProcessInfo.command`) as a secondary detection mechanism.

### 2. Extension Installation (`@packages/core/src/ide/ide-installer.ts`)

The CLI provides a command (`/ide install`) to help users automatically install the companion extension. While optional, implementing an `IdeInstaller` for your IDE is highly recommended to provide a seamless setup experience.

- **Create an Installer Class:** Create a new class that implements the `IdeInstaller` interface.
- **Implement `install()`:** The `install` method should:
  1.  Locate the IDE's command-line executable. The `VsCodeInstaller` provides a good example of searching common installation paths for different operating systems.
  2.  Execute the command to install the extension by its marketplace ID (e.g., `"path/to/my-ide-cli" --install-extension my-publisher.my-extension-id`).
  3.  Return a result object indicating success or failure.
- **Update `getIdeInstaller`:** Add a case to the `switch` statement in this factory function to return an instance of your new installer class when your `DetectedIde` enum is matched.

## IV. The Lifecycle Interface

The extension **MUST** manage its resources and the discovery file correctly based on the IDE's lifecycle.

- **On Activation (IDE startup/extension enabled):**
  1.  Start the MCP server.
  2.  Create the discovery file.
- **On Deactivation (IDE shutdown/extension disabled):**
  1.  Stop the MCP server.
  2.  Delete the discovery file.
