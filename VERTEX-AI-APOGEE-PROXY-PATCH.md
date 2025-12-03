# Vertex AI via Apogee Proxy Support Patch

## Purpose

This patch enables gemini-cli to work with Vertex AI through custom API
endpoints (like Viasat's Apogee proxy) by supporting `httpOptions` configuration
in settings.json.

## What This Fixes

gemini-cli previously required environment variables for Vertex AI
authentication. This patch:

1. **Adds `httpOptions` support** - Allows specifying custom base URLs and
   headers in settings.json
2. **Fixes validation logic** - Allows `project`/`location` to be specified in
   settings.json instead of only environment variables
3. **Prevents API key conflicts** - When using `project`/`location`, the API key
   is only sent in headers (not as a constructor parameter)

## Installation

### Option 1: Using npm link (Recommended for Development)

```bash
cd ~/github/gemini-cli
npm run build
npm link
```

This will make the patched `gemini` command available globally on your system.

### Option 2: Using an Alias

```bash
cd ~/github/gemini-cli
npm run build && npm run bundle

# Add to your ~/.zshrc or ~/.bashrc:
alias gemini="node ~/github/gemini-cli/bundle/gemini.js"
```

## Configuration

### Location

Settings file location: `~/.gemini/settings.json`

If the directory doesn't exist, create it:

```bash
mkdir -p ~/.gemini
```

### Example settings.json (with fake credentials)

```json
{
  "model": {
    "name": "gemini-2.0-flash-exp"
  },
  "vertexai": true,
  "project": "your-gcp-project-id",
  "location": "us-central1",
  "httpOptions": {
    "baseUrl": "https://your-apogee-proxy.example.com/v1/llms/vertexai/",
    "headers": {
      "X-Goog-Api-Key": "YOUR_API_KEY_HERE",
      "user_email": "your.email@example.com"
    }
  },
  "security": {
    "auth": {
      "selectedType": "vertex-ai"
    }
  }
}
```

### Configuration Reference

| Field                        | Required | Description                       | Example                                         |
| ---------------------------- | -------- | --------------------------------- | ----------------------------------------------- |
| `model.name`                 | Yes      | The Gemini model to use           | `"gemini-2.0-flash-exp"`                        |
| `vertexai`                   | Yes      | Enable Vertex AI mode             | `true`                                          |
| `project`                    | Yes      | Your GCP project ID               | `"my-project-123"`                              |
| `location`                   | Yes      | GCP region                        | `"us-central1"` or `"global"`                   |
| `httpOptions.baseUrl`        | Yes      | Custom API endpoint               | `"https://proxy.example.com/v1/llms/vertexai/"` |
| `httpOptions.headers`        | Yes      | Custom headers for authentication | See example above                               |
| `security.auth.selectedType` | Yes      | Auth method                       | `"vertex-ai"`                                   |

## Usage

After installation, use gemini-cli normally:

```bash
# Simple query
gemini "What is the capital of France?"

# Interactive mode
gemini -i

# With streaming
gemini "Explain quantum computing" --stream
```

The CLI will route all requests through your configured Apogee proxy with the
specified headers.

## Technical Implementation

### Files Modified

1. **`packages/cli/src/config/auth.ts`**
   - Added validation to check `project` and `location` from settings.json
   - Previously only checked environment variables (`GOOGLE_CLOUD_PROJECT`,
     `GOOGLE_CLOUD_LOCATION`)

2. **`packages/core/src/core/contentGenerator.ts`**
   - Set `apiKey = undefined` when using `project`/`location` configuration
   - Prevents "Project/location and API key are mutually exclusive" error from
     Google SDK
   - API key is now only passed via `httpOptions.headers`

### How It Works

1. User configures `httpOptions` with custom `baseUrl` and `headers` in
   `~/.gemini/settings.json`
2. CLI validates that either:
   - Environment variables (`GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`),
     OR
   - Settings.json (`project` + `location`), OR
   - Environment variable `GOOGLE_API_KEY` (for express mode)
3. When creating the GoogleGenAI client:
   - If `project`/`location` are set, `apiKey` parameter is set to `undefined`
   - API key is passed only in `httpOptions.headers` (for custom proxy
     authentication)
   - All configured headers are merged with default headers

### Commits Included

1. `feat: Add httpOptions support for custom API endpoints` (2b13cf36f)
2. `feat: Add Vertex AI project/location support from settings` (b4b1686ac)
3. `fix: Prevent duplicate prompt when using positional arguments` (8370c8845)
4. `fix: Support project/location from settings.json for Vertex AI validation`
   (this commit)

## Testing

Successfully tested with the following commands:

```bash
# Test 1: Basic query
$ gemini "Say hello"
Hello! I am ready to assist you with your software engineering tasks...

# Test 2: Math query
$ gemini "What is 2+2?"
2 + 2 is 4.
```

All requests successfully routed through the Apogee proxy with proper
authentication.

## Troubleshooting

### "When using Vertex AI, you must specify either..."

**Cause:** Your configuration is incomplete.

**Solution:** Ensure you have either:

- `project` and `location` in your `~/.gemini/settings.json`, OR
- `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` environment variables set

### "Project/location and API key are mutually exclusive"

**Cause:** You're passing both an API key parameter AND project/location to the
SDK.

**Solution:**

1. Ensure you've applied this patch
2. Run `npm run build && npm run bundle` to rebuild
3. Unset `GOOGLE_API_KEY` environment variable: `unset GOOGLE_API_KEY`
4. API key should only be in `httpOptions.headers` in settings.json

### API calls not reaching the proxy

**Cause:** Settings file not found or misconfigured.

**Solution:**

1. Verify settings file exists: `cat ~/.gemini/settings.json`
2. Check JSON syntax is valid: `python3 -m json.tool ~/.gemini/settings.json`
3. Verify `httpOptions.baseUrl` ends with a trailing slash

## Branch

This patch is on branch: `fix-custom-baseurl-support`

## Environment Tested

- Node version: v22.17.1
- Platform: darwin (macOS)
- gemini-cli version: 0.20.0-nightly.20251201
