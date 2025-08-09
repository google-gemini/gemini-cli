# Plan Mode Implementation

## Overview

Plan Mode is a feature that allows users to have the Gemini CLI analyze and plan changes without actually executing file modifications. When in Plan Mode, the model focuses on understanding requirements, analyzing code, and providing detailed implementation plans rather than making direct changes.

## Features

### 🤖 **Intelligent Planning Prompts**
- Model receives specialized system instructions when in Plan Mode
- Emphasizes analysis, planning, and explanation over execution
- Provides detailed step-by-step implementation guidance

### 🚫 **Tool Restrictions**
- **Disabled in Plan Mode:**
  - `replace` (EditTool) - File editing
  - `write_file` (WriteFileTool) - File creation/writing
  
- **Available in Plan Mode:**
  - `read_file` - Reading file contents
  - `read_many_files` - Reading multiple files
  - `grep` - Searching file contents
  - `glob` - Finding files by pattern
  - `ls` - Listing directories
  - `save_memory` - Memory operations
  - `run_shell_command` - Safe, read-only shell commands

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
- **Tool Call Display**: In Plan Mode, tool calls are shown as JSON instead of executed
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

### Configuration Integration
- `Config.getIsPlanMode()` - Check current mode
- `Config.setIsPlanMode(boolean)` - Update mode
- Tool registry automatically excludes destructive tools in plan mode

### UI Integration
- `/plan` slash command toggles mode
- Footer displays current mode
- Tool calls shown as JSON in plan mode
- State synchronized across components

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