# Design: Fine-Grained Shell Command Access Control

## Overview

This implementation adds fine-grained access control for shell commands in Gemini CLI through two complementary features:
- **`allowCommands`**: Pre-approve specific commands to run without confirmation
- **`denyCommands`**: Always require confirmation for dangerous commands

## Design Decisions

### 1. Configuration-Based Approach

We chose a configuration-based approach over other alternatives (like inline annotations or interactive learning only) for several reasons:

- **Persistence**: Settings survive between sessions, reducing repetitive confirmations
- **Shareability**: Teams can share safe command lists via version control
- **Flexibility**: Supports multiple configuration sources (CLI flags, project settings, global settings)
- **Predictability**: Users know exactly which commands will/won't require confirmation

### 2. Pattern Matching Support

Three pattern types are supported:
- **Exact match**: `"ls"`, `"git status"`
- **Glob patterns**: `"git*"`, `"*.sh"`, `"npm?"` 
- **Regular expressions**: `"/^make\\s+/"`

**Justification**: Different use cases require different levels of specificity. Exact matches are safest, globs provide convenience, and regex enables complex rules.

### 3. Command Root Extraction

Only the command name (not arguments) is checked against patterns:
- `ls -la` → checks `"ls"`
- `git push --force` → checks `"git"`
- `/usr/bin/python script.py` → checks `"python"`

**Justification**: This keeps pattern matching simple and predictable while preventing bypass attempts through path manipulation.

### 4. Deny Takes Precedence

The checking order is:
1. `denyCommands` (if matches → always confirm)
2. `allowCommands` (if matches → skip confirmation)
3. Session whitelist (if matches → skip confirmation)

**Justification**: Security-first design. Even if a command is accidentally added to allowCommands, explicit deny rules provide a safety net.

### 5. Session Learning

- `/pushcmdz`: Save session-approved commands to allowCommands
- `/pushdeny`: Show commands that could be added to denyCommands

**Justification**: Helps users build their allow/deny lists organically based on actual usage.

## Implementation Highlights

### Configuration Schema
```typescript
interface Settings {
  allowCommands?: string[];  // Commands to pre-approve
  denyCommands?: string[];   // Commands to always confirm
}
```

### CLI Support
```bash
gemini --allow-commands 'ls,git*,npm test' --deny-commands 'rm -rf,sudo*'
```

### Pattern Matching Algorithm
```typescript
matchesPattern(command: string, pattern: string): boolean {
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    // Regex pattern
    return new RegExp(pattern.slice(1, -1)).test(command);
  } else if (pattern.includes('*') || pattern.includes('?')) {
    // Glob pattern
    return minimatch(command, pattern);
  } else {
    // Exact match
    return command === pattern;
  }
}
```

## Security Considerations

### What We Check
- Command name only (not full command line)
- Patterns are matched in order, deny first
- Invalid regex patterns fail safely (no match)

### What We Don't Check
- Command arguments (by design - keeps it simple)
- Command context (working directory, environment)
- Command chaining (each command checked independently)

### Example Security Configuration
```json
{
  "allowCommands": [
    "ls", "pwd", "echo",
    "/^git\\s+(status|log|diff)$/",
    "/^npm\\s+(test|audit)$/"
  ],
  "denyCommands": [
    "sudo*", "su*",
    "rm -rf", "chmod 777",
    "/*--force*/",
    "curl*-o*", "wget*-O*"
  ]
}
```

## Benefits

1. **Reduced Friction**: Common safe commands run without interruption
2. **Enhanced Security**: Dangerous commands always require confirmation
3. **Team Consistency**: Shared configurations ensure consistent safety policies
4. **Gradual Adoption**: Start with a few commands, expand based on usage
5. **Flexibility**: Different rules for different projects/environments

## Future Enhancements

Potential future improvements:
- **Interactive confirmation with "Add to allow list" option**: Similar to Claude Code, when a new command requires confirmation, offer options like:
  - "Yes" - Run this time
  - "Yes, and add to allow list" - Run and remember for future
  - "No" - Don't run
  This would make building allow lists even more organic and user-friendly
- Argument-level checking for specific cases
- Command groups/categories for easier management
- Integration with corporate security policies
- Analytics on command usage patterns
- Context-aware rules (e.g., different rules in production vs development)

## Conclusion

This design balances security with usability, providing users fine-grained control over command execution while maintaining Gemini CLI's safety-first philosophy. The configuration-based approach with pattern matching offers the flexibility needed for diverse development workflows while keeping dangerous commands under control.