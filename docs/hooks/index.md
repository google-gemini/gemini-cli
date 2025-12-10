# Gemini CLI hooks

Hooks are scripts or programs that Gemini CLI executes at specific points in the
agentic loop, allowing you to intercept and customize behavior without modifying
the CLI's source code.

See [writing hooks guide](writing-hooks.md) for a tutorial on creating your
first hook and a comprehensive example.

See [best practices](best-practices.md) for guidelines on security, performance,
and debugging.

## What are hooks?

With hooks, you can:

- **Add context:** Inject relevant information before the model processes a
  request
- **Validate actions:** Review and block potentially dangerous operations
- **Enforce policies:** Implement security and compliance requirements
- **Log interactions:** Track tool usage and model responses
- **Optimize behavior:** Dynamically adjust tool selection or model parameters

Hooks run synchronously as part of the agent loop—when a hook event fires,
Gemini CLI waits for all matching hooks to complete before continuing.

## Core concepts

### Hook events

Hooks are triggered by specific events in Gemini CLI's lifecycle. The following
table lists all available hook events:

| Event                 | When It Fires                                 | Common Use Cases                           |
| --------------------- | --------------------------------------------- | ------------------------------------------ |
| `SessionStart`        | When a session begins                         | Initialize resources, load context         |
| `SessionEnd`          | When a session ends                           | Clean up, save state                       |
| `BeforeAgent`         | After user submits prompt, before planning    | Add context, validate prompts              |
| `AfterAgent`          | When agent loop ends                          | Review output, force continuation          |
| `BeforeModel`         | Before sending request to LLM                 | Modify prompts, add instructions           |
| `AfterModel`          | After receiving LLM response                  | Filter responses, log interactions         |
| `BeforeToolSelection` | Before LLM selects tools (after BeforeModel)  | Filter available tools, optimize selection |
| `BeforeTool`          | Before a tool executes                        | Validate arguments, block dangerous ops    |
| `AfterTool`           | After a tool executes                         | Process results, run tests                 |
| `PreCompress`         | Before context compression                    | Save state, notify user                    |
| `Notification`        | When a notification occurs (e.g., permission) | Auto-approve, log decisions                |

### Hook types

Gemini CLI currently supports **command hooks** that run shell commands or
scripts:

```json
{
  "type": "command",
  "command": "$GEMINI_PROJECT_DIR/.gemini/hooks/my-hook.sh",
  "timeout": 30000
}
```

**Note:** Plugin hooks (npm packages) are planned for a future release.

### Matchers

For tool-related events (`BeforeTool`, `AfterTool`), you can filter which tools
trigger the hook:

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          /* hooks for write operations */
        ]
      }
    ]
  }
}
```

**Matcher patterns:**

- **Exact match:** `"ReadFile"` matches only `ReadFile`
- **Regex:** `"Write.*|Edit"` matches `WriteFile`, `WriteBinary`, `Edit`
- **Wildcard:** `"*"` or `""` matches all tools

**Session event matchers:**

- **SessionStart:** `startup`, `resume`, `clear`
- **SessionEnd:** `exit`, `clear`, `logout`, `prompt_input_exit`
- **PreCompress:** `manual`, `auto`
- **Notification:** `ToolPermission`

## Hook input/output contract

### Command hook communication

Hooks communicate via:

- **Input:** JSON on stdin
- **Output:** Exit code + stdout/stderr

### Exit codes

- **0:** Success - stdout shown to user (or injected as context for some events)
- **2:** Blocking error - stderr shown to agent/user, operation may be blocked
- **Other:** Non-blocking warning - logged but execution continues

### Common input fields

Every hook receives these base fields:

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "BeforeTool",
  "timestamp": "2025-12-01T10:30:00Z"
  // ... event-specific fields
}
```

### Event-specific fields

#### BeforeTool

**Input:**

```json
{
  "tool_name": "WriteFile",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "..."
  }
}
```

**Output (JSON on stdout):**

```json
{
  "decision": "allow|deny|ask|block",
  "reason": "Explanation shown to agent",
  "systemMessage": "Message shown to user"
}
```

Or simple exit codes:

- Exit 0 = allow (stdout shown to user)
- Exit 2 = deny (stderr shown to agent)

#### AfterTool

**Input:**

```json
{
  "tool_name": "ReadFile",
  "tool_input": { "file_path": "..." },
  "tool_response": "file contents..."
}
```

**Output:**

```json
{
  "decision": "allow|deny",
  "hookSpecificOutput": {
    "hookEventName": "AfterTool",
    "additionalContext": "Extra context for agent"
  }
}
```

#### BeforeAgent

**Input:**

```json
{
  "prompt": "Fix the authentication bug"
}
```

**Output:**

```json
{
  "decision": "allow|deny",
  "hookSpecificOutput": {
    "hookEventName": "BeforeAgent",
    "additionalContext": "Recent project decisions: ..."
  }
}
```

#### BeforeModel

**Input:**

```json
{
  "llm_request": {
    "model": "gemini-2.0-flash-exp",
    "messages": [{ "role": "user", "content": "Hello" }],
    "config": { "temperature": 0.7 },
    "toolConfig": {
      "functionCallingConfig": {
        "mode": "AUTO",
        "allowedFunctionNames": ["ReadFile", "WriteFile"]
      }
    }
  }
}
```

**Output:**

```json
{
  "decision": "allow",
  "hookSpecificOutput": {
    "hookEventName": "BeforeModel",
    "llm_request": {
      "messages": [
        { "role": "system", "content": "Additional instructions..." },
        { "role": "user", "content": "Hello" }
      ]
    }
  }
}
```

#### AfterModel

**Input:**

```json
{
  "llm_request": {
    "model": "gemini-2.0-flash-exp",
    "messages": [
      /* ... */
    ],
    "config": {
      /* ... */
    },
    "toolConfig": {
      /* ... */
    }
  },
  "llm_response": {
    "text": "string",
    "candidates": [
      {
        "content": {
          "role": "model",
          "parts": ["array of content parts"]
        },
        "finishReason": "STOP"
      }
    ]
  }
}
```

**Output:**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "AfterModel",
    "llm_response": {
      "candidate": {
        /* modified response */
      }
    }
  }
}
```

#### BeforeToolSelection

**Input:**

```json
{
  "llm_request": {
    "model": "gemini-2.0-flash-exp",
    "messages": [
      /* ... */
    ],
    "toolConfig": {
      "functionCallingConfig": {
        "mode": "AUTO",
        "allowedFunctionNames": [
          /* 100+ tools */
        ]
      }
    }
  }
}
```

**Output:**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "BeforeToolSelection",
    "toolConfig": {
      "functionCallingConfig": {
        "mode": "ANY",
        "allowedFunctionNames": ["ReadFile", "WriteFile", "Edit"]
      }
    }
  }
}
```

Or simple output (comma-separated tool names sets mode to ANY):

```bash
echo "ReadFile,WriteFile,Edit"
```

#### SessionStart

**Input:**

```json
{
  "source": "startup|resume|clear"
}
```

**Output:**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Loaded 5 project memories"
  }
}
```

#### SessionEnd

**Input:**

```json
{
  "reason": "exit|clear|logout|prompt_input_exit|other"
}
```

No structured output expected (but stdout/stderr logged).

#### PreCompress

**Input:**

```json
{
  "trigger": "manual|auto"
}
```

**Output:**

```json
{
  "systemMessage": "Compression starting..."
}
```

#### Notification

**Input:**

```json
{
  "notification_type": "ToolPermission",
  "message": "string",
  "details": {
    /* notification details */
  }
}
```

**Output:**

```json
{
  "systemMessage": "Notification logged"
}
```

## Configuration

Hook definitions are configured in `settings.json` files using the `hooks`
object. Configuration can be specified at multiple levels with defined
precedence rules.

### Configuration layers

Hook configurations are applied in the following order of precedence (higher
numbers override lower numbers):

1. **System defaults:** Built-in default settings (lowest precedence)
2. **User settings:** `~/.gemini/settings.json`
3. **Project settings:** `.gemini/settings.json` in your project directory
4. **System settings:** `/etc/gemini-cli/settings.json` (highest precedence)

Within each level, hooks run in the order they are declared in the
configuration.

### Configuration schema

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "pattern",
        "hooks": [
          {
            "name": "hook-identifier",
            "type": "command",
            "command": "./path/to/script.sh",
            "description": "What this hook does",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

**Configuration properties:**

- **`name`** (string, required): Unique identifier for the hook used in
  `/hooks enable/disable` commands
- **`type`** (string, required): Hook type - currently only `"command"` is
  supported
- **`command`** (string, required): Path to the script or command to execute
- **`description`** (string, optional): Human-readable description shown in
  `/hooks panel`
- **`timeout`** (number, optional): Timeout in milliseconds (default: 60000)
- **`matcher`** (string, optional): Pattern to filter when hook runs (event
  matchers only)

### Environment variables

Hooks have access to:

- `GEMINI_PROJECT_DIR`: Project root directory
- `GEMINI_SESSION_ID`: Current session ID
- `GEMINI_API_KEY`: Gemini API key (if configured)
- All other environment variables from the parent process

## Managing hooks

### View registered hooks

Use the `/hooks panel` command to view all registered hooks:

```bash
/hooks panel
```

This command displays:

- All active hooks organized by event
- Hook source (user, project, system)
- Hook type (command or plugin)
- Execution status and recent output

### Enable and disable hooks

You can temporarily enable or disable individual hooks using commands:

```bash
/hooks enable hook-name
/hooks disable hook-name
```

These commands allow you to control hook execution without editing configuration
files. The hook name should match the `name` field in your hook configuration.

### Disabled hooks configuration

To permanently disable hooks, add them to the `hooks.disabled` array in your
`settings.json`:

```json
{
  "hooks": {
    "disabled": ["secret-scanner", "auto-test"]
  }
}
```

**Note:** The `hooks.disabled` array uses a UNION merge strategy. Disabled hooks
from all configuration levels (user, project, system) are combined and
deduplicated, meaning a hook disabled at any level remains disabled.

## Migration from Claude Code

If you have hooks configured for Claude Code, you can migrate them:

```bash
gemini hooks migrate --from-claude
```

This command:

- Reads `.claude/settings.json`
- Converts event names (`PreToolUse` → `BeforeTool`, etc.)
- Translates tool names (`Bash` → `RunShellCommand`, `Edit` → `Edit`)
- Updates matcher patterns
- Writes to `.gemini/settings.json`

### Event name mapping

| Claude Code        | Gemini CLI     |
| ------------------ | -------------- |
| `PreToolUse`       | `BeforeTool`   |
| `PostToolUse`      | `AfterTool`    |
| `UserPromptSubmit` | `BeforeAgent`  |
| `Stop`             | `AfterAgent`   |
| `Notification`     | `Notification` |
| `SessionStart`     | `SessionStart` |
| `SessionEnd`       | `SessionEnd`   |
| `PreCompact`       | `PreCompress`  |

### Tool name mapping

| Claude Code | Gemini CLI        |
| ----------- | ----------------- |
| `Bash`      | `RunShellCommand` |
| `Edit`      | `Edit`            |
| `Read`      | `ReadFile`        |
| `Write`     | `WriteFile`       |

## Learn more

- [Writing Hooks](writing-hooks.md) - Tutorial and comprehensive example
- [Best Practices](best-practices.md) - Security, performance, and debugging
- [Custom Commands](../cli/custom-commands.md) - Create reusable prompt
  shortcuts
- [Configuration](../cli/configuration.md) - Gemini CLI configuration options
- [Hooks Design Document](../hooks-design.md) - Technical architecture details
