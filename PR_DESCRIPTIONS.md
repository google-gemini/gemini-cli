# Pull Request Descriptions for Security Fixes

## PR 1: Fix Shell Injection in Git Commits

**URL**: https://github.com/maslinedwin/gemini-cli/pull/new/fix/escape-backticks-in-git-commits

**Title**: fix: properly escape shell special characters in git commits (fixes #2658)

**Description**:
```
## Summary

This PR fixes a critical security vulnerability where backticks and other shell special characters in git commit messages could lead to command injection.

## Changes

- Added comprehensive shell escaping utility function that properly handles:
  - Backticks (`)
  - Command substitution ($())
  - Semicolons, pipes, and other shell operators
  - Special characters and quotes
- Updated AI prompts to enforce proper escaping of git commit messages
- Added comprehensive unit tests for the escaping function
- Added integration tests for git commit security
- Created security documentation explaining the vulnerability and fix

## Security Impact

This prevents potential command injection attacks through git commit messages by ensuring all shell arguments are properly escaped using single quotes and the '\'' pattern for embedded quotes.

## Testing

- ✅ Added 13 unit tests covering various injection scenarios
- ✅ Added integration tests for actual git commands
- ✅ All existing tests pass
- ✅ Manual testing with malicious payloads

## Related Issue

Fixes #2658
```

---

## PR 2: Add Environment File Isolation

**URL**: https://github.com/maslinedwin/gemini-cli/pull/new/fix/isolate-env-files-security

**Title**: feat: add environment file isolation for security (fixes #2493)

**Description**:
```
## Summary

This PR adds a security feature to isolate Gemini CLI from potentially untrusted `.env` files in project directories, preventing unauthorized access to credentials and configuration hijacking.

## Changes

- Added `--ignore-local-env` CLI flag to prevent loading project-specific `.env` files
- Added `ignoreLocalEnv` setting to `settings.json` for persistent configuration
- Modified `loadEnvironment()` to support isolation mode that only loads from:
  - `~/.gemini/.env`
  - `~/.env`
- Updated authentication flows to respect the isolation setting
- Added comprehensive unit tests for environment loading behavior
- Added integration tests for the new feature
- Created detailed security documentation

## Security Impact

This feature prevents:
- Loading malicious `.env` files from untrusted repositories
- Credential theft through environment variable overrides
- Configuration hijacking attacks
- Unintended exposure of project-specific secrets

## Testing

- ✅ Added comprehensive unit tests for both isolation modes
- ✅ Added integration tests for CLI behavior
- ✅ All existing tests pass
- ✅ Backward compatibility maintained (opt-in feature)

## Usage

```bash
# Via CLI flag
gemini --ignore-local-env [other options]

# Via settings.json
{
  "ignoreLocalEnv": true
}
```

## Related Issue

Fixes #2493
```