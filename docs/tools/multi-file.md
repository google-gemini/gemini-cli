# Multi-File Read Tool

This document provides details on the `read_many_files` tool.

## `read_many_files`

- **Purpose:** Reads content from multiple files specified by paths or glob patterns. For text files, it concatenates their content into a single string. For image (e.g., PNG, JPEG) and PDF files, it reads and returns them as base64 encoded data, provided they are explicitly requested by name or extension. This is useful for getting an overview of a codebase, finding where specific functionality is implemented, reviewing documentation, or gathering context from multiple configuration files.
- **Arguments:**
  - `paths` (list[string], required): An array of glob patterns or paths relative to the tool's target directory (e.g., `["src/**/*.ts"]`, `["README.md", "docs/", "assets/logo.png"]`).
  - `exclude` (list[string], optional): Glob patterns for files/directories to exclude (e.g., `["**/*.log", "temp/"]`). These are added to default excludes if `useDefaultExcludes` is true.
  - `include` (list[string], optional): Additional glob patterns to include. These are merged with `paths` (e.g., `["*.test.ts"]` to specifically add test files if they were broadly excluded, or `["images/*.jpg"]` to include specific image types).
  - `recursive` (boolean, optional): Whether to search recursively. This is primarily controlled by `**` in glob patterns. Defaults to `true`.
  - `useDefaultExcludes` (boolean, optional): Whether to apply a list of default exclusion patterns (e.g., `node_modules`, `.git`, non image/pdf binary files). Defaults to `true`.
- **Behavior:**
  - The tool searches for files matching the provided `paths` and `include` patterns, while respecting `exclude` patterns and default excludes (if enabled).
  - For text files: it reads the content of each matched file (attempting to skip binary files not explicitly requested as image/PDF) and concatenates it into a single string, with a separator `--- {filePath} ---` between the content of each file. Uses UTF-8 encoding by default.
  - For image and PDF files: if explicitly requested by name or extension (e.g., `paths: ["logo.png"]` or `include: ["*.pdf"]`), the tool reads the file and returns its content as a base64 encoded string.
  - The tool attempts to detect and skip other binary files (those not matching common image/PDF types or not explicitly requested) by checking for null bytes in their initial content.
- **Examples:**
  - Reading all TypeScript files in the `src` directory:
    ```
    read_many_files(paths=["src/**/*.ts"])
    ```
  - Reading the main README, all Markdown files in the `docs` directory, and a specific logo image, excluding a specific file:
    ```
    read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
    ```
  - Reading all JavaScript files but explicitly including test files and all JPEGs in an `images` folder:
    ```
    read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
    ```
- **Important Notes:**
  - **Binary File Handling:**
    - **Image/PDF Files:** The tool can read common image types (PNG, JPEG, etc.) and PDF files, returning them as base64 encoded data. These files _must_ be explicitly targeted by the `paths` or `include` patterns (e.g., by specifying the exact filename like `image.png` or a pattern like `*.jpeg`).
    - **Other Binary Files:** The tool attempts to detect and skip other types of binary files by examining their initial content for null bytes. Its behavior with such files is to exclude them from the output.
  - **Performance:** Reading a very large number of files or very large individual files can be resource-intensive.
  - **Path Specificity:** Ensure paths and glob patterns are correctly specified relative to the tool's target directory. For image/PDF files, ensure the patterns are specific enough to include them.
  - **Default Excludes:** Be aware of the default exclusion patterns (like `node_modules`, `.git`) and use `useDefaultExcludes=False` if you need to override them, but do so cautiously.
