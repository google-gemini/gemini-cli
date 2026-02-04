# Web search tool (`google_web_search`)

The `google_web_search` tool lets you perform web searches using Google Search
via the Gemini API. Use this tool to retrieve up-to-date information, news, and
facts from the internet.

## Description

The `google_web_search` tool returns a summary of web results with sources. It
is useful for answering questions about current events or finding information
not present in the model's training data.

### Arguments

`google_web_search` takes one argument:

- `query` (string, required): The search query.

## How to use `google_web_search` with the Gemini CLI

The `google_web_search` tool sends a query to the Gemini API, which then
performs a web search. The tool returns a generated response based on the search
results, including citations and sources.

Usage:

```
google_web_search(query="Your query goes here.")
```

## `google_web_search` examples

Get information on a topic:

```
google_web_search(query="latest advancements in AI-powered code generation")
```

## Important notes

When using the web search tool, keep the following details in mind regarding the
nature of the returned information.

- **Response returned:** The `google_web_search` tool returns a processed
  summary, not a raw list of search results.
- **Citations:** The response includes citations to the sources used to generate
  the summary.

## Next steps

- Explore the [Web fetch tool](./web-fetch.md) to extract content from specific
  URLs.
- Learn how to [Provide context](../cli/gemini-md.md) to guide the search
  queries.
