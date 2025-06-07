# Memory Tool

This document provides details on the `save_memory` tool.

## `save_memory`

- **Purpose:** Saves a specific piece of information or fact to your long-term memory. This allows the CLI to remember key details across sessions, providing more personalized and effective assistance.
- **Arguments:**
  - `fact` (string, required): The specific fact or piece of information to remember. This should be a clear, self-contained statement.
- **Behavior:**
  - The tool appends the provided `fact` to a special `GEMINI.md` file located in the user's home directory (`~/.gemini/GEMINI.md`). This file can be configured to have a different name.
  - The facts are stored under a `## Gemini Added Memories` section.
  - This file is loaded as context in subsequent sessions, allowing the CLI to recall the saved information.
- **Examples:**
  - Remembering a user preference:
    ```
    save_memory(fact="My preferred programming language is Python.")
    ```
  - Storing a project-specific detail:
    ```
    save_memory(fact="The project I'm currently working on is called 'gemini-cli'.")
    ```
- **Important Notes:**
  - This tool should be used for concise, important facts. It is not intended for storing large amounts of data or conversational history.
  - The memory file is a plain text Markdown file, so you can view and edit it manually if needed.
