# Enhanced Retry System

The Gemini CLI includes a production-grade retry system that intelligently handles API failures, quota limits, and network issues with configurable backoff strategies.

## Features

- **Intelligent Retry Logic**: Automatically retries transient errors (429, 5xx, network issues)
- **Exponential & Linear Backoff**: Configurable strategies for different error types
- **Quota Error Handling**: Special handling for API quota exceeded errors
- **Consistent UX**: Same behavior in both interactive and non-interactive modes
- **Debug Logging**: Detailed retry logs for troubleshooting
- **Configurable Settings**: Customize retry behavior via configuration file
- **Progress Indicators**: Visual feedback during retry attempts

## How It Works

### Error Classification

The retry system classifies errors into categories and applies appropriate strategies:

| Error Type | Status Codes | Default Strategy | Retries |
|------------|--------------|------------------|---------|
| Rate Limits | 429 | Exponential backoff | 5 |
| Server Errors | 500-599 | Linear backoff | 3 |
| Network Errors | ECONNRESET, ETIMEDOUT, etc. | Linear backoff | 3 |
| Client Errors | 400-499 (except 429) | No retry | 0 |

### Backoff Strategies

#### Exponential Backoff
- **Rate Limits (429)**: 1s, 2s, 4s, 8s, 16s
- Respects `Retry-After` headers when present
- Best for quota-related errors

#### Linear Backoff  
- **Server Errors (5xx)**: 2s, 4s, 6s
- **Network Errors**: 0.5s, 1s, 2s
- Consistent delay increases

#### Aggressive Backoff
- **Rate Limits (429)**: 1s, 3s, 9s, 27s
- For persistent quota issues
- Configurable via settings

## Configuration

### Configuration File

Create `~/.gemini/retry-settings.json` to customize retry behavior:

```json
{
  "maxRetries": 5,
  "baseDelayMs": 1000,
  "maxDelayMs": 30000,
  "enableDebugLogging": true,
  "verboseRetries": false,
  "retryStrategies": {
    "rateLimitBackoff": "exponential",
    "serverErrorBackoff": "linear", 
    "networkErrorBackoff": "linear"
  },
  "customDelays": {
    "rateLimit": [1000, 2000, 4000, 8000, 16000],
    "serverError": [2000, 4000, 6000],
    "networkError": [500, 1000, 2000]
  }
}
```

### CLI Commands

Manage retry configuration using built-in commands:

```bash
# Show current settings
/retry-config show

# Update settings
/retry-config set maxRetries 3
/retry-config set verboseRetries true
/retry-config set rateLimitBackoff aggressive

# Reset to defaults
/retry-config reset

# Create example config file
/retry-config example

# Validate configuration
/retry-config validate
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 5 | Maximum retry attempts (0-10) |
| `baseDelayMs` | number | 1000 | Base delay for calculations |
| `maxDelayMs` | number | 30000 | Maximum delay between retries |
| `enableDebugLogging` | boolean | true | Enable detailed retry logs |
| `verboseRetries` | boolean | false | Show strategy info in progress |
| `retryStrategies.rateLimitBackoff` | string | "exponential" | Strategy for 429 errors |
| `retryStrategies.serverErrorBackoff` | string | "linear" | Strategy for 5xx errors |
| `retryStrategies.networkErrorBackoff` | string | "linear" | Strategy for network errors |
| `customDelays.*` | number[] | varies | Custom delay sequences |

## Usage Examples

### Basic Usage

The retry system works automatically - no code changes needed:

```bash
# Non-interactive mode with automatic retries
gemini -p "Explain quantum computing"

# Interactive mode with retry feedback
gemini
> Tell me about machine learning
```

### Quota Error Handling

When quota limits are hit:

```
[*] CHAT_GENERATION failed, retrying in 2s... (attempt 1/5)
[*] CHAT_GENERATION failed, retrying in 4s... (attempt 2/5)

[X] CHAT_GENERATION failed after 5 attempts.

** API Quota Exceeded **
You've hit your request limit for the Gemini API.

** Next Steps **
1. Upgrade your quota: https://aistudio.google.com/apikey
2. Request limit increase: https://ai.google.dev/gemini-api/docs/rate-limits
3. Try again tomorrow (quota resets at midnight UTC)
4. Switch to a different model with /model command

** Pro Tip ** Use --model=gemini-2.5-flash instead of gemini-2.5-pro to conserve quota.
```

### Server Error Handling

For temporary server issues:

```
[*] API_REQUEST failed, retrying in 2s... (attempt 1/3)
[*] API_REQUEST failed, retrying in 4s... (attempt 2/3)

[X] API_REQUEST failed after 3 attempts.

** Server Error (500) **
Gemini API is experiencing issues. This is usually temporary.

** Try Again **
- Wait a few minutes and retry your request
- Check API status: https://status.cloud.google.com/
- Switch to a different model if available
```

### Network Error Handling

For connectivity issues:

```
[*] NETWORK_REQUEST failed, retrying in 1s... (attempt 1/3)

** Network Error (ECONNRESET) **
Unable to connect to the Gemini API.

** Troubleshooting **
- Check your internet connection
- Verify firewall/proxy settings
- Try again in a few moments
```

## Debug Logging

When `enableDebugLogging` is true, detailed logs are written to `.gemini-cli-debug.log`:

```json
{"timestamp":"2025-01-13T10:30:00.000Z","event":"RETRY_CLIENT_INITIALIZED","options":{"maxRetries":5,"baseDelayMs":1000}}
{"timestamp":"2025-01-13T10:30:15.000Z","operation":"CHAT_GENERATION","attempt":1,"error":{"status":429,"message":"Too Many Requests"}}
{"timestamp":"2025-01-13T10:30:17.000Z","operation":"CHAT_GENERATION","attempt":2,"error":{"status":429,"message":"Too Many Requests"}}
```

## Integration

### For Developers

The retry system is automatically integrated into:

- **Non-interactive CLI**: All API calls wrapped with retry logic
- **Interactive mode**: Consistent error handling and user feedback  
- **Tool execution**: Network-dependent tools get retry protection
- **Streaming responses**: Intelligent stream restart on failure

### Custom Integration

Use the retry client in your own code:

```typescript
import { ApiRetryClient } from '@google/gemini-cli-core';

const retryClient = new ApiRetryClient({
  maxRetries: 3,
  baseDelayMs: 1000,
  operation: 'CUSTOM_OPERATION',
  enableDebugLogging: true,
});

const result = await retryClient.makeRequest(
  () => myApiCall(),
  'MY_OPERATION'
);
```

## Best Practices

### For Users

1. **Monitor Debug Logs**: Check `.gemini-cli-debug.log` for retry patterns
2. **Adjust for Your Use Case**: Reduce retries for development, increase for production
3. **Use Appropriate Models**: Switch to Flash model to conserve quota
4. **Check API Status**: Verify service status during persistent failures

### For CI/CD

1. **Non-Interactive Mode**: Retry system provides proper exit codes
2. **Log Visibility**: Retry progress appears in CI logs
3. **Timeout Considerations**: Factor retry delays into build timeouts
4. **Configuration**: Use environment-specific retry settings

### For Development

1. **Disable Debug Logging**: Set `enableDebugLogging: false` for cleaner output
2. **Reduce Retries**: Lower `maxRetries` for faster feedback during development
3. **Verbose Mode**: Enable `verboseRetries` to see strategy information

## Troubleshooting

### Common Issues

**Retries Not Working**
- Check if error is retryable (429, 5xx, network errors)
- Verify `maxRetries` > 0 in configuration
- Look for validation errors in configuration

**Too Many Retries**
- Reduce `maxRetries` in configuration
- Check if you're hitting rate limits consistently
- Consider switching to a different model

**Slow Performance**
- Reduce `baseDelayMs` and `maxDelayMs`
- Use linear instead of exponential backoff
- Check network connectivity

**Missing Debug Logs**
- Ensure `enableDebugLogging: true`
- Check file permissions in current directory
- Verify disk space availability

### Getting Help

1. **Check Configuration**: `/retry-config validate`
2. **View Current Settings**: `/retry-config show`
3. **Reset to Defaults**: `/retry-config reset`
4. **Create Example Config**: `/retry-config example`
5. **Report Issues**: Use `/bug` command for persistent problems

## Migration Guide

### From Previous Versions

The enhanced retry system is backward compatible. Existing code will automatically benefit from improved error handling.

### Configuration Migration

If you have custom retry logic, consider migrating to the configuration system:

```bash
# Old: Hard-coded retry logic
# New: Configurable retry behavior
/retry-config set maxRetries 3
/retry-config set rateLimitBackoff aggressive
```

## Performance Impact

The retry system is designed for minimal overhead:

- **Successful Requests**: < 1ms overhead
- **Failed Requests**: Only adds delay for retryable errors
- **Memory Usage**: Minimal - logs are streamed to disk
- **CPU Impact**: Negligible during normal operation

## Security Considerations

- **Debug Logs**: May contain API response data - review before sharing
- **Configuration Files**: Stored in user home directory with appropriate permissions
- **Network Requests**: All retries use the same authentication as original request
- **Rate Limiting**: Respects API rate limits and `Retry-After` headers
