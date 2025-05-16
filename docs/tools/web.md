# Web Fetch Tool

This document describes the `web_fetch` tool.

## `web_fetch`

- **Purpose:** Fetches text content from a given URL. This is useful for retrieving data from web pages, APIs, or other online resources.
- **Arguments:**
  - `url` (string, required): The absolute URL to fetch (e.g., `https://example.com/data.txt`).
- **Behavior:**
  - The tool attempts to retrieve the content from the specified URL.
  - It handles potential network errors (e.g., DNS resolution failure, connection timeout) and non-success HTTP status codes (e.g., 404 Not Found, 500 Internal Server Error).
  - The returned content is expected to be text-based. For binary files, the behavior might be undefined or result in garbled text.
- **Examples:**
  - Fetching a plain text file:
    ```
    web_fetch(url="https://example.com/robots.txt")
    ```
  - Retrieving data from a simple API endpoint:
    ```
    web_fetch(url="https://api.example.com/items/123")
    ```
- **Important Notes:**
  - **Content Type:** This tool is primarily designed for text-based content. It may not be suitable for fetching binary files like images or executables.
  - **Error Handling:** Always check the tool's output for error messages or status indicators to ensure the fetch was successful and the content is as expected.
  - **Rate Limiting/Authentication:** Be mindful of website terms of service, rate limits, and authentication requirements. This tool does not inherently handle complex authentication mechanisms.
