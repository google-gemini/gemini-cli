# Fine-Grained Command Access Control

Gemini CLI provides fine-grained control over which shell commands can be executed without confirmation prompts. This feature helps reduce interruptions while maintaining security.

## Table of Contents

- [Overview](#overview)
- [Configuration Methods](#configuration-methods)
- [Pattern Syntax](#pattern-syntax)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

By default, Gemini CLI asks for confirmation before executing any shell command. With the `allowCommands` feature, you can pre-approve certain commands to run without confirmation, streamlining your workflow while maintaining control over what commands can be executed.

### Key Features

- **Persistent Configuration**: Settings survive between sessions
- **Flexible Patterns**: Support for exact matches, wildcards, and regex
- **Multiple Scopes**: Global settings, project settings, and CLI flags
- **Session Learning**: Save approved commands from your current session

## Configuration Methods

### 1. Settings File (Recommended)

Add allowed commands to your settings file:

**Project-specific** (`.gemini/settings.json`):
```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "git status",
    "git log",
    "npm test"
  ]
}
```

**Global** (`~/.gemini/settings.json`):
```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "echo"
  ]
}
```

### 2. Command Line Flag

Use the `--allow-commands` flag for temporary overrides:

```bash
gemini --allow-commands 'ls,pwd,git status,npm test'
```

**Note**: CLI flags override all settings files.

### 3. Interactive Session

Use the `/pushcmdz` command to save commands you've approved during your session:

```
> /pushcmdz
Saved 3 command(s) to project settings:
  - ls
  - git
  - npm
Total allowed commands: 5
```

## Pattern Syntax

The `allowCommands` feature supports three types of patterns:

### 1. Exact Match

Simple string matching - the command root must match exactly.

```json
{
  "allowCommands": [
    "ls",           // Matches: ls, ls -la, ls --help
    "git status",   // Matches: git status (exact)
    "npm"          // Matches: npm, npm install, npm test
  ]
}
```

### 2. Glob Patterns

Use `*` and `?` for flexible matching:

- `*` matches any number of characters
- `?` matches exactly one character

```json
{
  "allowCommands": [
    "git*",         // Matches: git, gitk, github
    "npm*",         // Matches: npm, npmx, npm-check
    "*.js",         // Matches: test.js, script.js
    "test?",        // Matches: test1, testA (but not test or test12)
    "docker-*"      // Matches: docker-compose, docker-build
  ]
}
```

### 3. Regular Expressions

For complex patterns, use regex enclosed in forward slashes:

```json
{
  "allowCommands": [
    "/^ls$/",                    // Matches only 'ls' exactly
    "/^git\\s+(status|log)$/",   // Matches: git status, git log
    "/^npm\\s+(test|install)$/",  // Matches: npm test, npm install
    "/^make\\s+/",               // Matches: make followed by anything
    "/^(cat|head|tail)\\s+/"     // Matches: cat, head, or tail with arguments
  ]
}
```

**Important**: In JSON, backslashes must be escaped (`\\s` instead of `\s`).

## Examples

### Basic Development Workflow

```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "cd",
    "git status",
    "git diff",
    "git log",
    "npm test",
    "npm run",
    "echo"
  ]
}
```

### Node.js Project

```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "node",
    "npm*",
    "yarn*",
    "/^(jest|mocha|vitest)/"
  ]
}
```

### DevOps Workflow

```json
{
  "allowCommands": [
    "docker*",
    "kubectl get*",
    "terraform plan",
    "/^aws\\s+.*--dry-run/",
    "/^helm\\s+(list|status)/"
  ]
}
```

### Read-Only Commands

```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "find",
    "grep",
    "cat",
    "head",
    "tail",
    "wc",
    "du",
    "df",
    "/^git\\s+(status|log|diff|show)$/",
    "/^docker\\s+(ps|images|logs)$/"
  ]
}
```

## Best Practices

### 1. Start Conservative

Begin with a minimal set of commands and expand as needed:

```json
{
  "allowCommands": ["ls", "pwd", "echo"]
}
```

### 2. Use Specific Patterns

Prefer specific patterns over broad wildcards:

```json
{
  // Good: Specific git commands
  "allowCommands": [
    "git status",
    "git log",
    "git diff"
  ]
}

{
  // Risky: All git commands
  "allowCommands": ["git*"]
}
```

### 3. Separate Read and Write Operations

Consider separating read-only commands from potentially destructive ones:

```json
{
  "allowCommands": [
    // Safe read operations
    "ls",
    "cat",
    "grep",
    "find",
    
    // Specific write operations
    "git commit",
    "npm install"
    
    // Avoid broad patterns like:
    // "rm*", "git*", "chmod*"
  ]
}
```

### 4. Use Project-Specific Settings

Keep project-specific commands in `.gemini/settings.json`:

```json
{
  "allowCommands": [
    "npm test",
    "npm run build",
    "npm run lint",
    "./scripts/deploy.sh --dry-run"
  ]
}
```

### 5. Review Periodically

Use `/pushcmdz` to review and update your allowed commands:

1. Work normally for a few sessions
2. Run `/pushcmdz` to see what commands you commonly use
3. Review and remove any that shouldn't be auto-approved

## Security Considerations

### What allowCommands Does NOT Do

- **No argument validation**: Only the command root is checked
- **No context awareness**: Commands are approved regardless of directory
- **No semantic understanding**: `rm` and `rm -rf /` are treated the same
- **No privilege escalation protection**: `sudo` commands follow the same rules

### Potential Risks

1. **Over-broad patterns**: `git*` allows `git push --force`
2. **Command injection**: Approved commands can still be dangerous with certain arguments
3. **Directory traversal**: Commands can operate outside the project directory
4. **Sudo escalation**: If `sudo` is allowed, any command can be run with privileges

### Mitigation Strategies

1. **Avoid wildcards for dangerous commands**:
   ```json
   {
     // Don't do this:
     "allowCommands": ["rm*", "sudo*", "chmod*"]
   }
   ```

2. **Use regex for precise control**:
   ```json
   {
     "allowCommands": [
       "/^rm\\s+.*\\.tmp$/",        // Only .tmp files
       "/^git\\s+push\\s+origin$/"  // Only safe pushes
     ]
   }
   ```

3. **Combine with excludeTools**:
   ```json
   {
     "allowCommands": ["git*"],
     "excludeTools": ["ShellTool(git push --force)"]
   }
   ```

## Troubleshooting

### Commands Still Require Confirmation

1. **Check pattern syntax**:
   - Exact matches are case-sensitive
   - Glob patterns need proper wildcards
   - Regex patterns must be valid

2. **Verify configuration loading**:
   ```bash
   # Check which settings file is being used
   cat .gemini/settings.json
   cat ~/.gemini/settings.json
   ```

3. **Command root extraction**:
   - Full paths are reduced to command name: `/usr/bin/ls` → `ls`
   - Complex commands use first element: `ls -la | grep test` → `ls`

### Pattern Not Matching

1. **Test your patterns**:
   ```json
   {
     "allowCommands": [
       "git",          // Test with simple exact match
       "git*",         // Then try glob
       "/^git\\s+/"    // Finally regex
     ]
   }
   ```

2. **Check for special characters**:
   - JSON requires escaping: `\s` → `\\s`
   - Regex slashes are literal: `/pattern/`

### Debugging Tips

1. **Start with exact matches**: Easier to debug
2. **Use verbose patterns**: `/^npm\\s+test$/` instead of `npm*`
3. **Check the Gemini CLI output**: Invalid patterns show warnings
4. **Test incrementally**: Add one pattern at a time

## Advanced Usage

### Combining with Other Features

1. **With YOLO mode**: `allowCommands` still applies in YOLO mode as an extra safety layer

2. **With excludeTools**: Exclusions take precedence over allowCommands

3. **With coreTools**: allowCommands provides an additional approval mechanism

### Environment-Specific Configuration

Use environment variables in patterns (requires custom implementation):

```json
{
  "allowCommands": [
    "deploy-${ENVIRONMENT}",
    "terraform-${WORKSPACE}"
  ]
}
```

### Migration from Session Whitelist

If you've been using Gemini CLI without allowCommands:

1. Work normally for a typical session
2. Run `/pushcmdz` to capture your common commands
3. Review and edit `.gemini/settings.json`
4. Remove any overly permissive patterns

## FAQ

**Q: What's the precedence order?**
A: CLI flags > Project settings > Global settings > Session whitelist

**Q: Can I use allowCommands with YOLO mode?**
A: Yes, but YOLO mode bypasses all confirmations regardless of allowCommands.

**Q: Are patterns case-sensitive?**
A: Yes, all patterns are case-sensitive.

**Q: How do I allow all commands?**
A: This is not recommended. Use YOLO mode if you need to bypass all confirmations.

**Q: Can I deny specific commands?**
A: Use the `excludeTools` setting to block specific commands.

**Q: Do patterns apply to command arguments?**
A: No, only the command root is matched. Arguments are not validated.