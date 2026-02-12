# Web search and fetch

Access the live internet directly from your prompt. In this guide, you'll learn
how to search for up-to-date documentation, fetch deep context from specific
URLs, and apply that knowledge to your code.

## Prerequisites

- Gemini CLI installed and authenticated.
- An internet connection.

## How to research new technologies

Imagine you want to use a library released yesterday. The model doesn't know
about it yet. You need to teach it.

### Scenario: Find documentation

**Prompt:**
`Search for the 'Bun 1.0' release notes and summarize the key changes.`

Gemini uses the `google_web_search` tool to find relevant pages and synthesizes
an answer. This "grounding" process ensures the agent isn't hallucinating
features that don't exist.

**Prompt:** `Find the documentation for the 'React Router v7' loader API.`

## How to fetch deep context

Search gives you a summary, but sometimes you need the raw details. The
`web_fetch` tool lets you feed a specific URL directly into the agent's context.

### Scenario: Reading a blog post

You found a blog post with the exact solution to your bug.

**Prompt:**
`Read https://example.com/fixing-memory-leaks and explain how to apply it to my code.`

Gemini will retrieve the page content (stripping away ads and navigation) and
use it to answer your question.

### Scenario: Comparing sources

You can even fetch multiple pages to compare approaches.

**Prompt:**
`Compare the pagination patterns in https://api.example.com/v1/docs and https://api.example.com/v2/docs.`

## How to apply knowledge to code

The real power comes when you combine web tools with file editing.

**Workflow:**

1.  **Search:** "How do I implement auth with Supabase?"
2.  **Fetch:** "Read this guide: https://supabase.com/docs/guides/auth."
3.  **Implement:** "Great. Now use that pattern to create an `auth.ts` file in
    my project."

## How to troubleshoot errors

When you hit an obscure error message, paste it into the chat.

**Prompt:**
`I'm getting 'Error: hydration mismatch' in Next.js. Search for recent solutions.`

The agent will search sources such as GitHub issues, StackOverflow, and forums
to find relevant fixes that might be too new to be in its base training set.

## Next steps

- Explore [File management](file-management.md) to see how to apply the code you
  generate.
- See the [Web search tool reference](../../tools/web-search.md) for citation
  details.
- See the [Web fetch tool reference](../../tools/web-fetch.md) for technical
  limitations.
