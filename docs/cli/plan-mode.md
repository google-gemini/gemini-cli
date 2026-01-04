# Plan Mode

Plan Mode is a specialized mode that enforces a "Think, Research, Plan" workflow
before making any code modifications. When enabled, Gemini CLI restricts the
agent to read-only tools, encouraging thorough research and structured planning
before implementation.

## Overview

Plan Mode helps you:

- **Research thoroughly** - The agent can read files, search code, and gather
  context without accidentally modifying anything
- **Plan before implementing** - Get a clear implementation plan reviewed and
  approved before any code changes
- **Work in parallel** - Read-only tools run without confirmation, enabling
  efficient parallel exploration
- **Save and resume plans** - Store implementation plans for later execution or
  reference

## Entering Plan Mode

### Keyboard Toggle

Press **Shift+Tab** to cycle through approval modes:

1. **Default** - Standard mode with confirmation prompts
2. **Auto Edit** - Automatically approve file edits
3. **Planning Mode** - Read-only mode for research and planning

When Plan Mode is active, you'll see a blue **"planning mode"** indicator in the
status bar.

### Command Line

You can start a session directly in Plan Mode:

```bash
gemini --approval-mode plan
```

## How Plan Mode Works

### Allowed Tools (Auto-Approved)

The following tools run without user confirmation in Plan Mode:

| Tool                  | Purpose                                |
| --------------------- | -------------------------------------- |
| `read_file`           | Read individual files                  |
| `read_many_files`     | Read multiple files at once            |
| `search_file_content` | Search code with grep/ripgrep          |
| `glob`                | Find files by pattern                  |
| `list_directory`      | List directory contents                |
| `web_fetch`           | Fetch web content for research         |
| `google_web_search`   | Search the web                         |
| `delegate_to_agent`   | Delegate to sub-agents for exploration |
| `present_plan`        | Present completed implementation plan  |
| `write_todos`         | Track planning progress                |

### Blocked Tools (Denied)

These tools are blocked to prevent modifications:

| Tool                | Reason                      |
| ------------------- | --------------------------- |
| `replace`           | Modifies file contents      |
| `write_file`        | Creates or overwrites files |
| `run_shell_command` | Could modify system state   |
| `save_memory`       | Modifies persistent memory  |

### System Prompt

When Plan Mode is active, the agent receives specialized instructions that
emphasize:

- Research the codebase thoroughly before proposing changes
- Use parallel tool calls for efficient exploration
- Create detailed, actionable implementation plans
- Present plans using the `present_plan` tool

## Managing Plans

### The `/plan` Command

Plan Mode includes a command for managing saved implementation plans:

#### List Plans

```
/plan list
```

Shows all saved plans with their titles, dates, and status
(draft/saved/executed).

#### View a Plan

```
/plan view <title>
```

Displays the full content of a saved plan. Supports partial title matching.

#### Resume/Execute a Plan

```
/plan resume <title>
```

Loads a saved plan and switches to Auto Edit mode for implementation. The plan
content is injected as context for the agent.

#### Delete a Plan

```
/plan delete <title>
```

Removes a saved plan from the `.gemini/plans/` directory.

### Plan Storage

Plans are stored as Markdown files with YAML frontmatter in:

```
.gemini/plans/plan-<timestamp>-<id>.md
```

Each plan file contains:

- **Metadata**: Title, creation date, status, original prompt
- **Content**: The implementation plan in Markdown format

## The `present_plan` Tool

When the agent completes its research in Plan Mode, it uses the `present_plan`
tool to present the implementation plan. This tool accepts:

| Parameter        | Description                                       |
| ---------------- | ------------------------------------------------- |
| `title`          | Short descriptive title for the plan              |
| `content`        | Full implementation plan in Markdown              |
| `affected_files` | List of files that will be created or modified    |
| `dependencies`   | Shell commands to run first (e.g., `npm install`) |

After presenting a plan, you can:

1. **Save it**: Use `/plan save <title>` to store for later
2. **Execute it**: Press Shift+Tab to switch to Auto Edit mode
3. **Refine it**: Provide feedback to improve the plan
4. **Cancel**: Start over with a different approach

## Best Practices

### 1. Start with a Clear Goal

When entering Plan Mode, provide a clear description of what you want to
accomplish. For example:

```
Add a dark mode toggle to the settings page
```

### 2. Let the Agent Research

Allow the agent to read files and search the codebase. The auto-approved
read-only tools enable efficient parallel exploration without interruption.

### 3. Review the Plan

When the agent presents a plan, review:

- **Affected files**: Are these the right files to modify?
- **Dependencies**: Are there prerequisites to install?
- **Implementation steps**: Is the approach sound?

### 4. Save Complex Plans

For large implementations, save the plan before executing:

```
/plan save dark-mode-implementation
```

This lets you resume later if the implementation is interrupted.

### 5. Execute with Context

When you're ready to implement, the plan content becomes context for the agent,
ensuring it follows the researched approach.

## Example Workflow

1. **Enter Plan Mode**

   ```
   Press Shift+Tab until you see "planning mode"
   ```

2. **Describe the Task**

   ```
   Add user authentication with JWT tokens
   ```

3. **Agent Researches**
   - Reads existing auth code
   - Searches for user model
   - Checks dependencies

4. **Agent Presents Plan**
   - Lists files to modify
   - Shows implementation steps
   - Notes dependencies

5. **Save or Execute**
   ```
   /plan save jwt-auth
   # or
   Press Shift+Tab to switch to Auto Edit mode
   ```

## Troubleshooting

### Agent Tries to Modify Files

If you see "Tool denied" messages, Plan Mode is working correctly. The agent
cannot modify files until you switch modes.

### Tools Still Require Confirmation

In Plan Mode, read-only tools should run without confirmation. If you're still
seeing prompts, check that Plan Mode is active (blue "planning mode" indicator).

### Plan Not Saved

Plans are only saved when you explicitly use `/plan save`. The agent's
`present_plan` tool displays the plan but doesn't persist it.

## Related Documentation

- [Commands](./commands.md) - All available CLI commands
- [Keyboard Shortcuts](./keyboard-shortcuts.md) - Navigation and mode switching
- [Configuration](./configuration.md) - Approval mode settings
