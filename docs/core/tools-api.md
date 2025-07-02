# Gemini CLI Core: Tools API

This document provides a comprehensive guide to the robust Tool API system within the Gemini CLI's core (`packages/core`). This system enables the Gemini model to extend its capabilities beyond text generation, allowing it to interact with your local environment, fetch web content, perform shell commands, and execute various other actions.

## Core Concepts

At the heart of the Tool API are several key concepts that define how tools are structured, managed, and executed:

- **Tool Interface (`tools.ts`):** All tools in the Gemini CLI adhere to a common interface and extend a `BaseTool` class. This ensures consistency and defines the contract for how tools interact with the core. Each tool must implement or define:
  - `name`: A unique, internal identifier for the tool, used in API calls to the Gemini model.
  - `displayName`: A user-friendly name for display in the CLI.
  - `description`: A clear, concise explanation of the tool's functionality, provided to the Gemini model to help it decide when and how to use the tool.
  - `parameterSchema`: A JSON schema that rigorously defines the parameters the tool accepts. This is crucial for the Gemini model to construct valid tool calls.
  - `validateToolParams()`: A method to perform runtime validation of incoming parameters before tool execution.
  - `getDescription()`: A method that generates a human-readable description of what the tool will do with specific parameters, presented to the user for confirmation.
  - `shouldConfirmExecute()`: A method that determines if explicit user confirmation is required before executing the tool (e.g., for operations that modify the file system or execute shell commands).
  - `execute()`: The core method that performs the tool's intended action and returns a `ToolResult`.

- **`ToolResult` (`tools.ts`):** This interface defines the standardized structure for the outcome of a tool's execution. It typically includes:
  - `llmContent`: The factual string content that is sent back to the Language Model (LLM) for context and further processing.
  - `returnDisplay`: A user-friendly string (often Markdown formatted) or a special object (like `FileDiff`) intended for direct display in the CLI to inform the user of the tool's action and result.

- **Tool Registry (`tool-registry.ts`):** The `ToolRegistry` class is central to managing all available tools. Its responsibilities include:
  - **Registering Tools:** It maintains a collection of all built-in tools (e.g., `ReadFileTool`, `ShellTool`) upon startup.
  - **Dynamic Tool Discovery:** It can dynamically discover and register custom tools through various mechanisms:
    - **Command-based Discovery:** If a `toolDiscoveryCommand` is configured in `settings.json`, the registry executes this command. The command is expected to output a JSON array of [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations), which are then registered as `DiscoveredTool` instances.
    - **MCP-based Discovery:** If `mcpServerCommand` (or `mcpServers`) is configured, the registry connects to one or more Model Context Protocol (MCP) servers to list and register tools (`DiscoveredMCPTool`).
  - **Schema Provisioning:** It exposes the `FunctionDeclaration` schemas of all registered tools to the Gemini model, enabling the model to understand what tools are available and how to invoke them correctly.
  - **Tool Retrieval:** It provides methods for the core to retrieve a specific tool by its registered name for execution.

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

- **Command-based Discovery:** Advanced users or project administrators can define a `toolDiscoveryCommand` in `settings.json`. This command, when run by the Gemini CLI core, should output a JSON array of `FunctionDeclaration` objects. The core will then make these available as `DiscoveredTool` instances. The corresponding `toolCallCommand` would then be responsible for actually executing these custom tools.
- **MCP Server(s):** For more complex scenarios, one or more MCP servers can be set up and configured via the `mcpServers` setting in `settings.json`. The Gemini CLI core can then discover and use tools exposed by these servers. As mentioned, if you have multiple MCP servers, the tool names will be prefixed with the server name from your configuration (e.g., `serverAlias__actualToolName`).

This tool system provides a flexible and powerful way to augment the Gemini model's capabilities, making the Gemini CLI a versatile assistant for a wide range of tasks.
