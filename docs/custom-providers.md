# Custom Model Providers Configuration

The Gemini CLI now supports multiple model providers beyond Google's Gemini API. This document explains how to configure and use different model providers.

## Supported Providers

### 1. OpenAI Compatible APIs
This includes OpenAI's official API and any local LLM that implements OpenAI-compatible endpoints (like Ollama, LocalAI, etc.).

**Environment Variables:**
```bash
export OPENAI_API_KEY="your-openai-api-key"
export CUSTOM_BASE_URL="https://api.openai.com/v1"  # Optional, defaults to OpenAI
export CUSTOM_TIMEOUT="30000"  # Optional, timeout in milliseconds
```

**Usage:**
```bash
gemini --auth-type openai-compatible "Hello, world!"
```

### 2. Anthropic Claude API
Use Anthropic's Claude models directly.

**Environment Variables:**
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export CUSTOM_BASE_URL="https://api.anthropic.com"  # Optional, defaults to Anthropic
```

**Usage:**
```bash
gemini --auth-type anthropic "Hello, world!"
```

### 3. Local LLM Endpoints
For local LLMs running on your machine (like Ollama, LocalAI, etc.).

**Environment Variables:**
```bash
export LOCAL_LLM_API_KEY="dummy-key"  # Some local LLMs don't need real API keys
export CUSTOM_BASE_URL="http://localhost:8080"  # Your local LLM endpoint
export CUSTOM_TIMEOUT="60000"  # Optional, longer timeout for local processing
```

**Usage:**
```bash
gemini --auth-type local-llm "Hello, world!"
```

### 4. Azure OpenAI API
Use Azure OpenAI models.

**Environment Variables:** 
```bash
export AZURE_API_KEY="your-azure-api-key"
export AZURE_ENDPOINT_URL="https://your-azure-region.openai.azure.com"
export AZURE_API_VERSION="2025-01-01-preview"

**Usage:**
```bash
gemini --auth-type azure --model gpt-4o "Hello, Azure!"
```

## Configuration Examples

### Ollama Setup
If you're running Ollama locally:

```bash
# Start Ollama (if not already running)
ollama serve

# Set environment variables
export CUSTOM_BASE_URL="http://localhost:11434/v1"
export LOCAL_LLM_API_KEY="dummy-key"

# Use with Gemini CLI
gemini --auth-type local-llm --model llama2 "Explain quantum computing"
```

### LocalAI Setup
For LocalAI installations:

```bash
export CUSTOM_BASE_URL="http://localhost:8080/v1"
export LOCAL_LLM_API_KEY="dummy-key"

gemini --auth-type local-llm --model gpt-3.5-turbo "Write a Python function"
```

### OpenAI with Custom Endpoint
For OpenAI-compatible services:

```bash
export OPENAI_API_KEY="your-api-key"
export CUSTOM_BASE_URL="https://your-custom-endpoint.com/v1"

gemini --auth-type openai-compatible --model gpt-4 "Help me debug this code"
```

## Environment File Configuration

You can also set these in your `.env` file:

```bash
# .env file
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
LOCAL_LLM_API_KEY=dummy-key
CUSTOM_BASE_URL=http://localhost:11434/v1
CUSTOM_TIMEOUT=30000
```

## Authentication Types

The CLI now supports these authentication types:

- `oauth-personal` - Google OAuth (default)
- `gemini-api-key` - Google Gemini API key
- `vertex-ai` - Google Vertex AI
- `openai-compatible` - OpenAI or OpenAI-compatible APIs
- `anthropic` - Anthropic Claude API
- `local-llm` - Local LLM endpoints

## Model Selection

Different providers support different models:

**OpenAI:**
- `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, etc.

**Anthropic:**
- `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`

**Local LLMs:**
- Depends on your local setup (e.g., `llama2`, `codellama`, `mistral`)

## Limitations

1. **Token Counting**: For non-Google providers, token counting is approximated
2. **Embeddings**: Only OpenAI-compatible providers support embeddings
3. **Streaming**: All providers support streaming responses
4. **Function Calling**: Support depends on the specific model and provider

## Troubleshooting

### Connection Issues
- Verify your local LLM is running and accessible
- Check firewall settings for local endpoints
- Ensure the correct port and protocol (http/https)

### Authentication Errors
- Verify API keys are correctly set
- Check if the API key has the necessary permissions
- For local LLMs, some don't require real API keys

### Model Not Found
- Ensure the model name matches what your provider supports
- For local LLMs, make sure the model is downloaded/available

### Timeout Issues
- Increase `CUSTOM_TIMEOUT` for slower local processing
- Check network connectivity for remote providers

## Advanced Configuration

### Custom Headers
You can add custom headers by modifying the `customHeaders` in the configuration:

```typescript
// This would require code modification
contentGeneratorConfig.customHeaders = {
  'X-Custom-Header': 'value',
  'Authorization': `Bearer ${apiKey}`,
};
```

### Proxy Support
The CLI supports proxy configuration through the existing proxy settings in the main configuration.
