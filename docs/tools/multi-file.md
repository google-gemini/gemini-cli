# Multi File Read Tool (`read_many_files`)

This document describes the `read_many_files` tool for the Gemini CLI.

## Description

Use `read_many_files` to read content from multiple files specified by paths or glob patterns. The behavior of this tool depends on the provided files:

- For text files, this tool concatenates their content into a single string.
- For image (e.g., PNG, JPEG), PDF, audio (MP3, WAV), and video (MP4, MOV) files, it reads and returns them as base64-encoded data, provided they are explicitly requested by name or extension.

`read_many_files` can be used to perform tasks such as getting an overview of a codebase, finding where specific functionality is implemented, reviewing documentation, or gathering context from multiple configuration files.

**Note:** `read_many_files` looks for files following the provided paths or glob patterns. A directory path such as `"/docs"` will return an empty result; the tool requires a pattern such as `"/docs/*"` or `"/docs/*.md"` to identify the relevant files.

### Arguments

`read_many_files` takes the following arguments:

- `paths` (list[string], required): An array of glob patterns or paths relative to the tool's target directory (e.g., `["src/**/*.ts"]`, `["README.md", "docs/*", "assets/logo.png"]`).
- `exclude` (list[string], optional): Glob patterns for files/directories to exclude (e.g., `["**/*.log", "temp/"]`). These are added to default excludes if `useDefaultExcludes` is true.
- `include` (list[string], optional): Additional glob patterns to include. These are merged with `paths` (e.g., `["*.test.ts"]` to specifically add test files if they were broadly excluded, or `["images/*.jpg"]` to include specific image types).
- `recursive` (boolean, optional): Whether to search recursively. This is primarily controlled by `**` in glob patterns. Defaults to `true`.
- `useDefaultExcludes` (boolean, optional): Whether to apply a list of default exclusion patterns (e.g., `node_modules`, `.git`, non image/pdf binary files). Defaults to `true`.
- `respect_git_ignore` (boolean, optional): Whether to respect .gitignore patterns when finding files. Defaults to true.

## How to use `read_many_files` with the Gemini CLI

`read_many_files` searches for files matching the provided `paths` and `include` patterns, while respecting `exclude` patterns and default excludes (if enabled).

- For text files: it reads the content of each matched file (attempting to skip binary files not explicitly requested as image/PDF) and concatenates it into a single string, with a separator `--- {filePath} ---` between the content of each file. Uses UTF-8 encoding by default.
- The tool inserts a `--- End of content ---` after the last file.
- For image and PDF files: if explicitly requested by name or extension (e.g., `paths: ["logo.png"]` or `include: ["*.pdf"]`), the tool reads the file and returns its content as a base64 encoded string.
- The tool attempts to detect and skip other binary files (those not matching common image/PDF types or not explicitly requested) by checking for null bytes in their initial content.

Usage:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` examples

Read all TypeScript files in the `src` directory:

```
read_many_files(paths=["src/**/*.ts"])
```

Read the main README, all Markdown files in the `docs` directory, and a specific logo image, excluding a specific file:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

Read all JavaScript files but explicitly include test files and all JPEGs in an `images` folder:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## Important notes

- **Binary file handling:**
  - **Image/PDF/Audio/Video files:** The tool can read common image types (PNG, JPEG, etc.), PDF, audio (mp3, wav), and video (mp4, mov) files, returning them as base64 encoded data. These files _must_ be explicitly targeted by the `paths` or `include` patterns (e.g., by specifying the exact filename like `video.mp4` or a pattern like `*.mov`).
  - **Other binary files:** The tool attempts to detect and skip other types of binary files by examining their initial content for null bytes. The tool excludes these files from its output.
- **Performance:** Reading a very large number of files or very large individual files can be resource-intensive.
- **Path specificity:** Ensure paths and glob patterns are correctly specified relative to the tool's target directory. For image/PDF files, ensure the patterns are specific enough to include them.
- **Default excludes:** Be aware of the default exclusion patterns (like `node_modules`, `.git`) and use `useDefaultExcludes=False` if you need to override them, but do so cautiously.
