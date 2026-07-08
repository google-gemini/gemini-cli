# Web search tool (`google_web_search`)

The `google_web_search` tool allows the Gemini agent to retrieve up-to-date
information, news, and facts from the internet via Google Search.

## Technical reference

The agent uses this tool when your request requires knowledge of current events
or specific online documentation not available in its internal training data.

### Arguments

- `query` (string, required): The search query to be executed.

## Technical behavior

- **Grounding:** Returns a generated summary based on search results.
- **Citations:** Includes source URIs and titles for factual grounding.
- **Processing:** The Gemini API processes the search results before returning a
  synthesized response to the agent.

## Use cases

- Researching the latest version of a software library or API.
- Finding solutions to recent software bugs or security vulnerabilities.
- Retrieving news or documentation updated after the model's knowledge cutoff.

## Next steps

- Follow the [Web tools guide](../cli/tutorials/web-tools.md) for practical
  usage examples.
- Explore the [Web fetch tool reference](./web-fetch.md) for direct URL access.
