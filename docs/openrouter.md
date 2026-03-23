# Using OpenRouter with Gemini CLI

OpenRouter support allows you to use Gemini models through the OpenRouter API gateway. This provides an alternative way to access Gemini models with a unified API interface.

## Setup

1. **Get an OpenRouter API Key**
   - Sign up at [OpenRouter.ai](https://openrouter.ai)
   - Create an API key from your dashboard

2. **Set Environment Variable**
   ```bash
   export OPENROUTER_API_KEY="your-api-key-here"
   ```

   Or add it to your `.env` file:
   ```
   OPENROUTER_API_KEY=your-api-key-here
   ```

3. **Optional: Custom Base URL**
   If you're using a custom OpenRouter endpoint:
   ```bash
   export OPENROUTER_BASE_URL="https://your-custom-endpoint.com/api/v1"
   ```

4. **Set model explicitly for custom endpoints**
   For OpenRouter-compatible gateways (not `openrouter.ai`), set the provider-native model ID:
   ```bash
   export GEMINI_MODEL="glm-4.7"
   ```

## Usage

### Interactive Mode

1. Start Gemini CLI:
   ```bash
   gemini
   ```

2. When prompted for authentication method, select **"OpenRouter"**

3. The CLI will automatically use your OpenRouter API key

### Non-Interactive Mode

OpenRouter will be used automatically if you have the API key set:
```bash
echo "What is the capital of France?" | gemini
```

## Supported Models

When `OPENROUTER_BASE_URL` is the official `openrouter.ai` endpoint, the CLI
maps these Gemini aliases automatically:

- `gemini-2.5-pro` → `google/gemini-2.5-pro`
- `gemini-2.5-flash` → `google/gemini-2.5-flash`
- `gemini-2.5-pro-preview` → `google/gemini-2.5-pro-preview`
- `gemini-2.5-flash-preview` → `google/gemini-2.5-flash-preview`
- `gemini-2.0-flash-thinking-exp` → `google/gemini-2.0-flash-thinking-exp`
- `gemini-2.0-flash-exp` → `google/gemini-2.0-flash-exp`
- `gemini-pro` → `google/gemini-pro`
- `gemini-pro-vision` → `google/gemini-pro-vision`
- `gemini-1.5-pro` → `google/gemini-pro-1.5`
- `gemini-1.5-flash` → `google/gemini-flash-1.5`

For custom OpenRouter-compatible endpoints, the CLI sends the model as-is. Use
the exact model ID expected by your provider.

## Features

- ✅ Text generation
- ✅ Streaming responses
- ✅ Function calling
- ✅ JSON mode
- ❌ Embeddings (not supported for Gemini models via OpenRouter)

## Pricing

OpenRouter charges per token based on the model used. Check [OpenRouter pricing](https://openrouter.ai/models) for current rates.

## Troubleshooting

### "OPENROUTER_API_KEY not found" error
Make sure you've set the environment variable correctly:
```bash
echo $OPENROUTER_API_KEY
```

### Rate limiting
OpenRouter has rate limits based on your account tier. If you encounter rate limit errors, consider upgrading your OpenRouter account or reducing request frequency.

### Model not available
Some Gemini models may have limited availability on OpenRouter. Check the [OpenRouter models page](https://openrouter.ai/models) for current availability.
