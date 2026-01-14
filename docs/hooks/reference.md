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

| Field               | Supported Events                           | Description                                                                       |
| :------------------ | :----------------------------------------- | :-------------------------------------------------------------------------------- |
| `additionalContext` | `SessionStart`, `BeforeAgent`, `AfterTool` | Appends text directly to the agent's context.                                     |
| `llm_request`       | `BeforeModel`                              | A `Partial<LLMRequest>` to override parameters of the outgoing call.              |
| `llm_response`      | `BeforeModel`                              | A **full** `LLMResponse` to bypass the model and provide a synthetic result.      |
| `llm_response`      | `AfterModel`                               | A `Partial<LLMResponse>` to modify the model's response before the agent sees it. |
| `toolConfig`        | `BeforeToolSelection`                      | Object containing `mode` (`AUTO`/`ANY`/`NONE`) and `allowedFunctionNames`.        |

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
