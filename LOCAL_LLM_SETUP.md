# Local LLM Integration Guide

This guide explains how to use the Gemini CLI with local LLM providers like LM Studio, Ollama, or any OpenAI-compatible API endpoint.

## Overview

The Gemini CLI now supports connecting to local LLM servers that implement OpenAI-compatible APIs. This allows you to:

- Use models running on your local machine
- Maintain privacy by keeping data local
- Work offline without cloud dependencies
- Use custom fine-tuned models
- Reduce API costs

## Supported Local LLM Providers

Any local LLM provider that implements OpenAI-compatible APIs will work, including:

- **LM Studio** - User-friendly GUI for running local LLMs
- **Ollama** - Command-line tool for running local models
- **LocalAI** - Drop-in replacement for OpenAI API
- **text-generation-webui (oobabooga)** - Web interface with OpenAI API extension
- **llama.cpp** with server mode

## Setup Instructions

### Option 1: Using LM Studio

1. **Download and Install LM Studio**
   - Visit https://lmstudio.ai/
   - Download for your platform (Windows, Mac, Linux)
   - Install and launch LM Studio

2. **Download a Model**
   - Open LM Studio
   - Go to the "Discover" tab
   - Search for and download a model (recommended: Llama 3.1 8B, Mistral 7B, or Qwen 2.5)
   - Wait for the download to complete

3. **Start the Local Server**
   - Go to the "Local Server" tab in LM Studio
   - Select your downloaded model
   - Click "Start Server"
   - Note the server URL (typically `http://localhost:1234/v1`)

4. **Configure Gemini CLI**

   Create or edit `~/.gemini/settings.json`:

   ```json
   {
     "localLLM": {
       "baseURL": "http://localhost:1234/v1",
       "model": "your-model-name"
     }
   }
   ```

   The model name should match what you see in LM Studio (e.g., "llama-3.1-8b-instruct").

5. **Set Environment Variable**

   ```bash
   export LOCAL_LLM_BASE_URL=http://localhost:1234/v1
   export LOCAL_LLM_MODEL=llama-3.1-8b-instruct
   ```

### Option 2: Using Ollama

1. **Install Ollama**
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.com/install.sh | sh

   # Or visit https://ollama.com/download for other platforms
   ```

2. **Pull a Model**
   ```bash
   ollama pull llama3.1
   # or
   ollama pull mistral
   ```

3. **Start Ollama Server**
   ```bash
   ollama serve
   ```

   Ollama runs on `http://localhost:11434` by default.

4. **Configure for OpenAI Compatibility**

   Ollama's OpenAI-compatible endpoint is at `/v1`:

   ```bash
   export LOCAL_LLM_BASE_URL=http://localhost:11434/v1
   export LOCAL_LLM_MODEL=llama3.1
   ```

   Or in `~/.gemini/settings.json`:

   ```json
   {
     "localLLM": {
       "baseURL": "http://localhost:11434/v1",
       "model": "llama3.1"
     }
   }
   ```

### Option 3: Using LocalAI

1. **Install LocalAI**
   ```bash
   # Using Docker
   docker run -p 8080:8080 --name local-ai -ti localai/localai:latest
   ```

2. **Configure Gemini CLI**
   ```bash
   export LOCAL_LLM_BASE_URL=http://localhost:8080/v1
   export LOCAL_LLM_MODEL=gpt-3.5-turbo  # or your model name
   ```

## Configuration Options

### Environment Variables

- `LOCAL_LLM_BASE_URL` - The base URL of your local LLM API endpoint (required)
- `LOCAL_LLM_API_KEY` - API key if your local server requires authentication (optional)
- `LOCAL_LLM_MODEL` - The model name to use (required)

### Settings File (`~/.gemini/settings.json`)

```json
{
  "localLLM": {
    "baseURL": "http://localhost:1234/v1",
    "apiKey": "optional-api-key",
    "model": "your-model-name"
  }
}
```

**Note**: Environment variables take precedence over settings file values.

## Usage

Once configured, simply run the Gemini CLI as usual. The CLI will automatically detect the local LLM configuration and use it instead of Google's Gemini API.

```bash
# Interactive mode
gemini

# One-shot prompt
gemini "Explain what a binary tree is"

# With prompt flag
gemini -p "Write a Python function to sort a list"
```

## Model Selection

Different models have different capabilities and resource requirements:

### Recommended Models

| Model | Size | Use Case | Memory Required |
|-------|------|----------|----------------|
| Llama 3.1 8B | 8B | General purpose, good balance | ~8 GB |
| Mistral 7B | 7B | Fast, efficient | ~6 GB |
| Qwen 2.5 7B | 7B | Multilingual, coding | ~6 GB |
| Gemma 2 9B | 9B | Google's open model | ~10 GB |
| Llama 3.1 70B | 70B | Highest quality (if you have GPU) | ~48 GB |

### Finding Model Names

**LM Studio**: The model name is shown in the Local Server tab when you select a model.

**Ollama**: List available models with:
```bash
ollama list
```

**LocalAI**: Check your LocalAI configuration or API documentation.

## Troubleshooting

### "Local LLM API error: connect ECONNREFUSED"

The local LLM server is not running or the URL is incorrect.

**Solution**:
- Verify your local LLM server is running
- Check the base URL is correct
- For LM Studio, ensure the server is started in the Local Server tab
- For Ollama, run `ollama serve`

### "Model not found" Error

The model name doesn't match what's available on your local server.

**Solution**:
- For LM Studio: Check the exact model name in the Local Server tab
- For Ollama: Run `ollama list` to see available models
- Ensure the model name in settings matches exactly (case-sensitive)

### Slow Response Times

The model may be too large for your hardware.

**Solution**:
- Try a smaller model (7B instead of 13B)
- Check CPU/GPU usage
- For LM Studio, adjust context length and GPU layers in settings
- Close other applications to free up RAM

### Empty or Incomplete Responses

The model may have stopped generating due to token limits or context issues.

**Solution**:
- Increase max output tokens in your local LLM server settings
- For LM Studio: Adjust "Max Tokens" in Local Server settings
- Try a different model
- Simplify your prompt

## Performance Tips

1. **Use GPU Acceleration**: If you have a compatible GPU (NVIDIA/AMD), enable GPU acceleration in your local LLM server for much faster inference.

2. **Adjust Context Length**: Shorter context windows use less memory and are faster. Start with 2048-4096 tokens.

3. **Choose Appropriate Models**: Smaller models (7B-8B) are faster but less capable. Larger models (13B+) are slower but more accurate.

4. **Enable Quantization**: Use quantized models (Q4, Q5) for better performance with minimal quality loss.

5. **Model Selection for Coding**: Models like Qwen, CodeLlama, or StarCoder are optimized for code generation.

## Limitations

- **Function Calling**: Some local models may not support function calling in the same way as Gemini. The CLI will work but may not use tools as effectively.

- **Embedding**: Embedding functionality is not supported with local LLMs. Use Gemini API for embedding-related features.

- **Token Counting**: Token counting for local LLMs uses a rough estimate (4 characters per token) rather than precise counting.

- **Thinking Mode**: The advanced "thinking mode" feature is Gemini-specific and won't work with local LLMs.

- **Streaming**: Streaming is supported but may vary by local LLM implementation.

## Switching Back to Gemini

To switch back to using Google's Gemini API, you can:

1. **Remove environment variables**:
   ```bash
   unset LOCAL_LLM_BASE_URL
   unset LOCAL_LLM_MODEL
   ```

2. **Remove from settings**: Delete the `localLLM` section from `~/.gemini/settings.json`

3. **Set Gemini API key**:
   ```bash
   export GEMINI_API_KEY=your-api-key
   ```

## Example Configurations

### LM Studio with Llama 3.1 8B

```json
{
  "localLLM": {
    "baseURL": "http://localhost:1234/v1",
    "model": "llama-3.1-8b-instruct"
  }
}
```

### Ollama with Mistral

```json
{
  "localLLM": {
    "baseURL": "http://localhost:11434/v1",
    "model": "mistral"
  }
}
```

### LocalAI with Custom Model

```json
{
  "localLLM": {
    "baseURL": "http://localhost:8080/v1",
    "apiKey": "your-optional-key",
    "model": "custom-model-name"
  }
}
```

### Remote Local LLM (Another Machine on Network)

```json
{
  "localLLM": {
    "baseURL": "http://192.168.1.100:1234/v1",
    "model": "llama-3.1-8b-instruct"
  }
}
```

## Support

For issues specific to:
- **LM Studio**: Visit https://lmstudio.ai/docs
- **Ollama**: Visit https://ollama.com/docs
- **Gemini CLI**: Open an issue on the GitHub repository

## Contributing

If you encounter issues with specific local LLM providers or have suggestions for improvements, please open an issue or submit a pull request to the Gemini CLI repository.
