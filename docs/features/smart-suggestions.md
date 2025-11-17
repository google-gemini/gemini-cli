# Smart Suggestions

Context-aware command suggestions that help you discover features and work more efficiently.

## Overview

Smart Suggestions analyzes your current context (git status, project type, recent activity) to recommend relevant commands and actions.

## Features

### Context Detection

Automatically detects:
- Git repository status (uncommitted changes, conflicts)
- Project type (Node.js, Python, React, etc.)
- Recent files you have worked with
- Command history patterns

### Suggestion Categories

- **Command** - Slash commands
- **Prompt** - Prompt templates
- **File** - File operations  
- **Workflow** - Workflow suggestions
- **Example** - Examples from library
- **Contextual** - Context-specific suggestions

## Usage

### View Suggestions

```bash
/suggest
```

Shows suggestions based on current context.

### Enable/Disable

```bash
/suggest enable
/suggest disable
```

### View Settings

```bash
/suggest settings
```

Shows preferences and statistics.

## Examples

### Git Context

When you have uncommitted changes:
```
💡 Commit your changes
You have uncommitted changes. Consider committing them.
```

### Project Context

In a Node.js project:
```
💡 Install dependencies
Install Node.js dependencies
Example: npm install
```

### First-Time User

```
💡 Run setup wizard
Configure Gemini CLI for your needs
Example: /wizard start
```

## Settings

- **enabled** - Enable/disable suggestions
- **minScore** - Minimum relevance score (0-1)
- **maxSuggestions** - Maximum suggestions to show
- **enabledCategories** - Which categories to show

## Statistics

Track suggestion effectiveness:
- Acceptance rate
- Total accepted/dismissed
- Most useful suggestions

## Related

- [Explain Mode](./explain-mode.md)
- [Example Library](./example-library.md)
