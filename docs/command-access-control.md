# Command Access Control: allowCommands & denyCommands

## Overview

Gemini CLI provides fine-grained access control for shell commands through two complementary features:

- **`allowCommands`**: Pre-approve specific commands to run without confirmation
- **`denyCommands`**: Always require confirmation for specific dangerous commands

These features help balance workflow efficiency with security. The `denyCommands` list always takes precedence over `allowCommands`, ensuring dangerous commands remain protected even if they match an allow pattern.

## Table of Contents

- [Configuration Methods](#configuration-methods)
- [Pattern Syntax](#pattern-syntax)
- [Precedence Rules](#precedence-rules)
- [Examples](#examples)
- [Slash Commands](#slash-commands)
- [Best Practices](#best-practices)
- [Security Considerations](#security-considerations)

## Configuration Methods

### 1. Settings Files

**Project Settings** (`.gemini/settings.json`):
```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "git status",
    "npm test"
  ],
  "denyCommands": [
    "rm -rf",
    "sudo*",
    "chmod 777"
  ]
}
```

**Global Settings** (`~/.gemini/settings.json`):
```json
{
  "allowCommands": [
    "ls",
    "echo",
    "cat"
  ],
  "denyCommands": [
    "sudo*",
    "rm -rf /*"
  ]
}
```

### 2. Command Line Flags

```bash
# Allow specific commands
gemini --allow-commands 'ls,pwd,git status'

# Deny specific commands
gemini --deny-commands 'rm -rf,sudo*'

# Use both together
gemini --allow-commands 'git*,npm*' --deny-commands 'git push --force,npm publish'
```

### 3. Configuration Precedence

1. CLI flags (highest priority)
2. Project settings (`.gemini/settings.json`)
3. Global settings (`~/.gemini/settings.json`)

## Pattern Syntax

Both `allowCommands` and `denyCommands` support three pattern types:

### 1. Exact Match (Default)

```json
"ls"          → matches only "ls"
"git status"  → matches only "git status"
```

### 2. Glob Patterns (* and ?)

```json
"git*"        → matches: git, gitk, github
"npm*"        → matches: npm, npmx, npm-check
"test?"       → matches: test1, testA (single character)
"*.sh"        → matches: script.sh, deploy.sh
```

### 3. Regular Expressions

Must be wrapped in forward slashes:

```json
"/^ls$/"                  → matches exactly "ls"
"/^git\\s+(status|log)$/" → matches "git status" or "git log"
"/^npm\\s+/"              → matches npm followed by anything
"/.*--force/"             → matches any command with --force
```

**Note**: In JSON, backslashes must be escaped (`\\s` instead of `\s`).

## Precedence Rules

### Key Rule: Deny Always Wins

If a command matches both `allowCommands` and `denyCommands`, it will **always require confirmation**.

```json
{
  "allowCommands": ["git*"],           // Allow all git commands
  "denyCommands": ["git push --force"] // But deny force push
}
```

Results:
- `git status` → No confirmation (allowed)
- `git push` → No confirmation (allowed)
- `git push --force` → **Requires confirmation** (denied)

### Command Root Extraction

Only the command name (not arguments) is checked:

- `ls -la` → checks "ls"
- `git push --force` → checks "git"
- `/usr/bin/python script.py` → checks "python"

## Examples

### Basic Development Setup

```json
{
  "allowCommands": [
    "ls", "pwd", "cd", "cat", "echo",
    "git status", "git diff", "git log",
    "npm test", "npm run"
  ],
  "denyCommands": [
    "rm -rf",
    "sudo*",
    "chmod 777"
  ]
}
```

### Security-Conscious Configuration

```json
{
  "allowCommands": [
    "/^ls(\\s+-[la]+)?$/",      // ls with safe flags only
    "/^git\\s+(status|log)$/",   // read-only git commands
    "/^npm\\s+(test|audit)$/"    // safe npm commands
  ],
  "denyCommands": [
    "*--force*",                 // any force flag
    "sudo*",                     // all sudo commands
    "rm*",                       // all rm variants
    "chmod*",                    // all chmod commands
    "/.*>.*/"                    // commands with output redirection
  ]
}
```

### CI/CD Environment

```json
{
  "allowCommands": [
    "npm ci",
    "npm test",
    "npm run build",
    "docker build",
    "docker tag"
  ],
  "denyCommands": [
    "*--no-verify*",
    "git push*",
    "npm publish",
    "docker push"
  ]
}
```

## Slash Commands

### /pushcmdz - Save Allowed Commands

Saves commands approved during the current session to project settings:

```
> /pushcmdz
Saved 3 command(s) to project settings:
  - ls
  - git
  - npm

Total allowed commands: 5
```

### /pushdeny - View Deny Suggestions

Shows commands from the current session that could be added to the deny list:

```
> /pushdeny
Commands run this session that could be added to deny list:
  - rm
  - sudo
  - chmod

Existing deny list has 3 command(s).

To add specific commands to the deny list, edit .gemini/settings.json
```

## Best Practices

### 1. Start Restrictive

Begin with a minimal allow list and expand as needed:

```json
{
  "allowCommands": ["ls", "pwd", "echo"],
  "denyCommands": ["sudo*", "rm*"]
}
```

### 2. Use Specific Patterns

Prefer exact matches over wildcards:

```json
// Good
"allowCommands": ["git status", "git log", "git diff"]

// Less secure
"allowCommands": ["git*"]
```

### 3. Layer Your Security

Combine with other Gemini CLI security features:

```json
{
  "allowCommands": ["git*"],
  "denyCommands": ["git push --force"],
  "excludeTools": ["ShellTool(rm -rf /)"]
}
```

### 4. Regular Review

Use `/pushcmdz` and `/pushdeny` to review and update your lists periodically.

### 5. Project-Specific Rules

Keep dangerous commands in project settings, safe commands in global:

**Global** (`~/.gemini/settings.json`):
```json
{
  "allowCommands": ["ls", "pwd", "cat"],
  "denyCommands": ["sudo*"]
}
```

**Project** (`.gemini/settings.json`):
```json
{
  "allowCommands": ["npm run deploy", "terraform apply"],
  "denyCommands": ["git push --force"]
}
```

## Security Considerations

### What Is NOT Validated

1. **Command Arguments**: Only the command name is checked
   - `rm` is checked, not `rm -rf /*`
   
2. **Command Context**: Working directory is not considered
   - `cd /etc && rm *` only checks `cd`
   
3. **Command Chaining**: Each command checked separately
   - `ls && rm -rf /` checks `ls` and `rm` independently

### Potential Risks

1. **Overly Broad Patterns**:
   ```json
   // Dangerous
   "allowCommands": ["*"]
   
   // Better
   "allowCommands": ["git status", "git log"]
   ```

2. **Missing Deny Rules**:
   ```json
   // Good
   {
     "allowCommands": ["git*"],
     "denyCommands": ["git push --force", "git reset --hard"]
   }
   ```

3. **Pattern Confusion**:
   ```json
   // This is a literal string, not a pattern
   "allowCommands": ["git.*"]
   
   // This is a regex pattern
   "allowCommands": ["/git.*/"]
   ```

### Recommendations

1. **Always include a deny list** for dangerous commands
2. **Test patterns** before deploying to production
3. **Review logs** regularly for unexpected command executions
4. **Combine with sandboxing** for additional security
5. **Use version control** for settings files

## Troubleshooting

### Commands Still Require Confirmation

1. Check command spelling (case-sensitive)
2. Verify settings file location
3. Remember only command root is checked
4. Check if command matches a deny pattern
5. CLI flags override settings files

### Pattern Not Working

1. JSON requires escaped backslashes: `\\s` not `\s`
2. Regex needs forward slashes: `/pattern/`
3. Glob patterns don't need slashes
4. Test with exact match first

### Debug Mode

Run with `--debug` to see pattern matching details:

```bash
gemini --debug --allow-commands 'git*' --deny-commands 'git push'
```

## Related Documentation

- [Quick Start Guide](./allow-commands-quick-start.md)
- [API Reference](./allow-commands-api.md)
- [Examples](../examples/allow-commands-examples.json)