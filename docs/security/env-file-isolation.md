# Environment File Isolation Security

## Overview

Gemini CLI now supports isolating itself from project-specific `.env` files to prevent loading potentially untrusted environment variables. This feature addresses the security vulnerability where the CLI would automatically load `.env` files from any directory it operates in, potentially exposing sensitive credentials or allowing malicious environment variable injection.

## Security Vulnerability

### The Problem

By default, Gemini CLI searches for and loads `.env` files in the following order:

1. `.gemini/.env` in the current directory and parent directories
2. `.env` in the current directory and parent directories  
3. `.gemini/.env` in the user's home directory
4. `.env` in the user's home directory

This behavior creates a security risk when:
- Working in untrusted repositories or directories
- Cloning external repositories that may contain malicious `.env` files
- Operating in shared environments where `.env` files may be compromised

### Attack Vectors

1. **Credential Theft**: A malicious `.env` file could override API keys, causing the CLI to send credentials to attacker-controlled endpoints
2. **Command Injection**: Environment variables that affect command execution could be manipulated
3. **Configuration Hijacking**: Critical settings could be overridden to change CLI behavior

## Solution: Environment Isolation

### Command-Line Flag

Use the `--ignore-local-env` flag to prevent loading project-specific `.env` files:

```bash
gemini --ignore-local-env [other options]
```

When this flag is enabled, Gemini CLI will only load `.env` files from trusted global locations:
- `~/.gemini/.env`
- `~/.env`

### Settings Configuration

Add the `ignoreLocalEnv` setting to your user or workspace settings:

```json
{
  "ignoreLocalEnv": true
}
```

Settings file locations:
- User settings: `~/.gemini/settings.json`
- Workspace settings: `./.gemini/settings.json`

### How It Works

When environment isolation is enabled:

1. The CLI skips the directory traversal that searches for `.env` files in the current and parent directories
2. Only `.env` files in the user's home directory are loaded
3. The preference order remains the same for home directory files (`.gemini/.env` is preferred over `.env`)
4. All project-specific `.env` files are completely ignored

## Best Practices

### For Security-Conscious Users

1. **Enable by Default**: Add `"ignoreLocalEnv": true` to your user settings file (`~/.gemini/settings.json`)
2. **Use Global Config**: Store all Gemini CLI credentials in `~/.gemini/.env`
3. **Audit Environments**: Regularly review which `.env` files are being loaded

### For Developers Working with Untrusted Code

1. **Always Use the Flag**: When working with external repositories, use `gemini --ignore-local-env`
2. **Create Aliases**: Add shell aliases for common commands:
   ```bash
   alias gemini-safe='gemini --ignore-local-env'
   ```
3. **Review Before Trusting**: Inspect `.env` files in new projects before disabling isolation

### For CI/CD Environments

1. **Enable Isolation**: Always run with `--ignore-local-env` in automated environments
2. **Use Environment Variables**: Pass credentials directly through CI/CD environment variables
3. **Avoid File-Based Secrets**: Don't rely on `.env` files in CI/CD pipelines

## Implementation Details

### Code Changes

The isolation is implemented through:

1. **Modified `loadEnvironment` function**: Accepts an `ignoreLocalEnv` parameter
2. **CLI argument parsing**: Adds `--ignore-local-env` flag support
3. **Settings integration**: Adds `ignoreLocalEnv` to the Settings interface
4. **Authentication flow**: Updates `validateAuthMethod` to respect the isolation flag

### Backward Compatibility

- The feature is **opt-in** to maintain backward compatibility
- Existing workflows continue to work without changes
- Users can gradually migrate to the isolated mode

## Testing

The implementation includes comprehensive tests that verify:

1. Normal behavior when isolation is disabled
2. Proper isolation when the flag is enabled
3. Correct precedence of global `.env` files
4. No loading of project-specific files when isolated

## Migration Guide

To migrate to using environment isolation:

1. **Identify Current `.env` Files**:
   ```bash
   find . -name ".env" -type f
   ```

2. **Move Credentials to Global Location**:
   ```bash
   cp .env ~/.gemini/.env
   ```

3. **Enable Isolation**:
   ```bash
   echo '{"ignoreLocalEnv": true}' > ~/.gemini/settings.json
   ```

4. **Test Your Setup**:
   ```bash
   gemini --debug  # Should show which .env files are loaded
   ```

## FAQ

**Q: Will this break my existing setup?**  
A: No, the feature is opt-in. Your existing setup will continue to work unless you explicitly enable isolation.

**Q: Can I still use project-specific settings?**  
A: Yes, use `.gemini/settings.json` in your project. Only `.env` files are affected by this isolation.

**Q: What if I need project-specific environment variables?**  
A: You can:
- Temporarily disable isolation for trusted projects
- Use shell environment variables: `GEMINI_API_KEY=xxx gemini ...`
- Maintain separate global configs and switch between them

**Q: How do I know which `.env` file is being loaded?**  
A: Run Gemini CLI with the `--debug` flag to see detailed loading information.

## References

- [Issue #2493: gemini should not pickup .env by default](https://github.com/google-gemini/gemini-cli/issues/2493)
- [OWASP: Environment Variable Injection](https://owasp.org/www-community/attacks/Environment_Variable_Injection)