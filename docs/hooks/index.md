# Gemini CLI hooks

Hooks are scripts or programs that Gemini CLI executes at specific points in the
agentic loop, allowing you to intercept and customize behavior without modifying
the CLI's source code.

> **Note: Hooks are currently an experimental feature.**
>
> To use hooks, you must explicitly enable them in your `settings.json`:
>
> ```json
> {
>   "tools": { "enableHooks": true },
>   "hooks": { "enabled": true }
> }
> ```
>
> Both of these are needed in this experimental phase.

See [writing hooks guide](writing-hooks.md) for a tutorial on creating your
first hook and a comprehensive example.

See [hooks reference](reference.md) for the technical specification of the I/O
schemas.

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

## Security and Risks

> **Warning: Hooks execute arbitrary code with your user privileges.**
>
> By configuring hooks, you are explicitly allowing Gemini CLI to run shell
> commands on your machine. Malicious or poorly configured hooks can:

- **Exfiltrate data**: Read sensitive files (`.env`, ssh keys) and send them to
  remote servers.
- **Modify system**: Delete files, install malware, or change system settings.
- **Consume resources**: Run infinite loops or crash your system.

**Project-level hooks** (in `.gemini/settings.json`) and **Extension hooks** are
particularly risky when opening third-party projects or extensions from
untrusted authors. Gemini CLI will **warn you** the first time it detects a new
project hook (identified by its name and command), but it is **your
responsibility** to review these hooks (and any installed extensions) before
trusting them.

> **Note:** Extension hooks are subject to a mandatory security warning and
> consent flow during extension installation or update if hooks are detected.
> You must explicitly approve the installation or update of any extension that
> contains hooks.

See [Security Considerations](best-practices.md#using-hooks-securely) for a
detailed threat model and mitigation strategies.

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
        "matcher": "write_file|replace",
        "hooks": [
          /* hooks for write operations */
        ]
      }
    ]
  }
}
```

**Matcher patterns:**

- **Exact match:** `"read_file"` matches only `read_file`
- **Regex:** `"write_.*|replace"` matches `write_file`, `replace`
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
  "transcript_path": "/path/to/transcript.jsonl",
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
  "tool_name": "write_file",
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
  "tool_name": "read_file",
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
        "allowedFunctionNames": ["read_file", "write_file"]
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
        "allowedFunctionNames": ["read_file", "write_file", "replace"]
      }
    }
  }
}
```

Or simple output (comma-separated tool names sets mode to ANY):

```bash
echo "read_file,write_file,replace"
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

Hook configurations are applied in the following order of execution (lower
numbers run first):

1.  **Project settings:** `.gemini/settings.json` in your project directory
    (highest priority)
2.  **User settings:** `~/.gemini/settings.json`
3.  **System settings:** `/etc/gemini-cli/settings.json`
4.  **Extensions:** Internal hooks defined by installed extensions (lowest
    priority). See [Extensions documentation](../extensions/index.md#hooks) for
    details on how extensions define and configure hooks.

#### Deduplication and shadowing

If multiple hooks with the identical **name** and **command** are discovered
across different configuration layers, Gemini CLI deduplicates them. The hook
from the higher-priority layer (e.g., Project) will be kept, and others will be
ignored.

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

- **`name`** (string, recommended): Unique identifier for the hook used in
  `/hooks enable/disable` commands. If omitted, the `command` path is used as
  the identifier.
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

- All configured hooks organized by event
- Hook source (user, project, system)
- Hook type (command or plugin)
- Individual hook status (enabled/disabled)

### Enable and disable all hooks at once

You can enable or disable all hooks at once using commands:

```bash
/hooks enable-all
/hooks disable-all
```

These commands provide a shortcut to enable or disable all configured hooks
without managing them individually. The `enable-all` command removes all hooks
from the `hooks.disabled` array, while `disable-all` adds all configured hooks
to the disabled list. Changes take effect immediately without requiring a
restart.

### Enable and disable individual hooks

You can enable or disable individual hooks using commands:

```bash
/hooks enable hook-name
/hooks disable hook-name
```

These commands allow you to control hook execution without editing configuration
files. The hook name should match the `name` field in your hook configuration.
Changes made via these commands are persisted to your settings. The settings are
saved to workspace scope if available, otherwise to your global user settings
(`~/.gemini/settings.json`).

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
- Translates tool names (`Bash` → `run_shell_command`, `replace` → `replace`)
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

| Claude Code | Gemini CLI            |
| ----------- | --------------------- |
| `Bash`      | `run_shell_command`   |
| `Edit`      | `replace`             |
| `Read`      | `read_file`           |
| `Write`     | `write_file`          |
| `Glob`      | `glob`                |
| `Grep`      | `search_file_content` |
| `LS`        | `list_directory`      |

## Tool and Event Matchers Reference

### Available tool names for matchers

The following built-in tools can be used in `BeforeTool` and `AfterTool` hook
matchers:

#### File operations

- `read_file` - Read a single file
- `read_many_files` - Read multiple files at once
- `write_file` - Create or overwrite a file
- `replace` - Edit file content with find/replace

#### File system

- `list_directory` - List directory contents
- `glob` - Find files matching a pattern
- `search_file_content` - Search within file contents

#### Execution

- `run_shell_command` - Execute shell commands

#### Web and external

- `google_web_search` - Google Search with grounding
- `web_fetch` - Fetch web page content

#### Agent features

- `write_todos` - Manage TODO items
- `save_memory` - Save information to memory
- `delegate_to_agent` - Delegate tasks to sub-agents

#### Example matchers

```json
{
  "matcher": "write_file|replace" // File editing tools
}
```

```json
{
  "matcher": "read_.*" // All read operations
}
```

```json
{
  "matcher": "run_shell_command" // Only shell commands
}
```

```json
{
  "matcher": "*" // All tools
}
```

### Event-specific matchers

#### SessionStart event matchers

- `startup` - Fresh session start
- `resume` - Resuming a previous session
- `clear` - Session cleared

#### SessionEnd event matchers

- `exit` - Normal exit
- `clear` - Session cleared
- `logout` - User logged out
- `prompt_input_exit` - Exit from prompt input
- `other` - Other reasons

#### PreCompress event matchers

- `manual` - Manually triggered compression
- `auto` - Automatically triggered compression

#### Notification event matchers

- `ToolPermission` - Tool permission notifications

## Learn more

- [Writing Hooks](writing-hooks.md) - Tutorial and comprehensive example
- [Best Practices](best-practices.md) - Security, performance, and debugging
- [Custom Commands](../cli/custom-commands.md) - Create reusable prompt
  shortcuts
- [Configuration](../get-started/configuration.md) - Gemini CLI configuration
  options
- [Hooks Design Document](../hooks-design.md) - Technical architecture details
