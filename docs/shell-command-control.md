# Shell Command Access Control

Fine-grained control over which shell commands require confirmation in Gemini CLI.

## Overview

Configure persistent allow/deny rules for shell commands to reduce interruptions while maintaining security:

- **`allowCommands`** - Pre-approve safe commands to run without confirmation
- **`denyCommands`** - Always require confirmation for dangerous commands (takes precedence)

## Configuration

### Settings File (`.gemini/settings.json`)

```json
{
  "allowCommands": [
    "ls",
    "pwd", 
    "git status",
    "git log",
    "npm test",
    "git*",
    "*.js",
    "/^make\\s+\\w+$/"
  ],
  "denyCommands": [
    "rm -rf",
    "sudo*", 
    "git push --force",
    "/.*--no-verify/"
  ]
}
```

### Command Line

```bash
gemini --allow-commands 'ls,pwd,git*' --deny-commands 'rm -rf,sudo*'
```

## Pattern Matching

### Pattern Types

1. **Single-word patterns** - Match command root only
   - `"ls"` matches `ls`, `ls -la`, `ls -R`
   - `"git"` matches `git status`, `git push`

2. **Multi-word patterns** - Match as prefix
   - `"git status"` matches `git status`, `git status --verbose`
   - `"rm -rf"` matches `rm -rf /`, `rm -rf /tmp`

3. **Glob patterns** - Wildcards
   - `"git*"` matches `git`, `gitk`, `github`
   - `"*.js"` matches `test.js`, `script.js`
   - `"test?"` matches `test1`, `testA`

4. **Regex patterns** - Enclosed in `/`
   - `"/^make\\s+\\w+$/"` matches `make build`, `make test`
   - `"/^npm\\s+(test|audit)$/"` matches `npm test`, `npm audit`

### Matching Rules

- **Deny always wins** - If a command matches both allow and deny, it's denied
- **Command root extraction** - `/usr/bin/ls -la` → checks `ls`
- **First command only** - `ls && rm` → checks `ls`

## Session Commands

### `/pushcmdz` - Save Allowed Commands

Saves commands approved during the session to project settings:

```
> yarn install          # Approve with "always"
> /pushcmdz            # Saves "yarn" to allowCommands
```

### `/pushdeny` - Suggest Deny Commands  

Shows commands from the session that could be added to denyCommands.

## Examples

### Basic Setup

```json
{
  "allowCommands": [
    "ls", "pwd", "echo", "cat",
    "git status", "git log", "git diff",
    "npm test", "npm run"
  ],
  "denyCommands": [
    "rm -rf", "sudo*", "chmod 777"
  ]
}
```

### Security-Focused

```json
{
  "allowCommands": [
    "/^git\\s+(status|log|diff)$/",  // Read-only git
    "/^npm\\s+(test|audit)$/",        // Safe npm commands
    "/^docker\\s+(ps|images)$/"       // Docker inspection
  ],
  "denyCommands": [
    "*--force*", "*--no-verify*",     // Dangerous flags
    "sudo*", "su*",                   // Privilege escalation
    "rm*", "dd", "mkfs*",             // Destructive commands
    "/.*>.*/"                         // Output redirection
  ]
}
```

## Security Notes

- Only command names are checked, not arguments
- Patterns are matched in deny-first order
- Invalid regex patterns fail safely (no match)
- ReDoS protection via safe-regex library

## Best Practices

1. Start with a minimal allow list and expand as needed
2. Always include common dangerous commands in deny list
3. Use specific patterns over broad wildcards
4. Test patterns before deploying to production
5. Keep project-specific rules in project settings

## API Reference

### Config Methods

```typescript
config.getAllowCommands(): string[] | undefined
config.getDenyCommands(): string[] | undefined
```

### ShellTool Methods

```typescript
shellTool.matchesAllowPattern(command: string, pattern: string): boolean
shellTool.getCommandRoot(command: string): string | undefined
shellTool.getWhitelist(): Set<string>
```

### Settings Interface

```typescript
interface Settings {
  allowCommands?: string[];  // Pre-approved patterns
  denyCommands?: string[];   // Always-confirm patterns
}
```