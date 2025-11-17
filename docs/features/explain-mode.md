# Explain Mode

Understand how Gemini works by seeing explanations of tool usage and reasoning.

## Overview

Explain Mode provides transparency into what Gemini is doing, why it is using specific tools, and educational tips to help you learn.

## Features

### Tool Explanations

See what each tool does:
- **Purpose** - What the tool accomplishes
- **Reason** - Why Gemini chose this tool
- **Input** - What data is provided
- **Tips** - Best practices

### Verbosity Levels

**Brief** - One-sentence explanations

**Normal** - Balanced detail (recommended)

**Detailed** - Comprehensive with examples

### Educational Tips

Learn best practices:
- Getting started tips
- Performance optimizations
- Security best practices
- Productivity shortcuts

## Usage

### Enable/Disable

```bash
/explain on   # Enable
/explain off  # Disable
/explain      # Toggle
```

### Set Verbosity

```bash
/explain brief
/explain normal
/explain detailed
```

### View Status

```bash
/explain status
```

Shows current settings and usage statistics.

### View History

```bash
/explain history
/explain history 20  # Last 20 explanations
```

## Examples

### Tool Explanation

```
📖 Explanation

Request: Read src/app.ts
Approach: Reading file to analyze contents

Tools Used:
- read-file: Reads file contents
  Why: To analyze the file

💡 Tips:
- Use @ syntax for quick file references
```

### Detailed Mode

```
📖 Explanation

Request: Create new component
Approach: Generate React component with TypeScript

Tools Used:
- glob: Finds files by pattern
  Why: Locate existing components for consistency
  
- read-file: Reads file contents
  Why: Understand current code style
  
- write-file: Creates or updates files
  Why: Create the new component file

Reasoning:
1. Search for existing components
   Ensures naming and structure consistency
2. Read component examples
   Maintains code style across project
3. Generate new component
   Creates TypeScript React component

💡 Tips:
- Review generated files before using them
- Gemini follows project conventions
```

## Settings

- **enabled** - Turn explain mode on/off
- **verbosity** - Brief, normal, or detailed
- **showTips** - Include educational tips
- **showReasoning** - Show step-by-step reasoning
- **showTools** - Display tool usage

## Statistics

Track learning progress:
- Total explanations viewed
- Tips shown
- Most used tools

## Best Practices

✅ **Do:**
- Enable for learning
- Use normal verbosity
- Read tips

❌ **Don't:**
- Leave on if explanations are overwhelming
- Use detailed mode for simple tasks

## Related

- [Smart Suggestions](./smart-suggestions.md)
- [Tutorial Mode](../get-started/tutorials.md)
