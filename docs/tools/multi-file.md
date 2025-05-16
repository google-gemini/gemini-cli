# Multi-File Read Tool

This document provides details on the `read_many_files` tool.

## `read_many_files`

- **Purpose:** Reads content from multiple text files specified by paths or glob patterns and concatenates them into a single string. This is useful for getting an overview of a codebase, finding where specific functionality is implemented, reviewing documentation, or gathering context from multiple configuration files.
- **Arguments:**
  - `paths` (list[string], required): An array of glob patterns or paths relative to the tool's target directory (e.g., `["src/**/*.ts"]`, `["README.md", "docs/"]`).
  - `exclude` (list[string], optional): Glob patterns for files/directories to exclude (e.g., `["**/*.log", "temp/"]`). These are added to default excludes if `useDefaultExcludes` is true.
  - `include` (list[string], optional): Additional glob patterns to include. These are merged with `paths` (e.g., `["*.test.ts"]` to specifically add test files if they were broadly excluded).
  - `recursive` (boolean, optional): Whether to search recursively. This is primarily controlled by `**` in glob patterns. Defaults to `true`.
  - `useDefaultExcludes` (boolean, optional): Whether to apply a list of default exclusion patterns (e.g., `node_modules`, `.git`, binary files). Defaults to `true`.
- **Behavior:**
  - The tool searches for files matching the provided `paths` and `include` patterns, while respecting `exclude` patterns and default excludes (if enabled).
  - It reads the content of each matched text file (attempting to skip binary files).
  - The content of all successfully read files is concatenated into a single string, with a separator `--- {filePath} ---` between the content of each file.
  - Uses UTF-8 encoding by default.
- **Examples:**
  - Reading all TypeScript files in the `src` directory:
    ```
    read_many_files(paths=["src/**/*.ts"])
    ```
  - Reading the main README and all Markdown files in the `docs` directory, excluding a specific file:
    ```
    read_many_files(paths=["README.md", "docs/**/*.md"], exclude=["docs/OLD_README.md"])
    ```
  - Reading all JavaScript files but explicitly including test files that might otherwise be excluded by a global pattern:
    ```
    read_many_files(paths=["**/*.js"], include=["**/*.test.js"], useDefaultExcludes=False)
    ```
- **Important Notes:**
  - **Binary Files:** This tool is designed for text files and attempts to skip binary files. Its behavior with binary content is not guaranteed.
  - **Performance:** Reading a very large number of files or very large individual files can be resource-intensive.
  - **Path Specificity:** Ensure paths and glob patterns are correctly specified relative to the tool's target directory.
  - **Default Excludes:** Be aware of the default exclusion patterns (like `node_modules`, `.git`) and use `useDefaultExcludes=False` if you need to override them, but do so cautiously.
