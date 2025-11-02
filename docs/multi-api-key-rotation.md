# Multi-API Key Rotation

The Gemini CLI now supports automatic API key rotation to handle rate limits and quota exhaustion seamlessly. When one API key hits its usage limit, the system automatically switches to the next available key.

## Features

- **Automatic Rotation**: Seamlessly switches between API keys when rate limits or quota errors are encountered
- **Persistent Storage**: API keys are securely stored using the same hybrid storage system as single API keys
- **Status Tracking**: Monitor which keys are active, blocked, or exhausted
- **Failure Recovery**: Automatically marks keys as blocked when they hit quota limits
- **Manual Management**: Full control via slash commands to add, remove, and manage keys

## Quick Start

### Adding API Keys

Add your first API key:
```
/apikeys add AIzaSyD... "Production Key"
```

Add additional keys for automatic rotation:
```
/apikeys add AIzaSyE... "Backup Key 1"
/apikeys add AIzaSyF... "Backup Key 2"
```

### Viewing Your Keys

List all configured API keys and their status:
```
/apikeys list
```

Or simply:
```
/apikeys
```

Example output:
```
**API Keys (3 total)**

→ [0] AIza...D123
    Label: Production Key
    Status: ✓ Active
    Added: 11/2/2025, 1:30:00 PM
    Last Used: 11/2/2025, 2:15:00 PM
    Failures: 0

  [1] AIza...E456
    Label: Backup Key 1
    Status: 🚫 BLOCKED
    Added: 11/2/2025, 1:31:00 PM
    Last Used: 11/2/2025, 2:10:00 PM
    Failures: 3

  [2] AIza...F789
    Label: Backup Key 2
    Status: ✓ Active
    Added: 11/2/2025, 1:32:00 PM
    Last Used: Never
    Failures: 0
```

## How It Works

### Automatic Rotation

When you have multiple API keys configured:

1. **Normal Operation**: The system uses the current active key for all API requests
2. **Rate Limit Detection**: When a 429 (rate limit) or quota error is detected, the key is marked as blocked
3. **Automatic Switch**: The system immediately rotates to the next available (non-blocked) key
4. **Retry**: The failed request is automatically retried with the new key
5. **Continuation**: If successful, operations continue with the new key

### Key States

- **Active (✓)**: Key is available for use
- **Blocked (🚫)**: Key has hit a rate limit or quota and is temporarily unavailable
- **Current (→)**: The key currently being used for requests

### Failure Handling

The system intelligently handles different types of errors:

- **Rate Limit (429)**: Key is blocked, rotation occurs immediately
- **Quota Exhausted**: Key is blocked, rotation occurs immediately
- **Other Errors**: Key remains active, normal retry logic applies

## Commands Reference

### `/apikeys` or `/apikeys list`
Display all configured API keys with their status, labels, and usage statistics.

### `/apikeys add <key> [label]`
Add a new API key to the rotation pool.

**Parameters:**
- `<key>`: The API key (required)
- `[label]`: Optional human-readable label for the key

**Example:**
```
/apikeys add AIzaSyD... "Production Key"
```

### `/apikeys remove <index>`
Remove an API key by its index number.

**Parameters:**
- `<index>`: The index number shown in `/apikeys list`

**Example:**
```
/apikeys remove 1
```

### `/apikeys reset`
Reset all blocked keys, making them available again. Useful after quota periods reset (e.g., daily quotas).

**Example:**
```
/apikeys reset
```

### `/apikeys clear`
Remove all API keys from storage.

**Example:**
```
/apikeys clear
```

## Best Practices

### 1. Use Descriptive Labels
```
/apikeys add AIza... "Production - Project A"
/apikeys add AIza... "Development - Testing"
/apikeys add AIza... "Backup - Emergency"
```

### 2. Monitor Key Status
Regularly check `/apikeys` to see which keys are blocked and may need quota increases or replacement.

### 3. Reset After Quota Periods
If you have daily quotas, reset blocked keys after midnight:
```
/apikeys reset
```

### 4. Keep Backup Keys
Maintain at least 2-3 API keys to ensure uninterrupted service during high-usage periods.

### 5. Organize by Purpose
Use labels to identify keys by project, environment, or purpose:
- "Production - Client Work"
- "Development - Testing"
- "Personal Projects"

## Migration from Single API Key

If you're currently using a single API key (via `GEMINI_API_KEY` environment variable or saved key):

1. The system will continue to work with your existing single key
2. Add additional keys using `/apikeys add` to enable rotation
3. Once multiple keys are configured, the system automatically switches to rotation mode
4. Your original key is not affected and can still be used alongside the multi-key system

## Technical Details

### Storage
- Keys are stored using the same secure `HybridTokenStorage` system as single API keys
- On supported platforms, keys are stored in the system keychain
- Fallback to encrypted file storage on other platforms

### Rotation Logic
- Maximum rotation attempts = number of configured keys
- Each key is tried once before giving up
- Blocked keys are skipped during rotation
- Current key index is persisted across sessions

### Error Classification
The system uses Google's error response metadata to distinguish between:
- **Retryable quota errors**: Per-minute limits (automatic retry with backoff)
- **Terminal quota errors**: Daily limits (immediate rotation)
- **Rate limits**: Too many requests (immediate rotation)

## Troubleshooting

### All Keys Are Blocked
If all your API keys become blocked:
```
Error: All API keys have been exhausted or rate limited.
Please add more keys or wait for quota reset.
```

**Solutions:**
1. Wait for quota period to reset (usually daily)
2. Run `/apikeys reset` after the reset period
3. Add additional API keys with `/apikeys add`

### Keys Not Rotating
If rotation doesn't seem to work:
1. Verify multiple keys are configured: `/apikeys list`
2. Check that keys are not all blocked
3. Ensure you're using Gemini API key auth mode (not OAuth)

### Key Already Exists Error
```
Error: API key already exists
```

You're trying to add a duplicate key. Each key can only be added once.

## Security Considerations

- API keys are stored securely using the system keychain when available
- Keys are masked in the UI (only first/last 4 characters shown)
- Never share your API keys or commit them to version control
- Use labels instead of exposing full keys in screenshots or logs

## Limitations

- Multi-key rotation only works with Gemini API key authentication (`USE_GEMINI` mode)
- Not available for OAuth or Vertex AI authentication modes
- Maximum practical limit: ~10 keys (more may impact rotation performance)
- Blocked status persists until manually reset or quota period expires
