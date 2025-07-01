# Command Access Control API Reference

## Configuration Schema

### Settings Interface

The `allowCommands` and `denyCommands` fields are part of the `Settings` interface:

```typescript
interface Settings {
  // ... other settings
  
  /**
   * List of allowed shell command patterns.
   * Commands matching these patterns will execute without confirmation.
   * 
   * @example ["ls", "pwd", "git*", "/^npm\\s+(test|install)$/"]
   */
  allowCommands?: string[];
  
  /**
   * List of denied shell command patterns.
   * Commands matching these patterns will always require confirmation,
   * even if they match an allowCommands pattern.
   * 
   * @example ["rm -rf", "sudo*", "/.*--force/"]
   */
  denyCommands?: string[];
}
```

### Pattern Types

```typescript
type CommandPattern = ExactMatch | GlobPattern | RegexPattern;

type ExactMatch = string;        // "ls", "git status"
type GlobPattern = string;       // "git*", "*.sh", "test?"  
type RegexPattern = `/${string}/`; // "/^npm\\s+test$/"
```

## Core API

### Config Class Methods

```typescript
class Config {
  /**
   * Get the list of allowed command patterns.
   * @returns Array of patterns or undefined if not configured
   */
  getAllowCommands(): string[] | undefined;
  
  /**
   * Get the list of denied command patterns.
   * @returns Array of patterns or undefined if not configured
   */
  getDenyCommands(): string[] | undefined;
}
```

### ShellTool Methods

```typescript
class ShellTool extends BaseTool {
  /**
   * Check if a command matches an allow pattern.
   * @param command - The command to check (just the command name, not full command line)
   * @param pattern - The pattern to match against
   * @returns true if the command matches the pattern
   */
  matchesAllowPattern(command: string, pattern: string): boolean;

  /**
   * Extract the command root from a full command line.
   * @param command - Full command line (e.g., "ls -la | grep test")
   * @returns The command root (e.g., "ls") or undefined
   */
  getCommandRoot(command: string): string | undefined;

  /**
   * Get a copy of the current session's whitelist.
   * @returns A new Set containing whitelisted commands
   */
  getWhitelist(): Set<string>;
}
```

## Pattern Matching Algorithm

### Exact Match
```typescript
function matchExact(command: string, pattern: string): boolean {
  return command === pattern;
}
```

### Glob Pattern
```typescript
function matchGlob(command: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*/g, '.*')                  // * -> .*
    .replace(/\?/g, '.');                  // ? -> .
    
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(command);
}
```

### Regex Pattern
```typescript
function matchRegex(command: string, pattern: string): boolean {
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(command);
    } catch {
      return false; // Invalid regex
    }
  }
  return false;
}
```

## Configuration Loading

### Precedence Order

1. CLI flags (highest priority)
2. Workspace settings (`.gemini/settings.json`)
3. User settings (`~/.gemini/settings.json`)
4. Default (undefined - no pre-approved or denied commands)

### CLI Argument Parsing

```typescript
// Command line
gemini --allow-commands 'ls,pwd,git status'
gemini --deny-commands 'rm -rf,sudo*'

// Parsed as
allowCommands: ['ls', 'pwd', 'git status']
denyCommands: ['rm -rf', 'sudo*']
```

## Integration Points

### Settings File Loading

```typescript
// packages/cli/src/config/settings.ts
interface Settings {
  allowCommands?: string[];
}

// Loaded from JSON
{
  "allowCommands": ["ls", "pwd", "git*"]
}
```

### Config Creation

```typescript
// packages/cli/src/config/config.ts
new Config({
  allowCommands: argv.allow_commands 
    ? parseAllowCommands(argv.allow_commands)
    : settings.allowCommands || undefined,
  // ... other config
});
```

### Command Approval Flow

```typescript
// packages/core/src/tools/shell.ts
async shouldConfirmExecute(params: ShellToolParams): Promise<boolean | ConfirmationDetails> {
  const rootCommand = this.getCommandRoot(params.command);
  
  // 1. Check denyCommands FIRST (highest priority)
  const denyCommands = this.config.getDenyCommands();
  if (denyCommands?.some(pattern => this.matchesAllowPattern(rootCommand, pattern))) {
    return {
      type: 'exec',
      title: 'Confirm Denied Command',
      command: params.command,
      rootCommand,
      // ... other confirmation details
    };
  }
  
  // 2. Check allowCommands
  const allowCommands = this.config.getAllowCommands();
  if (allowCommands?.some(pattern => this.matchesAllowPattern(rootCommand, pattern))) {
    return false; // No confirmation needed
  }
  
  // 3. Check session whitelist
  if (this.whitelist.has(rootCommand)) {
    return false; // Already approved this session
  }
  
  // 4. Return confirmation details
  return { /* standard confirmation prompt */ };
}
```

## Slash Commands

### /pushcmdz Implementation

```typescript
{
  name: 'pushcmdz',
  description: 'Save currently allowed shell commands to project settings',
  action: async () => {
    // 1. Get shell tool
    const shellTool = toolRegistry.getAllTools().find(t => t.name === 'run_shell_command');
    
    // 2. Get current whitelist
    const whitelist = shellTool.getWhitelist();
    const allowedCommands = Array.from(whitelist);
    
    // 3. Merge with existing
    const existingCommands = settings.workspace.settings.allowCommands || [];
    const mergedCommands = Array.from(new Set([...existingCommands, ...allowedCommands]));
    
    // 4. Save to settings
    settings.setValue(SettingScope.Workspace, 'allowCommands', mergedCommands);
  }
}
```

### /pushdeny Implementation

```typescript
{
  name: 'pushdeny',
  description: 'Save currently denied shell commands to project settings',
  action: async () => {
    // 1. Get shell tool
    const shellTool = toolRegistry.getAllTools().find(t => t.name === 'run_shell_command');
    
    // 2. Get current whitelist (commands that have been run)
    const whitelist = shellTool.getWhitelist();
    const sessionCommands = Array.from(whitelist);
    
    // 3. Get existing denyCommands
    const existingDenyCommands = settings.workspace.settings.denyCommands || [];
    
    // 4. Show suggestions to user
    // Note: This command shows suggestions rather than auto-saving
    // Users must manually edit settings to add to deny list
  }
}
```

## Error Handling

### Pattern Validation

Invalid patterns are handled gracefully:

```typescript
// Invalid regex
pattern: "/[invalid"
// Warning logged: "Invalid regex pattern: /[invalid"
// Returns: false (no match)

// Invalid glob (none - all strings are valid globs)
pattern: "***"
// Treated as literal "***"
```

### Settings Validation

```typescript
// Type checking
allowCommands: "ls" // ❌ Type error: must be array
allowCommands: ["ls", 123] // ❌ Type error: must be string[]
allowCommands: ["ls", "pwd"] // ✅ Valid
```

## Security Considerations

### What Is NOT Validated

1. **Command arguments**: Only the command name is checked
2. **Command context**: Working directory is not considered
3. **Command effects**: No semantic understanding of what commands do
4. **Privilege escalation**: `sudo` is treated like any other command

### Best Practices

```typescript
// ✅ Good: Specific patterns
allowCommands: ["git status", "git log", "npm test"]

// ⚠️ Risky: Broad patterns
allowCommands: ["git*", "npm*"]

// ❌ Dangerous: Too permissive
allowCommands: ["*", "sudo*", "rm*"]
```

## Examples

### Basic Usage

```typescript
// Config
const config = new Config({
  allowCommands: ["ls", "pwd", "git status"]
});

// Shell tool
const shell = new ShellTool(config);

// Check if confirmation needed
const needsConfirm = await shell.shouldConfirmExecute({
  command: "ls -la"
}); // Returns: false (pre-approved)
```

### Pattern Matching

```typescript
const shell = new ShellTool(config);

// Exact match
shell.matchesAllowPattern("ls", "ls"); // true
shell.matchesAllowPattern("ls", "pwd"); // false

// Glob pattern
shell.matchesAllowPattern("git", "git*"); // true
shell.matchesAllowPattern("github", "git*"); // true

// Regex pattern
shell.matchesAllowPattern("npm test", "/^npm\\s+test$/"); // true
shell.matchesAllowPattern("npm install", "/^npm\\s+test$/"); // false
```

### Command Root Extraction

```typescript
shell.getCommandRoot("ls -la"); // "ls"
shell.getCommandRoot("/usr/bin/git status"); // "git"
shell.getCommandRoot("echo 'hello' | grep h"); // "echo"
shell.getCommandRoot("(cd /tmp && ls)"); // "cd"
```