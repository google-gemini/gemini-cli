# Pull Request Descriptions - Formatted for Gemini CLI

## PR 1: Fix Shell Injection in Git Commits

**Title**: fix: properly escape shell special characters in git commits (fixes #2658)

## TLDR

This PR fixes a critical security vulnerability where backticks and other shell special characters in git commit messages could lead to command injection attacks. The fix adds proper shell escaping to prevent malicious code execution.

## Dive Deeper

The vulnerability allowed attackers to inject arbitrary commands through git commit messages containing:
- Backticks (`) for command substitution
- `$()` syntax for command substitution  
- Semicolons, pipes, and other shell operators

Our solution implements a comprehensive shell escaping utility that:
1. Wraps all arguments in single quotes to prevent shell interpretation
2. Escapes embedded single quotes using the '\'' pattern
3. Handles edge cases like empty strings and special characters
4. Updates AI prompts to enforce proper escaping

This follows OWASP best practices for preventing command injection vulnerabilities.

## Reviewer Test Plan

1. **Test malicious payloads are properly escaped**:
   ```bash
   # Try committing with dangerous characters
   gemini "Fix the bug in `rm -rf /` handling"
   gemini "Update docs $(echo malicious)"
   gemini "Add feature'; cat /etc/passwd; echo '"
   ```

2. **Verify normal commits still work**:
   ```bash
   gemini "Add new feature for user authentication"
   gemini "Fix: resolve issue with API endpoints"
   ```

3. **Run the test suite**:
   ```bash
   npm test -- packages/core/src/utils/shellEscape.test.ts
   ./integration-tests/git-commit-escaping.test.js
   ```

4. **Check the security documentation**:
   ```bash
   cat docs/security/shell-injection-prevention.md
   ```

## Testing Matrix

|          | 🍏  | 🪟  | 🐧  |
| -------- | --- | --- | --- |
| npm run  | ✅  | ❓  | ❓  |
| npx      | ✅  | ❓  | ❓  |
| Docker   | ❓  | ❓  | ❓  |
| Podman   | ❓  | -   | -   |
| Seatbelt | ❓  | -   | -   |

## Linked issues / bugs

- Fixes #2658 - Backticks in git commits messages result in syntax error

---

## PR 2: Add Environment File Isolation

**Title**: feat: add environment file isolation for security (fixes #2493)

## TLDR

Adds `--ignore-local-env` flag and `ignoreLocalEnv` setting to prevent Gemini CLI from loading potentially untrusted `.env` files from project directories. When enabled, only loads environment files from trusted global locations (`~/.gemini/.env` and `~/.env`).

## Dive Deeper

This security feature addresses the risk of:
- **Credential theft**: Malicious `.env` files overriding API endpoints to steal keys
- **Configuration hijacking**: Untrusted projects changing CLI behavior
- **Supply chain attacks**: Compromised repositories injecting malicious environment variables

The implementation:
1. Adds an optional `ignoreLocalEnv` parameter to the `loadEnvironment()` function
2. When enabled, skips directory traversal and only loads from home directory
3. Maintains backward compatibility by making it opt-in
4. Integrates with both CLI arguments and settings.json configuration

This follows the principle of least privilege - the CLI should not automatically trust every directory it operates in.

## Reviewer Test Plan

1. **Test isolation prevents loading project .env files**:
   ```bash
   # Create a malicious .env in a test directory
   mkdir test-project && cd test-project
   echo "GEMINI_API_KEY=STOLEN" > .env
   
   # Run with isolation - should NOT load the local .env
   gemini --ignore-local-env --debug
   # Check that GEMINI_API_KEY is not "STOLEN"
   ```

2. **Test settings.json configuration**:
   ```bash
   # Add to ~/.gemini/settings.json
   echo '{"ignoreLocalEnv": true}' > ~/.gemini/settings.json
   
   # Run without flag - should still isolate
   gemini --debug
   ```

3. **Verify global .env files still work**:
   ```bash
   # Place legitimate credentials in global location
   echo "GEMINI_API_KEY=valid_key" > ~/.gemini/.env
   
   # Run with isolation - should load global .env
   gemini --ignore-local-env --debug
   ```

4. **Run the test suite**:
   ```bash
   npm test -- packages/cli/src/config/__tests__/config.test.ts
   ./integration-tests/env-isolation.test.js
   ```

5. **Review security documentation**:
   ```bash
   cat docs/security/env-file-isolation.md
   ```

## Testing Matrix

|          | 🍏  | 🪟  | 🐧  |
| -------- | --- | --- | --- |
| npm run  | ✅  | ❓  | ❓  |
| npx      | ✅  | ❓  | ❓  |
| Docker   | ❓  | ❓  | ❓  |
| Podman   | ❓  | -   | -   |
| Seatbelt | ❓  | -   | -   |

## Linked issues / bugs

- Fixes #2493 - gemini should not pickup .env by default