# Hooks

Hooks allow you to execute custom shell scripts at specific points in the Gemini
CLI lifecycle. This enables powerful customizations like audit logging, context
injection, tool filtering, and integration with external systems.

## Quick Start

### 1. Enable Hooks

In `~/.gemini/settings.json`:

```json
{
  "tools": {
    "enableHooks": true
  }
}
```

### 2. Configure a Hook

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.gemini/hooks/my-hook.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 3. Create the Hook Script

```bash
#!/bin/bash
# ~/.gemini/hooks/my-hook.sh

# Read JSON input from stdin
INPUT=$(cat)

# Parse event name
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')

# Log to file
echo "[$(date)] Event: $EVENT" >> /tmp/gemini_hooks.log

# Output valid JSON
echo '{"continue": true}'
```

Make it executable:

```bash
chmod +x ~/.gemini/hooks/my-hook.sh
```

## Hook Events

| Event                 | When It Fires                     | Key Input Fields                           |
| --------------------- | --------------------------------- | ------------------------------------------ |
| `SessionStart`        | CLI starts up, resumes, or clears | `source`                                   |
| `SessionEnd`          | CLI exits                         | `reason`                                   |
| `BeforeAgent`         | Before processing user prompt     | `prompt`                                   |
| `AfterAgent`          | After agent responds              | `prompt`, `prompt_response`                |
| `BeforeTool`          | Before a tool executes            | `tool_name`, `tool_input`                  |
| `AfterTool`           | After a tool completes            | `tool_name`, `tool_input`, `tool_response` |
| `PreCompress`         | Before context compression        | `trigger`                                  |
| `BeforeModel`         | Before LLM API call               | `llm_request`                              |
| `AfterModel`          | After LLM API response            | `llm_request`, `llm_response`              |
| `BeforeToolSelection` | Before tool selection             | `llm_request`                              |

## Hook Input Format

All hooks receive JSON via stdin with these common fields:

```json
{
  "session_id": "abc123...",
  "transcript_path": "/path/to/session.json",
  "cwd": "/current/working/directory",
  "hook_event_name": "BeforeAgent",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

Plus event-specific fields (see table above).

## Hook Output Format

Hooks should output JSON to stdout:

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Optional reason text",
  "systemMessage": "Message to display to user"
}
```

### Exit Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | Success                    |
| `1`  | Warning (non-blocking)     |
| `2`  | Blocking error (deny/stop) |

## Configuration Structure

```json
{
  "hooks": {
    "[EventName]": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "path/to/script.sh",
            "timeout": 60000,
            "enabled": true
          }
        ],
        "matcher": "pattern",
        "sequential": false
      }
    ]
  }
}
```

### Fields

| Field        | Type    | Description                              |
| ------------ | ------- | ---------------------------------------- |
| `type`       | string  | Always `"command"`                       |
| `command`    | string  | Path to script or shell command          |
| `timeout`    | number  | Timeout in milliseconds (default: 60000) |
| `enabled`    | boolean | Enable/disable this hook (default: true) |
| `matcher`    | string  | Pattern for tool-related hooks (regex)   |
| `sequential` | boolean | Run hooks sequentially vs parallel       |

## Tool Name Reference

For `BeforeTool` and `AfterTool` hooks, use these tool names in matchers:

| Tool              | Name in Gemini CLI    |
| ----------------- | --------------------- |
| File editing      | `replace`             |
| File writing      | `write_file`          |
| File reading      | `read_file`           |
| Shell commands    | `run_shell_command`   |
| Todo lists        | `write_todos`         |
| File globbing     | `glob`                |
| Content search    | `search_file_content` |
| Directory listing | `list_directory`      |
| Web fetch         | `web_fetch`           |
| Web search        | `google_web_search`   |

### Matcher Examples

```json
{
  "AfterTool": [
    {
      "hooks": [
        { "type": "command", "command": "~/.gemini/hooks/log-edits.sh" }
      ],
      "matcher": "replace|write_file"
    },
    {
      "hooks": [
        { "type": "command", "command": "~/.gemini/hooks/log-shell.sh" }
      ],
      "matcher": "run_shell_command"
    }
  ]
}
```

## Migrating from Claude Code

### Automatic Migration

```bash
gemini hooks migrate
```

This command:

1. Reads your `~/.claude/settings.json`
2. Transforms event names and tool matchers
3. Converts timeouts (seconds → milliseconds)
4. Updates script paths (`.claude/hooks` → `.gemini/hooks`)
5. Saves to `~/.gemini/settings.json`

### Event Name Mapping

| Claude Code        | Gemini CLI     |
| ------------------ | -------------- |
| `UserPromptSubmit` | `BeforeAgent`  |
| `PostToolUse`      | `AfterTool`    |
| `Stop`             | `AfterAgent`   |
| `PreCompact`       | `PreCompress`  |
| `SessionStart`     | `SessionStart` |
| `SessionEnd`       | `SessionEnd`   |

### Tool Name Mapping

| Claude Code | Gemini CLI            |
| ----------- | --------------------- |
| `Edit`      | `replace`             |
| `MultiEdit` | `replace`             |
| `Write`     | `write_file`          |
| `Read`      | `read_file`           |
| `Bash`      | `run_shell_command`   |
| `TodoWrite` | `write_todos`         |
| `Glob`      | `glob`                |
| `Grep`      | `search_file_content` |

### Field Name Differences

| Concept    | Claude Code | Gemini CLI            |
| ---------- | ----------- | --------------------- |
| User input | `.message`  | `.prompt`             |
| Event name | N/A         | `.hook_event_name`    |
| Tool name  | Same        | Different (see table) |

### Compatibility Shim

For existing Claude Code scripts, use the compatibility shim:

```bash
#!/bin/bash
source ~/.gemini/hooks/utils/claude-compat-shim.sh

# Now use normalized variables:
echo "User message: $USER_MESSAGE"
echo "Session ID: $SESSION_ID"
echo "Event: $HOOK_EVENT_NAME"
echo "Tool (normalized): $TOOL_NAME_NORMALIZED"
```

The shim provides:

- `$USER_MESSAGE` - Works with both `.message` (Claude) and `.prompt` (Gemini)
- `$TOOL_NAME_NORMALIZED` - Maps Gemini tool names to Claude-style names
- Helper functions: `hook_success()`, `hook_block()`, `hook_warn()`

## Examples

### Audit Logger

Log all tool executions:

```bash
#!/bin/bash
# ~/.gemini/hooks/audit-logger.sh

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "N/A"')

echo "[$(date)] $EVENT - Tool: $TOOL" >> /tmp/gemini_audit.log
echo '{"continue": true}'
```

### Context Injector

Add project context to prompts:

```bash
#!/bin/bash
# ~/.gemini/hooks/inject-context.sh

INPUT=$(cat)

# Read project context
if [ -f ".gemini/context.md" ]; then
  CONTEXT=$(cat .gemini/context.md)
  echo "{\"continue\": true, \"hookSpecificOutput\": {\"additionalContext\": \"$CONTEXT\"}}"
else
  echo '{"continue": true}'
fi
```

### Tool Guardian

Block dangerous commands:

```bash
#!/bin/bash
# ~/.gemini/hooks/tool-guard.sh

INPUT=$(cat)
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Block rm -rf commands
if echo "$TOOL_INPUT" | grep -q 'rm.*-rf'; then
  echo '{"decision": "block", "reason": "Dangerous rm -rf command blocked"}'
  exit 2
fi

echo '{"continue": true}'
```

## Hook Commands

Manage hooks with these CLI commands:

```bash
# List all configured hooks
gemini hooks list

# Disable a hook
gemini hooks disable "~/.gemini/hooks/my-hook.sh"

# Enable a disabled hook
gemini hooks enable "~/.gemini/hooks/my-hook.sh"

# Migrate from Claude Code
gemini hooks migrate
```

## Debugging

### Test Your Hook

```bash
# Manually test with sample input
echo '{"hook_event_name": "BeforeAgent", "prompt": "test", "session_id": "123", "cwd": "/tmp", "timestamp": "2025-01-01T00:00:00Z"}' | ~/.gemini/hooks/my-hook.sh
```

### View Hook Execution

Check the debug log for hook execution details:

```bash
# Enable debug mode
export DEBUG=gemini:*

# Or check hook output in your script
tail -f /tmp/gemini_hooks.log
```

### Common Issues

1. **Hook not firing**: Ensure `tools.enableHooks: true` in settings
2. **"UnknownEvent" logged**: Read event name from JSON stdin, not command args
3. **Permission denied**: Make script executable with `chmod +x`
4. **Timeout errors**: Increase `timeout` value or optimize script
5. **Matcher not working**: Use Gemini tool names (e.g., `replace` not `Edit`)

## Environment Variables

Hooks have access to these environment variables:

| Variable                                  | Description               |
| ----------------------------------------- | ------------------------- |
| `GEMINI_PROJECT_DIR`                      | Current working directory |
| `CLAUDE_PROJECT_DIR`                      | Same (for compatibility)  |
| Plus all existing `process.env` variables |
