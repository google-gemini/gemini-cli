# allowCommands & denyCommands Quick Start Guide

## 1. Basic Setup (5 minutes)

### Option A: Project Configuration
Create `.gemini/settings.json` in your project:

```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "git status",
    "npm test"
  ]
}
```

### Option B: Global Configuration
Create `~/.gemini/settings.json` for all projects:

```json
{
  "allowCommands": [
    "ls",
    "pwd",
    "echo"
  ],
  "denyCommands": [
    "rm -rf",
    "sudo*",
    "chmod 777"
  ]
}
```

### Option C: Command Line
Use for temporary sessions:

```bash
gemini --allow-commands 'ls,pwd,git status'
gemini --deny-commands 'rm -rf,sudo*'
# Or both:
gemini --allow-commands 'git*,npm*' --deny-commands 'git push --force'
```

## 2. Pattern Types

### Exact Match (Default)
```json
"ls"          → matches: ls, ls -la, ls --help
"git status"  → matches: git status only
```

### Glob Patterns (* and ?)
```json
"git*"        → matches: git, gitk, github
"npm*"        → matches: npm, npmx, npm-check
"test?"       → matches: test1, testA (not test or test12)
```

### Regular Expressions
```json
"/^ls$/"                  → matches: ls exactly
"/^git\\s+(status|log)$/" → matches: git status, git log
"/^npm\\s+/"              → matches: npm followed by anything
```

## 3. Common Configurations

### Minimal Safe Set
```json
{
  "allowCommands": ["ls", "pwd", "echo", "cat"]
}
```

### Git Workflow
```json
{
  "allowCommands": [
    "git status",
    "git diff",
    "git log",
    "git branch"
  ]
}
```

### Node.js Development
```json
{
  "allowCommands": [
    "node",
    "npm test",
    "npm run",
    "npm install"
  ]
}
```

### Using Patterns
```json
{
  "allowCommands": [
    "ls",
    "git*",              // All git commands
    "/^npm\\s+(test|run)$/" // Only npm test and npm run
  ]
}
```

## 4. Interactive Learning

After working for a while, save your approved commands:

```
> /pushcmdz
Saved 3 command(s) to project settings:
  - ls
  - git
  - npm
```

## 5. Tips

1. **Start small**: Add commands as you need them
2. **Use exact matches**: More secure than wildcards
3. **Review periodically**: Use `/pushcmdz` to see what you use
4. **Project-specific**: Keep work commands in project settings
5. **Combine with excludeTools**: Block dangerous variants

## 6. Troubleshooting

**Commands still need approval?**
- Check spelling (case-sensitive)
- Verify file location (`.gemini/settings.json`)
- CLI flags override settings files

**Pattern not working?**
- JSON requires double backslashes: `\\s` not `\s`
- Regex needs slashes: `/pattern/`
- Test with exact match first

## 7. Security Notes

- Only the command name is checked, not arguments
- `allowCommands` doesn't prevent dangerous arguments
- Use specific patterns over wildcards when possible
- Combine with `excludeTools` for better control

## 8. Allow vs Deny Precedence

**denyCommands always takes precedence over allowCommands:**

```json
{
  "allowCommands": ["git*"],         // Allow all git commands
  "denyCommands": ["git push --force"] // But deny force push
}
```

Result:
- `git status` → No confirmation (allowed)
- `git push` → No confirmation (allowed)
- `git push --force` → Requires confirmation (denied takes precedence)

## 9. /pushdeny Command

After running various commands, you can see what might be good to deny:

```
> /pushdeny
Commands run this session that could be added to deny list:
  - rm
  - sudo
  - chmod

Existing deny list has 3 command(s).
```

## Need More?

See the [full documentation](./allow-commands.md) for advanced usage and examples.