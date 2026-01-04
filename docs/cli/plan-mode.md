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

| Tool                | Reason                               |
| ------------------- | ------------------------------------ |
| `replace`           | Modifies file contents               |
| `write_file`        | Creates or overwrites files          |
| `run_shell_command` | Could modify system state            |
| `save_memory`       | Modifies persistent memory           |
| All MCP tools       | External tools may have side effects |

> **Note:** All MCP (external) tools are blocked in Plan Mode regardless of
> their function. This ensures a fully read-only research environment.

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
(draft/saved/executed). The most recently viewed plan is marked with
`[last viewed]` to help you quickly find the plan you were just looking at.

#### View a Plan

```
/plan view <title>
```

Displays the full content of a saved plan. Supports partial title matching.
Viewing a plan marks it as "last viewed" so you can easily find it again.

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

#### Export a Plan

```
/plan export <title> <filename>
```

Exports the plan content (without metadata) to a file in your current working
directory. This is useful for:

- Moving a plan into your project as documentation
- Sharing a plan with team members
- Creating a permanent record of the implementation approach

**Tip:** Use `/plan view <title>` first to preview a plan, then
`/plan export <title> plan.md` to save it. The `[last viewed]` indicator in
`/plan list` helps you remember which plan you just looked at.

### Plan Storage

Plans are stored locally in your project's `.gemini/plans/` directory:

```
.gemini/plans/plan-<timestamp>-<id>.md
```

> **Note:** Plans are project-specific. They are stored in the `.gemini/` folder
> within your current working directory, not in a global location. This means
> plans created in one project are not visible from another project.

#### Plan File Format

Each plan file is a Markdown document with YAML frontmatter containing metadata:

```markdown
---
id: plan-1704312000000-abc123
title: Add user authentication
createdAt: 2025-01-03T12:00:00.000Z
updatedAt: 2025-01-03T12:05:00.000Z
status: draft
originalPrompt: Add user authentication with JWT tokens
lastViewed: 2025-01-03T12:10:00.000Z
---

## Implementation Steps

1. Create auth middleware...
```

#### Plan Status Lifecycle

Plans have three possible statuses:

| Status     | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `draft`    | Auto-saved when the agent presents a plan (before user action) |
| `saved`    | User explicitly chose "Save" to keep the plan for later        |
| `executed` | User chose "Execute" and implementation began                  |

#### Auto-Save Behavior

When the agent calls the `present_plan` tool, the plan is **automatically saved
as a draft** before the completion dialog appears. This ensures:

- Your plan is preserved if the session is interrupted
- You can resume later with `/plan resume <title>`
- Draft plans appear in `/plan list` with `[draft]` status

## The `present_plan` Tool

When the agent completes its research in Plan Mode, it uses the `present_plan`
tool to present the implementation plan. This tool accepts:

| Parameter        | Description                                       |
| ---------------- | ------------------------------------------------- |
| `title`          | Short descriptive title for the plan              |
| `content`        | Full implementation plan in Markdown              |
| `affected_files` | List of files that will be created or modified    |
| `dependencies`   | Shell commands to run first (e.g., `npm install`) |

When the agent presents a plan, a dialog will automatically appear with options:

1. **Execute**: Switch to Auto Edit mode and start implementing the plan
2. **Save**: Save the plan for later execution (status changes to 'saved')
3. **Refine**: Opens an inline text input where you can type feedback to improve
   the plan. Press Enter to submit, or Esc to go back to the options.
4. **Cancel**: Discard the plan and return to the prompt

Plans are automatically saved as drafts when presented, so your work is
preserved even if the session is interrupted.

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

For large implementations, choose "Save" when the plan completion dialog
appears. This changes the plan status from 'draft' to 'saved', making it easy to
find later:

```
/plan list   # Shows all saved plans
/plan resume dark-mode   # Resume a saved plan
```

Plans are auto-saved as drafts when presented, so your work is never lost.

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

5. **Choose Action from Dialog**
   - **Execute**: Starts implementation immediately (switches to Auto Edit)
   - **Save**: Marks plan as 'saved' for later
   - **Refine**: Type feedback inline to improve the plan
   - **Cancel**: Discard and start over

## Troubleshooting

### Agent Tries to Modify Files

If you see "Tool denied" messages, Plan Mode is working correctly. The agent
cannot modify files until you switch modes.

### Tools Still Require Confirmation

In Plan Mode, read-only tools should run without confirmation. If you're still
seeing prompts, check that Plan Mode is active (blue "planning mode" indicator).

### Plan Not Appearing in List

Plans are auto-saved as drafts when the agent calls `present_plan`. If a plan
doesn't appear in `/plan list`, the agent may not have completed the planning
phase. Check that the agent called the `present_plan` tool successfully.

## Related Documentation

- [Commands](./commands.md) - All available CLI commands
- [Keyboard Shortcuts](./keyboard-shortcuts.md) - Navigation and mode switching
- [Configuration](./configuration.md) - Approval mode settings
