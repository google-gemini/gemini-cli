# Hooks Reference

This document provides the technical specification for Gemini CLI hooks,
including the JSON schemas for input and output, exit code behaviors, and the
stable model API.

## Communication Protocol

Hooks communicate with Gemini CLI via standard streams and exit codes:

- **Input**: Gemini CLI sends a JSON object to the hook's `stdin`.
- **Output**: The hook sends a JSON object (or plain text) to `stdout`.
- **Exit Codes**: Used to signal success or blocking errors.

### Exit Code Behavior

| Exit Code | Meaning            | Behavior                                                                                        |
| :-------- | :----------------- | :---------------------------------------------------------------------------------------------- |
| `0`       | **Success**        | `stdout` is parsed as JSON. If parsing fails, it's treated as a `systemMessage`.                |
| `2`       | **Blocking Error** | Interrupts the current operation. `stderr` is shown to the agent (for tool events) or the user. |
| Other     | **Warning**        | Execution continues. `stderr` is logged as a non-blocking warning.                              |

---

## Input Schema (`stdin`)

Every hook receives a base JSON object. Extra fields are added depending on the
specific event.

### Base Fields (All Events)

| Field             | Type     | Description                                           |
| :---------------- | :------- | :---------------------------------------------------- |
| `session_id`      | `string` | Unique identifier for the current CLI session.        |
| `transcript_path` | `string` | Path to the session's JSON transcript (if available). |
| `cwd`             | `string` | The current working directory.                        |
| `hook_event_name` | `string` | The name of the firing event (e.g., `BeforeTool`).    |
| `timestamp`       | `string` | ISO 8601 timestamp of the event.                      |

### Event-Specific Fields

#### Tool Events (`BeforeTool`, `AfterTool`)

- `tool_name`: (`string`) The internal name of the tool (e.g., `write_file`,
  `run_shell_command`).
- `tool_input`: (`object`) The arguments passed to the tool.
- `tool_response`: (`object`, **AfterTool only**) The raw output from the tool
  execution.
- `mcp_context`: (`object`, **optional**) Present only for MCP tool invocations.
  Contains server identity information:
  - `server_name`: (`string`) The configured name of the MCP server.
  - `tool_name`: (`string`) The original tool name from the MCP server.
  - `command`: (`string`, optional) For stdio transport, the command used to
    start the server.
  - `args`: (`string[]`, optional) For stdio transport, the command arguments.
  - `cwd`: (`string`, optional) For stdio transport, the working directory.
  - `url`: (`string`, optional) For SSE/HTTP transport, the server URL.
  - `tcp`: (`string`, optional) For WebSocket transport, the TCP address.

#### Agent Events (`BeforeAgent`, `AfterAgent`)

- `prompt`: (`string`) The user's submitted prompt.
- `prompt_response`: (`string`, **AfterAgent only**) The final response text
  from the model.
- `stop_hook_active`: (`boolean`, **AfterAgent only**) Indicates if a stop hook
  is already handling a continuation.

#### Model Events (`BeforeModel`, `AfterModel`, `BeforeToolSelection`)

- `llm_request`: (`LLMRequest`) A stable representation of the outgoing request.
  See [Stable Model API](#stable-model-api).
- `llm_response`: (`LLMResponse`, **AfterModel only**) A stable representation
  of the incoming response.

#### Session & Notification Events

- `source`: (`startup` | `resume` | `clear`, **SessionStart only**) The trigger
  source.
- `reason`: (`exit` | `clear` | `logout` | `prompt_input_exit` | `other`,
  **SessionEnd only**) The reason for session end.
- `trigger`: (`manual` | `auto`, **PreCompress only**) What triggered the
  compression event.
- `notification_type`: (`ToolPermission`, **Notification only**) The type of
  notification being fired.
- `message`: (`string`, **Notification only**) The notification message.
- `details`: (`object`, **Notification only**) Payload-specific details for the
  notification.

---

## Output Schema (`stdout`)

If the hook exits with `0`, the CLI attempts to parse `stdout` as JSON.

### Common Output Fields

| Field                | Type      | Description                                                                            |
| :------------------- | :-------- | :------------------------------------------------------------------------------------- |
| `decision`           | `string`  | One of: `allow`, `deny`, `block`, `ask`, `approve`.                                    |
| `reason`             | `string`  | Explanation shown to the **agent** when a decision is `deny` or `block`.               |
| `systemMessage`      | `string`  | Message displayed in Gemini CLI terminal to provide warning or context to the **user** |
| `continue`           | `boolean` | If `false`, immediately terminates the agent loop for this turn.                       |
| `stopReason`         | `string`  | Message shown to the user when `continue` is `false`.                                  |
| `suppressOutput`     | `boolean` | If `true`, the hook execution is hidden from the CLI transcript.                       |
| `hookSpecificOutput` | `object`  | Container for event-specific data (see below).                                         |

### `hookSpecificOutput` Reference

### Matchers and tool names

For `BeforeTool` and `AfterTool` events, the `matcher` field in your settings is
compared against the name of the tool being executed.

- **Built-in Tools**: You can match any built-in tool (e.g., `read_file`,
  `run_shell_command`). See the [Tools Reference](/docs/tools) for a full list
  of available tool names.
- **MCP Tools**: Tools from MCP servers follow the naming pattern
  `mcp__<server_name>__<tool_name>`.
- **Regex Support**: Matchers support regular expressions (e.g.,
  `matcher: "read_.*"` matches all file reading tools).

### `BeforeTool`

Fires before a tool is invoked. Used for argument validation, security checks,
and parameter rewriting.

- **Input Fields**:
  - `tool_name`: (`string`) The name of the tool being called.
  - `tool_input`: (`object`) The raw arguments generated by the model.
  - `mcp_context`: (`object`) Optional metadata for MCP-based tools.
- **Relevant Output Fields**:
  - `decision`: Set to `"deny"` (or `"block"`) to prevent the tool from
    executing.
  - `reason`: Required if denied. This text is sent **to the agent** as a tool
    error, allowing it to respond or retry.
  - `hookSpecificOutput.tool_input`: An object that **merges with and
    overrides** the model's arguments before execution.
  - `continue`: Set to `false` to **kill the entire agent loop** immediately.
- **Exit Code 2 (Block Tool)**: Prevents execution. Uses `stderr` as the
  `reason` sent to the agent. **The turn continues.**

### `AfterTool`

Fires after a tool executes. Used for result auditing, context injection, or
hiding sensitive output from the agent.

- **Input Fields**:
  - `tool_name`: (`string`)
  - `tool_input`: (`object`) The original arguments.
  - `tool_response`: (`object`) The result containing `llmContent`,
    `returnDisplay`, and optional `error`.
  - `mcp_context`: (`object`)
- **Relevant Output Fields**:
  - `decision`: Set to `"deny"` to hide the real tool output from the agent.
  - `reason`: Required if denied. This text **replaces** the tool result sent
    back to the model.
  - `hookSpecificOutput.additionalContext`: Text that is **appended** to the
    tool result for the agent.
  - `continue`: Set to `false` to **kill the entire agent loop** immediately.
- **Exit Code 2 (Block Result)**: Hides the tool result. Uses `stderr` as the
  replacement content sent to the agent. **The turn continues.**

---

## Agent hooks

### `BeforeAgent`

Fires after a user submits a prompt, but before the agent begins planning. Used
for prompt validation or injecting dynamic context.

- **Input Fields**:
  - `prompt`: (`string`) The original text submitted by the user.
- **Relevant Output Fields**:
  - `hookSpecificOutput.additionalContext`: Text that is **appended** to the
    prompt for this turn only.
  - `decision`: Set to `"deny"` to block the turn and **discard the user's
    message** (it will not appear in history).
  - `continue`: Set to `false` to block the turn but **save the message to
    history**.
  - `reason`: Required if denied or stopped.
- **Exit Code 2 (Block Turn)**: Aborts the turn and erases the prompt from
  context. Same as `decision: "deny"`.

### `AfterAgent`

Fires once per turn after the model generates its final response. Primary use
case is response validation and automatic retries.

- **Input Fields**:
  - `prompt`: (`string`) The user's original request.
  - `prompt_response`: (`string`) The final text generated by the agent.
  - `stop_hook_active`: (`boolean`) Indicates if this hook is already running as
    part of a retry sequence.
- **Relevant Output Fields**:
  - `decision`: Set to `"deny"` to **reject the response** and force a retry.
  - `reason`: Required if denied. This text is sent **to the agent as a new
    prompt** to request a correction.
  - `continue`: Set to `false` to **stop the session** without retrying.
  - `clearContext`: If `true`, clears conversation history (LLM memory) while
    preserving UI display.
- **Exit Code 2 (Retry)**: Rejects the response and triggers an automatic retry
  turn using `stderr` as the feedback prompt.

---

## Model hooks

### `BeforeModel`

Fires before sending a request to the LLM. Operates on a stable, SDK-agnostic
request format.

- **Input Fields**:
  - `llm_request`: (`object`) Contains `model`, `messages`, and `config`
    (generation params).
- **Relevant Output Fields**:
  - `hookSpecificOutput.llm_request`: An object that **overrides** parts of the
    outgoing request (e.g., changing models or temperature).
  - `hookSpecificOutput.llm_response`: A **Synthetic Response** object. If
    provided, the CLI skips the LLM call entirely and uses this as the response.
  - `decision`: Set to `"deny"` to block the request and abort the turn.
- **Exit Code 2 (Block Turn)**: Aborts the turn and skips the LLM call. Uses
  `stderr` as the error message.

### `BeforeToolSelection`

Fires before the LLM decides which tools to call. Used to filter the available
toolset or force specific tool modes.

- **Input Fields**:
  - `llm_request`: (`object`) Same format as `BeforeModel`.
- **Relevant Output Fields**:
  - `hookSpecificOutput.toolConfig.mode`: (`"AUTO" | "ANY" | "NONE"`)
    - `"NONE"`: Disables all tools (Wins over other hooks).
    - `"ANY"`: Forces at least one tool call.
  - `hookSpecificOutput.toolConfig.allowedFunctionNames`: (`string[]`) Whitelist
    of tool names.
- **Union Strategy**: Multiple hooks' whitelists are **combined**.
- **Limitations**: Does **not** support `decision`, `continue`, or
  `systemMessage`.

### `AfterModel`

Fires immediately after an LLM response chunk is received. Used for real-time
redaction or PII filtering.

- **Input Fields**:
  - `llm_request`: (`object`) The original request.
  - `llm_response`: (`object`) The model's response (or a single chunk during
    streaming).
- **Relevant Output Fields**:
  - `hookSpecificOutput.llm_response`: An object that **replaces** the model's
    response chunk.
  - `decision`: Set to `"deny"` to discard the response chunk and block the
    turn.
  - `continue`: Set to `false` to **kill the entire agent loop** immediately.
- **Note on Streaming**: Fired for **every chunk** generated by the model.
  Modifying the response only affects the current chunk.
- **Exit Code 2 (Block Response)**: Aborts the turn and discards the model's
  output. Uses `stderr` as the error message.

---

## Lifecycle & system hooks

### `SessionStart`

Fires on application startup, resuming a session, or after a `/clear` command.
Used for loading initial context.

- **Input fields**:
  - `source`: (`"startup" | "resume" | "clear"`)
- **Relevant output fields**:
  - `hookSpecificOutput.additionalContext`: (`string`)
    - **Interactive**: Injected as the first turn in history.
    - **Non-interactive**: Prepended to the user's prompt.
  - `systemMessage`: Shown at the start of the session.
- **Advisory only**: `continue` and `decision` fields are **ignored**. Startup
  is never blocked.

### `SessionEnd`

Fires when the CLI exits or a session is cleared. Used for cleanup or final
telemetry.

- **Input Fields**:
  - `reason`: (`"exit" | "clear" | "logout" | "prompt_input_exit" | "other"`)
- **Relevant Output Fields**:
  - `systemMessage`: Displayed to the user during shutdown.
- **Best Effort**: The CLI **will not wait** for this hook to complete and
  ignores all flow-control fields (`continue`, `decision`).

### `Notification`

Fires when the CLI emits a system alert (e.g., Tool Permissions). Used for
external logging or cross-platform alerts.

- **Input Fields**:
  - `notification_type`: (`"ToolPermission"`)
  - `message`: Summary of the alert.
  - `details`: JSON object with alert-specific metadata (e.g., tool name, file
    path).
- **Relevant Output Fields**:
  - `systemMessage`: Displayed alongside the system alert.
- **Observability Only**: This hook **cannot** block alerts or grant permissions
  automatically. Flow-control fields are ignored.

### `PreCompress`

Fires before the CLI summarizes history to save tokens. Used for logging or
state saving.

- **Input Fields**:
  - `trigger`: (`"auto" | "manual"`)
- **Relevant Output Fields**:
  - `systemMessage`: Displayed to the user before compression.
- **Advisory Only**: Fired asynchronously. It **cannot** block or modify the
  compression process. Flow-control fields are ignored.

---

## Stable Model API

Gemini CLI uses a decoupled format for model interactions to ensure hooks remain
stable even if the underlying Gemini SDK changes.

### `LLMRequest` Object

Used in `BeforeModel` and `BeforeToolSelection`.

> 💡 **Note**: In v1, model hooks are primarily text-focused. Non-text parts
> (like images or function calls) provided in the `content` array will be
> simplified to their string representation by the translator.

```typescript
{
  "model": string,
  "messages": Array<{
    "role": "user" | "model" | "system",
    "content": string | Array<{ "type": string, [key: string]: any }>
  }>,
  "config"?: {
    "temperature"?: number,
    "maxOutputTokens"?: number,
    "topP"?: number,
    "topK"?: number
  },
  "toolConfig"?: {
    "mode"?: "AUTO" | "ANY" | "NONE",
    "allowedFunctionNames"?: string[]
  }
}
```

### `LLMResponse` Object

Used in `AfterModel` and as a synthetic response in `BeforeModel`.

```typescript
{
  "text"?: string,
  "candidates": Array<{
    "content": {
      "role": "model",
      "parts": string[]
    },
    "finishReason"?: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER",
    "index"?: number,
    "safetyRatings"?: Array<{
      "category": string,
      "probability": string,
      "blocked"?: boolean
    }>
  }>,
  "usageMetadata"?: {
    "promptTokenCount"?: number,
    "candidatesTokenCount"?: number,
    "totalTokenCount"?: number
  }
}
```
