# Gemini CLI Core: Tools API

The Gemini CLI core (`packages/core`) features a robust system for defining, registering, and executing tools. These tools extend the capabilities of the Gemini model, allowing it to interact with the local environment, fetch web content, and perform various actions beyond simple text generation.

## Core Concepts

- **Tool (`tools.ts`):** An interface and base class (`BaseTool`) that defines the contract for all tools. Each tool must have:
  - `name`: A unique internal name (used in API calls to Gemini).
  - `displayName`: A user-friendly name.
  - `description`: A clear explanation of what the tool does, which is provided to the Gemini model.
  - `parameterSchema`: A JSON schema defining the parameters that the tool accepts. This is crucial for the Gemini model to understand how to call the tool correctly.
  - `validateToolParams()`: A method to validate incoming parameters.
  - `getDescription()`: A method to provide a human-readable description of what the tool will do with specific parameters before execution.
  - `shouldConfirmExecute()`: A method to determine if user confirmation is required before execution (e.g., for potentially destructive operations).
  - `execute()`: The core method that performs the tool's action and returns a `ToolResult`.

- **`ToolResult` (`tools.ts`):** An interface defining the structure of a tool's execution outcome:
  - `llmContent`: The factual content to be included in the history sent back to the LLM for context. This can be a simple string or a `PartListUnion` (an array of `Part` objects and strings) for rich content.
  - `returnDisplay`: A user-friendly string (often Markdown) or a special object (like `FileDiff`) for display in the CLI.

- **Returning Rich Content:** Tools are not limited to returning simple text. The `llmContent` can be a `PartListUnion`, which is an array that can contain a mix of `Part` objects (for images, audio, etc.) and `string`s. This allows a single tool execution to return multiple pieces of rich content.

- **Tool Registry (`tool-registry.ts`):** A class (`ToolRegistry`) responsible for:
  - **Registering Tools:** Holding a collection of all available built-in tools (e.g., `ReadFileTool`, `ShellTool`).
  - **Discovering Tools:** It can also discover tools dynamically:
    - **Command-based Discovery:** If `tools.discoveryCommand` is configured in settings, this command is executed. It's expected to output JSON describing custom tools, which are then registered as `DiscoveredTool` instances.
    - **MCP-based Discovery:** If `mcp.serverCommand` is configured, the registry can connect to a Model Context Protocol (MCP) server to list and register tools (`DiscoveredMCPTool`).
  - **Providing Schemas:** Exposing the `FunctionDeclaration` schemas of all registered tools to the Gemini model, so it knows what tools are available and how to use them.
  - **Retrieving Tools:** Allowing the core to get a specific tool by name for execution.

## Built-in Tools

The core comes with a suite of pre-defined tools, typically found in `packages/core/src/tools/`. These include:

- **File System Tools:**
  - `LSTool` (`ls.ts`): Lists directory contents.
  - `ReadFileTool` (`read-file.ts`): Reads the content of a single file. It takes an `absolute_path` parameter, which must be an absolute path.
  - `WriteFileTool` (`write-file.ts`): Writes content to a file.
  - `GrepTool` (`grep.ts`): Searches for patterns in files.
  - `GlobTool` (`glob.ts`): Finds files matching glob patterns.
  - `EditTool` (`edit.ts`): Performs in-place modifications to files (often requiring confirmation).
  - `ReadManyFilesTool` (`read-many-files.ts`): Reads and concatenates content from multiple files or glob patterns (used by the `@` command in CLI).
- **Execution Tools:**
  - `ShellTool` (`shell.ts`): Executes arbitrary shell commands (requires careful sandboxing and user confirmation).
- **Web Tools:**
  - `WebFetchTool` (`web-fetch.ts`): Fetches content from a URL.
  - `WebSearchTool` (`web-search.ts`): Performs a web search.
- **Memory Tools:**
  - `MemoryTool` (`memoryTool.ts`): Interacts with the AI's memory.

Each of these tools extends `BaseTool` and implements the required methods for its specific functionality.

## Tool Execution Flow

1.  **Model Request:** The Gemini model, based on the user's prompt and the provided tool schemas, decides to use a tool and returns a `FunctionCall` part in its response, specifying the tool name and arguments.
2.  **Core Receives Request:** The core parses this `FunctionCall`.
3.  **Tool Retrieval:** It looks up the requested tool in the `ToolRegistry`.
4.  **Parameter Validation:** The tool's `validateToolParams()` method is called.
5.  **Confirmation (if needed):**
    - The tool's `shouldConfirmExecute()` method is called.
    - If it returns details for confirmation, the core communicates this back to the CLI, which prompts the user.
    - The user's decision (e.g., proceed, cancel) is sent back to the core.
6.  **Execution:** If validated and confirmed (or if no confirmation is needed), the core calls the tool's `execute()` method with the provided arguments and an `AbortSignal` (for potential cancellation).
7.  **Result Processing:** The `ToolResult` from `execute()` is received by the core.
8.  **Response to Model:** The `llmContent` from the `ToolResult` is packaged as a `FunctionResponse` and sent back to the Gemini model so it can continue generating a user-facing response.
9.  **Display to User:** The `returnDisplay` from the `ToolResult` is sent to the CLI to show the user what the tool did.

## Extending with Custom Tools

While direct programmatic registration of new tools by users isn't explicitly detailed as a primary workflow in the provided files for typical end-users, the architecture supports extension through:

- **Command-based Discovery:** Advanced users or project administrators can define a `tools.discoveryCommand` in `settings.json`. This command, when run by the Gemini CLI core, should output a JSON array of `FunctionDeclaration` objects. The core will then make these available as `DiscoveredTool` instances. The corresponding `tools.callCommand` would then be responsible for actually executing these custom tools.
- **MCP Server(s):** For more complex scenarios, one or more MCP servers can be set up and configured via the `mcpServers` setting in `settings.json`. The Gemini CLI core can then discover and use tools exposed by these servers. As mentioned, if you have multiple MCP servers, the tool names will be prefixed with the server name from your configuration (e.g., `serverAlias__actualToolName`).

This tool system provides a flexible and powerful way to augment the Gemini model's capabilities, making the Gemini CLI a versatile assistant for a wide range of tasks.
