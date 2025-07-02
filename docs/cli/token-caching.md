# Token Caching and Cost Optimization

Gemini CLI automatically optimizes API costs through token caching when using API key authentication (Gemini API key or Vertex AI). This feature reuses previous system instructions and context to reduce the number of tokens processed in subsequent requests.

**Token caching is available for:**

- API key users (Gemini API key)
- Vertex AI users (with project and location setup)

**Token caching is not available for:**

- OAuth users (Google Personal/Enterprise accounts) - the Code Assist API does not support cached content creation at this time

## How It Works

When you interact with the Gemini CLI, certain parts of the conversation context and system instructions (e.g., from `GEMINI.md` files) are static or change infrequently. The token caching mechanism identifies these stable components and stores their tokenized representations locally. In subsequent requests, instead of re-sending the full content, the CLI sends references to these cached tokens, significantly reducing the overall token count for the request.

## Monitoring Token Usage

You can view your token usage and the savings achieved through token caching using the `/stats` command. When cached tokens are utilized, they will be clearly displayed in the statistics output, providing transparency into your API consumption.

## Best Practices for Maximizing Caching

- **Leverage Context Files:** Utilize `GEMINI.md` files to provide stable, project-specific instructions and context. This content is highly cacheable.
- **Consistent Prompts:** While dynamic prompts are essential, try to maintain consistency in the structural elements of your prompts where possible.
- **Update Infrequently:** If you have large, static instructional content, avoid frequent, minor edits to it, as this can invalidate the cache.
