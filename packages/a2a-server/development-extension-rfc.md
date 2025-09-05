# RFC: Gemini CLI A2A Development-Tool Extension

## 1. Introduction

### 1.1 Overview

To standardize client integrations with the Gemini CLI agent, this document proposes the `development-tool` extension for the A2A protocol.

Rather than creating a new protocol, this specification builds upon the existing A2A protocol. As an open-source standard recently adopted by the Linux Foundation, A2A provides a robust foundation for core concepts like tasks, messages, and streaming events. This extension-based approach allows us to leverage A2A's proven architecture while defining the specific capabilities required for rich, interactive workflows with the Gemini CLI agent.

### 1.2 Motivation

Recent work integrating Gemini CLI with clients like Zed and Gemini Code Assist’s agent mode has highlighted the need for a robust, standard communication protocol. Standardizing on A2A provides several key advantages:

- **Solid Foundation**: Provides a robust, open standard that ensures a stable, predictable, and consistent integration experience across different IDEs and client surfaces.
- **Extensibility**: Creates a flexible foundation to support new tools and workflows as they emerge.
- **Ecosystem Alignment**: Aligns Gemini CLI with a growing industry standard, fostering broader interoperability.

## 2. Communication Flow

The interaction follows A2A’s task-based, streaming pattern. The client sends a `message/stream` request and the agent responds with a `contextId` / `taskId` and a stream of events. `TaskStatusUpdateEvent` events are used to convey the overall state of the task. The task is complete when the agent sends a final `TaskStatusUpdateEvent` with `final: true` and a terminal status like `completed` or `failed`.

### 2.1 Asynchronous Responses and Notifications

Clients that may disconnect from the agent should supply a `PushNotificationConfig` to the agent with the initial `message/stream` method or subsequently with the `tasks/pushNotificationConfig/set` method so that the agent can call back when updates are ready.

## 3. The `development-tool` extension

### 3.1 Overview

The `development-tool` extension establishes a communication contract for workflows between a client and the Gemini CLI agent. It consists of a specialized set of schemas, embedded within core A2A data structures, that enable the agent to stream real-time updates on its state and thought process. These schemas also provide the mechanism for the agent to request user permission before executing tools.

**Sample Agent Card**

```json
{
  "name": "Gemini CLI Agent",
  "description": "An agent that generates code based on natural language instructions.",
  "capabilities": {
    "streaming": true,
    "extensions": [
      {
        "uri": "https://github.com/google-gemini/gemini-cli/blob/main/docs/a2a/developer-profile/v0/spec.md",
        "description": "An extension for interactive development tasks, enabling features like code generation, tool usage, and real-time status updates.",
        "required": true
      }
    ]
  }
}
```

**Versioning**

The agent card `uri` field contains an embedded semantic version. The client must extract this version to determine compatibility with the agent extension using the compatibility logic defined in Semantic Versioning 2.0.0 spec.

### 3.2 Schema Definitions

This section defines the schemas for the `development-tool` A2A extension, organized by their function within the communication flow. Note that all custom objects included in the `metadata` field (e.g. `Message.metadata`) must be keyed by the unique URI that points to that extension’s spec to prevent naming collisions with other extensions.

**Initialization & Configuration**

The first message in a session must contain an `AgentSettings` object in its metadata. This object provides the agent with the necessary configuration information for proper initialization. Additional configuration settings (ex. MCP servers, allowed tools, etc.) can be added to this message.

**Schema**

```proto
syntax = "proto3";

// Configuration settings for the Gemini CLI agent.
message AgentSettings {
  // The absolute path to the workspace directory where the agent will execute.
  string workspace_path = 1;
}
```

**Agent-to-Client Messages**

All real-time updates from the agent (including its thoughts, tool calls, and simple text replies) are streamed to the client as `TaskStatusUpdateEvents`.

Each Event contains a `Message` object, which holds the content in one of two formats:

- **TextPart**: Used for standard text messages. This part requires no custom schema.
- **DataPart**: Used for complex, structured objects. Tool Calls and Thoughts are sent this way, each using their respective schemas defined below.

**Tool Calls**

The `ToolCall` schema is designed to provide a structured representation of a tool’s execution lifecycle. This protocol defines a clear state machine and provides detailed schemas for common development tasks (file edits, shell commands, MCP Tool), ensuring clients can build reliable UIs without being tied to a specific agent implementation.

The core principle is that the agent sends a `ToolCall` object on every update. This makes client-side logic stateless and simple.

**Tool Call Lifecycle**

1.  **Creation**: The agent sends a `ToolCall` object with `status: PENDING`. If user permission is required, the `confirmation_request` field will be populated.
2.  **Confirmation**: If the client needs to confirm the message, the client will send a `ToolCallConfirmation`. If the client responds with a cancellation, execution will be skipped.
3.  **Execution**: Once approved (or if no approval is required), the agent sends an update with `status: EXECUTING`. It can stream real-time progress by updating the `live_content` field.
4.  **Completion**: The agent sends a final update with the status set to `SUCCEEDED`, `FAILED`, or `CANCELLED` and populates the appropriate result field.

**Schema**

```proto
syntax = "proto3";

import "google/protobuf/struct.proto";

// ToolCall is the central message represeting a tool's execution lifecycle.
// The entire object is sent from the agent to client on every update.
message ToolCall {
  // A unique identifier, assigned by the agent
  string tool_call_id = 1;

  // The current state of the tool call in its lifecycle
  ToolCallStatus status = 2;

  // Name of the tool being called (e.g. 'Edit', 'ShellTool')
  string tool_name = 3;

  // An optional description of the tool call's purpose to show the user
  optional string description = 4;

  // The structured input params provided by the LLM for tool invocation.
  google.protobuf.Struct input_parameters = 5;

  // String containing the real-time output from the tool as it executes (primarily designed for shell output).
  // During streaming the entire string is replaced on each update
  optional string live_content = 6;

  // The final result of the tool (used to replace live_content when applicable)
  oneof result {
    // The output on tool success
    ToolOutput output = 7;
    // The error details if the tool failed
    ErrorDetails error = 8;
  }

  // If the tool requires user confirmation, this field will be populated while status is PENDING
  optional ConfirmationRequest confirmation_request = 9;
}

// Possible execution status of a ToolCall
enum ToolCallStatus {
  STATUS_UNSPECIFIED = 0;
  PENDING = 1;
  EXECUTING = 2;
  SUCCEEDED = 3;
  FAILED = 4;
  CANCELLED = 5;
}

// ToolOuput represents the final, successful, output of a tool
message ToolOutput {
  oneof result {
    string text = 1;
    // For ToolCalls which resulted in a file modification
    FileDiff diff = 2;
    // A generic fallback for any other structured JSON data
    google.protobuf.Struct structured_data = 3;
  }
}

// A structured representation of an error
message ErrorDetails {
  // User facing error message
  string message = 1;
  // Optional agent-specific error type or category (e.g. read_content_failure, grep_execution_error, mcp_tool_error)
  optional string type = 2;
  // Optional status code
  optional int32 status_code = 3;
}

// ConfirmationRequest is sent from the agent to client to request user permission for a ToolCall
message ConfirmationRequest {
  // A list of choices for the user to select from
  repeated ConfirmationOption options = 1;
  // Specific details of the action requiring user confirmation
  oneof details {
    ExecuteDetails execute_details = 2;
    FileDiff file_edit_details = 3;
    McpDetails mcp_details = 4;
    GenericDetails generic_details = 5;
  }
}

// A single choice presented to the user during a confirmation request
message ConfirmationOption {
  // Unique ID for the choice (e.g. proceed_once, cancel)
  string id = 1;
  // Human-readable choice (e.g. Allow Once, Reject).
  string name = 2;
  // An optional longer description for a tooltip
  optional string description = 3;
}

// Details for a request to execute a shell command
message ExecuteDetails {
  // The shell command to be executed
  string command = 1;
  // An optional directory in which the command will be run
  optional string working_directory = 2;
}


message FileDiff {
  string file_name = 1;
  // The absolute path to the file to modify
  string file_path = 2;
  // The original content, if the file exists
  optional string old_content = 3;
  string new_content = 4;
  // Pre-formatted diff string for display
  optional string formatted_diff = 5;
}

// Details for an MCP (Model Context Protocol) tool confirmation
message McpDetails {
  // The name of the MCP server that provides the tool
  string server_name = 1;
  // THe name of the tool being called from the MCP Server
  string tool_name = 2;
}

// Generic catch-all for ToolCall requests that don't fit other types
message GenericDetails {
  // Description of the action requiring confirmation
  string description = 1;
}
```

**Agent Thoughts**

**Schema**

```proto
syntax = "proto3";

// Represents a thought with a subject and a detailed description.
message AgentThought {
  // A concise subject line or title for the thought.
  string subject = 1;

  // The description or elaboration of the thought itself.
  string description = 2;
}
```

**Event Metadata**

The `metadata` object in `TaskStatusUpdateEvent` is used by the A2A client to deserialize the `TaskStatusUpdateEvents` into their appropriate objects.

**Schema**

```proto
syntax = "proto3";

// A DevelopmentToolEvent event.
message DevelopmentToolEvent {
  // Enum representing the specific type of development tool event.
  enum DevelopmentToolEventKind {
    // The default, unspecified value.
    DEVELOPMENT_TOOL_EVENT_KIND_UNSPECIFIED = 0;
    TOOL_CALL_CONFIRMATION = 1;
    TOOL_CALL_UPDATE = 2;
    TEXT_CONTENT = 3;
    STATE_CHANGE = 4;
    THOUGHT = 5;
  }

  // The specific kind of event that occurred.
  DevelopmentToolEventKind kind = 1;

  // The model used for this event.
  string model = 2;

  // The tier of the user (optional).
  string user_tier = 3;

  // An unexpected error occured in the agent execution (optional).
  string error = 4;
}
```

**Client-to-Agent Messages**

When the agent sends a `TaskStatusUpdateEvent` with `status.state` set to `input-required` and its message contains a `ConfirmationRequest`, the client must respond by sending a new `message/stream` request.

This new request must include the `contextId` and the `taskId` from the ongoing task and contain a `ToolCallConfirmation` object. This object conveys the user's decision regarding the tool call that was awaiting approval.

**Schema**

```proto
syntax = "proto3";

// The client's response to a ConfirmationRequest.
message ToolCallConfirmation {
  // A unique identifier, assigned by the agent
  string tool_call_id = 1;
  // The 'id' of the ConfirmationOption chosen by the user.
  string selected_option_id = 2;
  // Included if the user modifies the proposed change.
  // The type should correspond to the original ConfirmationRequest details.
  oneof modified_details {
    // Corresponds to a FileDiff confirmation
    ModifiedFileDetails file_details = 3;
  }
}

message ModifiedFileDetails {
  // The new content after user edits.
  string new_content = 1;
}
```

### 3.3 Method Definitions

This section defines the new methods introduced by the `development-tool` extension.

**Method: `commands/get`**

This method allows the client to discover slash commands supported by Gemini CLI. The client should call this method during startup to dynamically populate its command list.

```proto
// Response message containing the list of all top-level slash commands.
message GetAllSlashCommandsResponse {
  // A list of the top-level slash commands.
  repeated SlashCommand commands = 1;
}

// Represents a single slash command, which can contain subcommands.
message SlashCommand {
  // The primary name of the command.
  string name = 1;
  // A detailed description of what the command does.
  string description = 2;
  // A list of arguments that the command accepts.
  repeated SlashCommandArgument arguments = 3;
  // A list of nested subcommands.
  repeated SlashCommand sub_commands = 4;
}

// Defines the structure for a single slash command argument.
message SlashCommandArgument {
  // The name of the argument.
  string name = 1;
  // A brief description of what the argument is for.
  string description = 2;
  // Whether the argument is required or optional.
  bool is_required = 3;
}
```

**Method: `command/execute`**

This method allows the client to execute a slash command. Following the initial `ExecuteSlashCommandResponse`, the agent will use the standard streaming mechanism to communicate the command's progress and output. All subsequent updates, including textual output, agent thoughts, and any required user confirmations for tool calls (like executing a shell command), will be sent as `TaskStatusUpdateEvent` messages, re-using the schemas defined above.

```proto
// Request to execute a specific slash command.
message ExecuteSlashCommandRequest {
  // The path to the command, e.g., ["memory", "add"] for /memory add
  repeated string command_path = 1;
  // The arguments for the command as a single string.
  string args = 2;
}

// Enum for the initial status of a command execution request.
enum CommandExecutionStatus {
  // Default unspecified status.
  COMMAND_EXECUTION_STATUS_UNSPECIFIED = 0;
  // The command was successfully received and its execution has started.
  STARTED = 1;
  // The command failed to start (e.g., command not found, invalid format).
  FAILED_TO_START = 2;
  // The command has been paused and is waiting for the user to confirm
  // a set of shell commands.
  AWAITING_SHELL_CONFIRMATION = 3;
  // The command has been paused and is waiting for the user to confirm
  // a specific action.
  AWAITING_ACTION_CONFIRMATION = 4;
}

// The immediate, async response after requesting a command execution.
message ExecuteSlashCommandResponse {
  // A unique taskID for this specific command execution.
  string execution_id = 1;
  // The initial status of the command execution.
  CommandExecutionStatus status = 2;
  // An optional message, particularly useful for explaining why a command
  // failed to start.
  string message = 3;
}
```

## 4. Separation of Concerns

We believe that all client-side context (ex., workspace state) and client-side tool execution (ex. read active buffers) should be routed through MCP.

This approach enforces a strict separation of concerns: the A2A `development-tool` extension standardizes communication to the agent, while MCP serves as the single, authoritative interface for client-side capabilities.

## Appendix

### A. Example Interaction Flow

1.  **Client -> Server**: The client sends a `message/stream` request containing the initial prompt and configuration in an `AgentSettings` object.
2.  **Server -> Client**: SSE stream begins.
    - **Event 1**: The server sends a `Task` object with `status.state: 'submitted'` and the new `taskId`.
    - **Event 2**: The server sends a `TaskStatusUpdateEvent` with the metadata `kind` set to `'STATE_CHANGE'` and `status.state` set to `'working'`.
3.  **Agent Logic**: The agent processes the prompt and decides to call the `write_file` tool, which requires user confirmation.
4.  **Server -> Client**:
    - **Event 3**: The server sends a `TaskStatusUpdateEvent`. The metadata `kind` is `'TOOL_CALL_UPDATE'`, and the `DataPart` contains a `ToolCall` object with its `status` as `'PENDING'` and a populated `confirmation_request`.
    - **Event 4**: The server sends a final `TaskStatusUpdateEvent` for this exchange. The metadata `kind` is `'STATE_CHANGE'`, the `status.state` is `'input-required'`, and `final` is `true`. The stream for this request ends.
5.  **Client**: The client UI renders the confirmation prompt based on the `ToolCall` object from Event 3. The user clicks "Approve."
6.  **Client -> Server**: The client sends a new `message/stream` request. It includes the `taskId` from the ongoing task and a `DataPart` containing a `ToolCallConfirmation` object (e.g., `{"tool_call_id": "...", "selected_option_id": "proceed_once"}`).
7.  **Server -> Client**: A new SSE stream begins for the second request.
    - **Event 1**: The server sends a `TaskStatusUpdateEvent` with `kind: 'TOOL_CALL_UPDATE'`, containing the `ToolCall` object with its `status` now set to `'EXECUTING'`.
    - **Event 2**: After the tool runs, the server sends another `TaskStatusUpdateEvent` with `kind: 'TOOL_CALL_UPDATE'`, containing the `ToolCall` with its `status` as `'SUCCEEDED'`.
8.  **Agent Logic**: The agent receives the successful tool result and generates a final textual response.
9.  **Server -> Client**:
    - **Event 3**: The server sends a `TaskStatusUpdateEvent` with `kind: 'TEXT_CONTENT'` and a `TextPart` containing the agent's final answer.
    - **Event 4**: The server sends the final `TaskStatusUpdateEvent`. The `kind` is `'STATE_CHANGE'`, the `status.state` is `'completed'`, and `final` is `true`. The stream ends.
10. **Client**: The client displays the final answer. The task is now complete but can be continued by sending another message with the same `taskId`.
