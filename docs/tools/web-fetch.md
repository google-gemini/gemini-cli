# Web Fetch Tool

This document describes the `web_fetch` tool.

## `web_fetch`

- **Purpose:** Processes content from one or more URLs (up to 20) embedded in a prompt. This tool is ideal for tasks that require summarizing, comparing, or extracting specific information from web pages.
- **Arguments:**
  - `prompt` (string, required): A comprehensive prompt that includes the URL(s) (up to 20) to fetch and specific instructions on how to process their content. For example: `"Summarize https://example.com/article and extract key points from https://another.com/data"`. The prompt must contain at least one URL starting with `http://` or `https://`.
- **Behavior:**
  - The tool sends the prompt and the specified URLs to the Gemini API.
  - The API fetches the content of the URLs, processes it according to the instructions in the prompt, and returns a consolidated response.
  - The tool formats the response, including source attribution with citations, and returns it to the user.
- **Examples:**
  - Summarizing a single article:
    ```
    web_fetch(prompt="Can you summarize the main points of https://example.com/news/latest")
    ```
  - Comparing two articles:
    ```
    web_fetch(prompt="What are the differences in the conclusions of these two papers: https://arxiv.org/abs/2401.0001 and https://arxiv.org/abs/2401.0002?")
    ```
- **Important Notes:**
  - This tool relies on the Gemini API's ability to access and process the given URLs.
  - The quality of the output depends on the clarity of the instructions in the prompt.
