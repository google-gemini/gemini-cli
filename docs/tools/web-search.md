# Google Web Search Tool

This document describes the `google_web_search` tool.

## `google_web_search`

- **Purpose:** Performs a web search using Google Search (via the Gemini API) and returns a summary of the results with sources. This tool is useful for finding up-to-date information on the internet.
- **Arguments:**
  - `query` (string, required): The search query.
- **Behavior:**
  - The tool sends the query to the Gemini API, which performs a Google Search.
  - It returns a generated response based on the search results, complete with citations and a list of sources.
- **Examples:**
  - Getting information on a topic:
    ```
    google_web_search(query="latest advancements in AI-powered code generation")
    ```
- **Important Notes:**
  - The tool returns a processed summary, not a raw list of search results.
  - The response includes citations to the sources used to generate the summary.
