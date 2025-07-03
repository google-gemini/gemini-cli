## Recent Gemini CLI Updates

This section summarizes the latest features, enhancements, and fixes to the Gemini CLI tools and functions, as of July 2, 2025.

### Tools and Functions Updates

| Tool                              | Description                                                | Updates                                                                      | Example                                                        |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ls` (ReadFolder)                 | Lists files and directories in the current project folder. | Improved performance for large directories with optimized file listing.      | `ls`                                                           |
| `read-file` (ReadFile)            | Reads and displays the content of a specified file.        | None                                                                         | `read-file src/index.js`                                       |
| `read-many-files` (ReadManyFiles) | Reads multiple files matching a glob pattern.              | Added support for git-aware filtering in file reading.                       | `read-many-files *.py`                                         |
| `glob` (FindFiles)                | Searches for files matching a specified pattern.           | None                                                                         | `glob **/*.json`                                               |
| `grep` (SearchText)               | Searches for specific text within files.                   | None                                                                         | `grep 'TODO' src/*.js`                                         |
| `edit` (Edit)                     | Proposes and applies code changes via diffs.               | Fixed pluralization of error messages in EditTool.                           | `edit src/index.js 'Add error handling to fetchData function'` |
| `write-file` (WriteFile)          | Creates or overwrites a file with specified content.       | None                                                                         | `write-file README.md 'Add project description'`               |
| `shell` (ShellTool)               | Executes shell commands directly.                          | Added command-specific restrictions for ShellTool.                           | `!npm install express`                                         |
| `web-fetch` (WebFetch)            | Fetches content from a URL for analysis.                   | None                                                                         | `web-fetch https://api.example.com/data`                       |
| `web-search` (GoogleSearch)       | Performs a Google search.                                  | Enhanced grounding with Google Search integration.                           | `web-search 'JavaScript async await tutorial'`                 |
| `memoryTool` (MemoryTool)         | Stores facts or preferences during a session.              | None                                                                         | `memoryTool 'Prefer async/await over promises'`                |
| `/tools`                          | Lists all available Gemini CLI tools.                      | None                                                                         | `/tools`                                                       |
| `/auth`                           | Manages authentication.                                    | Renamed authentication type LOGIN_WITH_GOOGLE_PERSONAL to LOGIN_WITH_GOOGLE. | `/auth`                                                        |
| `/compress`                       | Compresses context to fit within token limits.             | Introduced /compress tool for context management.                            | `/compress`                                                    |
| `checkpoint`                      | Restores project files to a previous state.                | Added checkpointing functionality.                                           | `checkpoint`                                                   |
| `stats`                           | Displays detailed session statistics.                      | Improved stats display with cached token information.                        | `stats`                                                        |
| `theme`                           | Opens a dialog to change the visual theme.                 | Revamped exit stats display and theme UI.                                    | `theme`                                                        |

### New Features

- **Modular GEMINI.md Imports**: Supports importing external markdown files into GEMINI.md using `@docs/tools/multi-file.md` syntax for modular project instructions.
- **MCP Server Integration**: Enhanced support for Model Context Protocol (MCP) servers to extend CLI capabilities with external tools and services.
- **Multimodal Capabilities**: Supports generating apps from PDFs or sketches and integrating with media generation models like Imagen, Veo, or Lyria.

### General Updates

- **Error Handling Improvements**: Enhanced error handling for tool calls to provide clearer feedback.
- **Triage Workflow Enhancements**: Improved automated issue triage workflows for GitHub integration.
- **UI Refinements**: Revamped UI elements, including exit stats and theme selection.

### Notes

- **Context**: Updates are based on the official Gemini CLI documentation and recent GitHub releases (up to July 2, 2025).
- **Limitations**: Some features (e.g., cached token stats) are only available with API key authentication. Image generation tools are accessible via MCP servers but not directly in the CLI.
- **Rate Limits**: Free tier offers 60 requests/minute and 1000 requests/day with Gemini 2.5 Pro. Higher limits available with paid API keys via Google AI Studio or Vertex AI.
