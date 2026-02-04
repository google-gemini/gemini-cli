# Use web search and fetch in prompts

Gemini CLI can access the internet to provide you with up-to-date information,
news, and content from specific URLs. You can trigger these capabilities by
simply asking for them in your prompts.

## Search the web

If you need information that isn't in the model's training data (for example,
recent events or current documentation), just ask Gemini to search for it.

- "Search for the latest advancements in..."
- "What is the current version of the React documentation?"
- "Find a tutorial on how to use..."

The model will use the `google_web_search` tool and provide a summary with
citations.

## Fetch content from URLs

You can ask Gemini to summarize, compare, or extract data from specific web
pages by including the URLs directly in your prompt.

- "Summarize https://example.com/article"
- "What are the key points from this blog post: https://another.com/post"
- "Compare the conclusions of these two papers: https://arxiv.org/abs/... and
  https://arxiv.org/abs/..."

The model will use the `web_fetch` tool to retrieve the content and process it
according to your instructions.

## Next steps

- See the [Web search tool reference](../tools/web-search.md) for technical
  details.
- See the [Web fetch tool reference](../tools/web-fetch.md) for URL limits and
  fallback behavior.
