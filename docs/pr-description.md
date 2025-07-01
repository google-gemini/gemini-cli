# Add fine-grained access control for shell commands

Fixes #2417

## Summary

This PR implements fine-grained access control for shell commands through configurable `allowCommands` and `denyCommands` lists. This addresses the need for persistent command approval across sessions while maintaining security.

## Key Features

### 1. `allowCommands` - Pre-approve safe commands
- Commands matching these patterns run without confirmation
- Supports exact match, glob patterns (`*`, `?`), and regex (`/pattern/`)
- Configurable via settings files or CLI flags

### 2. `denyCommands` - Always confirm dangerous commands  
- Takes precedence over allowCommands for security
- Same pattern matching support
- Ensures dangerous commands always require explicit approval

### 3. Configuration Options
```bash
# CLI flags
gemini --allow-commands 'ls,pwd,git*' --deny-commands 'rm -rf,sudo*'

# Project settings (.gemini/settings.json)
{
  "allowCommands": ["ls", "pwd", "git*", "/^npm\\s+(test|audit)$/"],
  "denyCommands": ["sudo*", "rm -rf", "/*--force*/"]
}
```

### 4. Session Learning
- `/pushcmdz` - Save session-approved commands to project allowCommands
- `/pushdeny` - View commands that could be added to denyCommands

## Why This Approach?

Based on community feedback from #2417 and lessons from #1947:

1. **User-Configurable**: No hardcoded dangerous command lists. Users control their own safety rules.
2. **Flexible Patterns**: Supports exact, glob, and regex patterns for different use cases
3. **Security-First**: denyCommands always takes precedence, ReDoS protection included
4. **Persistent**: Settings survive between sessions, reducing repetitive confirmations
5. **Project-Specific**: Different rules for different projects/contexts

## Security Considerations

- Only command names are checked (not arguments) for simplicity and security
- Invalid regex patterns fail safely (no match)
- ReDoS protection: Warns on slow regex patterns (>50ms)
- Clear documentation on security best practices

## Testing

- Comprehensive unit tests for pattern matching and command approval flow
- Integration tests for CLI flag parsing and configuration loading
- Edge cases including empty commands, special characters, and invalid patterns
- All existing tests pass

## Documentation

- Quick start guide for easy adoption
- Comprehensive API reference
- 20+ configuration examples
- Security best practices and recommendations

## Future Enhancements

As suggested in the issue, future improvements could include:
- Interactive "Add to allow list" option during confirmation (like Claude Code)
- Command categories/groups for easier management
- Context-aware rules

## Breaking Changes

None. This feature is purely additive and disabled by default.

## Reviewer Checklist

- [ ] Code follows project style guidelines
- [ ] Tests cover new functionality
- [ ] Documentation is clear and comprehensive
- [ ] Security implications are addressed
- [ ] No hardcoded command lists