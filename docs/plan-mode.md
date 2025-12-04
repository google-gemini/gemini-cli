# Plan Mode Implementation

## Overview

Plan Mode is a feature that allows users to have the Gemini CLI analyze and plan
changes without actually executing file modifications. When in Plan Mode, the
model focuses on understanding requirements, analyzing code, and providing
detailed implementation plans rather than making direct changes.

## Features

### 🤖 **Intelligent Planning Prompts**

- Model receives specialized system instructions when in Plan Mode
- Emphasizes analysis, planning, and explanation over execution
- Provides detailed step-by-step implementation guidance

### 🚫 **Tool Restrictions**

- **Disabled in Plan Mode:**
  - `replace` (EditTool) - File editing
  - `write_file` (WriteFileTool) - File creation/writing
  - `write_todos` (WriteTodosTool) - Todo file creation
  - `run_shell_command` (ShellTool) - Shell command execution
  - All MCP server tools - Cannot verify safety of external tools
  - All discovered tools - Cannot verify safety of custom tools
- **Available in Plan Mode:**
  - `read_file` - Reading file contents
  - `read_many_files` - Reading multiple files
  - `search_file_content` (grep) - Searching file contents
  - `glob` - Finding files by pattern
  - `list_directory` (ls) - Listing directories
  - `save_memory` - Memory operations
  - `web_fetch` - Fetching web content
  - `google_web_search` - Web searching

### 💬 **Enhanced Communication**

- Model describes what actions it would take instead of executing them
- Provides detailed explanations of planned changes
- Offers step-by-step implementation guidance
- Shows tool calls as JSON for transparency

## Usage

### Toggle Plan Mode

```bash
# In the Gemini CLI, type:
/plan
```

### Mode Indicators

- **Footer Display**: Shows "Plan Mode" or "Agent Mode"
- **Tool Call Display**: In Plan Mode, tool calls are shown as JSON instead of
  executed
- **Confirmation Messages**: "Plan mode enabled/disabled" when toggling

## Example Workflow

### Agent Mode (Default)

```
User: "Add error handling to the login function"
Model: [Executes read_file, then edit tools to make actual changes]
```

### Plan Mode

```
User: "Add error handling to the login function"
Model: "To implement error handling for the login function, I would:

1. Use 'read_file' to examine the current login function implementation
2. Use 'edit' to modify the function at lines 45-60 to add try-catch blocks
3. Use 'write_file' to create comprehensive error handling tests
4. Use 'run_shell_command' to run the test suite to verify the changes

The specific changes would include:
- Wrapping authentication calls in try-catch
- Adding specific error types for different failure scenarios
- Implementing user-friendly error messages
- Adding logging for debugging purposes"
```

## Technical Implementation

### System Prompt Enhancement

- `getCoreSystemPrompt()` - Standard agent mode
- `getPlanModeSystemPrompt()` - Enhanced planning mode with restrictions
- Prompts instruct model on tool availability and planning behavior

### Tool Filtering Architecture

**Primary Enforcement (Tool Registry Level):**

- `packages/core/src/tools/tool-types.ts` - Defines destructive vs read-only
  tools
- `isDestructiveTool(toolName)` - Centralized safety classification
- `ToolRegistry.getFunctionDeclarations()` - Filters tool declarations before
  sending to model
- Destructive tools not declared to model in plan mode (hard enforcement)
- MCP and discovered tools excluded in plan mode (cannot verify safety)

**Secondary Protection (UI Level):**

- `useGeminiStream` - Blocks tool execution if plan mode active
- Displays tool calls as JSON instead of executing
- Defense-in-depth approach ensures safety

### Configuration Integration

- `Config.getIsPlanMode()` - Check current mode
- `Config.setIsPlanMode(boolean)` - Update mode
- State synchronized between core config and UI state

### UI Integration

- `/plan` slash command toggles mode
- Footer displays current mode ("Plan Mode" or "Agent Mode")
- Tool calls shown as JSON in plan mode
- State synchronized across components via UIStateContext

## Benefits

1. **Safe Exploration**: Analyze codebases without risk of unwanted changes
2. **Learning**: Understand what changes would be made before execution
3. **Planning**: Get detailed implementation strategies
4. **Review**: See exactly what tools would be called and why
5. **Collaboration**: Share plans with team members before implementation

## Best Practices

- Use Plan Mode when exploring unfamiliar codebases
- Switch to Plan Mode before major refactoring to understand scope
- Use for code reviews and understanding complex changes
- Toggle to Agent Mode when ready to implement planned changes

## Future Enhancements

Potential improvements for future iterations:

1. **Dynamic System Prompt Updates**
   - Currently requires chat restart after toggling modes
   - Future: Update system prompt mid-session without restart

2. **Granular Shell Command Filtering**
   - Currently blocks all shell commands in plan mode
   - Future: Allow verified safe commands (e.g., `git status`, `ls`, `find`)
   - Implement command pattern matching for safety verification

3. **MCP Tool Safety Verification**
   - Currently blocks all MCP tools in plan mode
   - Future: Allow MCP servers to declare tool safety levels
   - Support read-only MCP tool categories

4. **Visual Feedback Improvements**
   - Add toast notifications on mode toggle
   - Show which tools are filtered in current mode
   - Display tool availability status in help/docs

5. **Persistence**
   - Remember plan mode preference across sessions
   - Per-project plan mode defaults

6. **Advanced Planning Features**
   - Cost estimation for planned changes
   - Impact analysis before execution
   - Diff preview generation
