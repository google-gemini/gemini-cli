# Gemini CLI file system tools

The Gemini CLI provides a comprehensive suite of tools for interacting with the local file system. These tools allow the Gemini model to read from, write to, list, search, and modify files and directories, all under your control and typically with confirmation for sensitive operations.

**Note:** All file system tools operate within a `rootDirectory` (usually the current working directory where you launched the CLI) for security. Paths that you provide to these tools are generally expected to be absolute or are resolved relative to this root directory.

## 1. `list_directory` (ReadFolder)

`list_directory` lists the names of files and subdirectories directly within a specified directory path. It can optionally ignore entries matching provided glob patterns.

- **Tool name:** `list_directory`
- **Display name:** ReadFolder
- **File:** `ls.ts`
- **Parameters:**
  - `path` (string, required): The absolute path to the directory to list.
  - `ignore` (array of strings, optional): A list of glob patterns to exclude from the listing (e.g., `["*.log", ".git"]`).
  - `respect_git_ignore` (boolean, optional): Whether to respect `.gitignore` patterns when listing files. Defaults to `true`.
- **Behavior:**
  - Returns a list of file and directory names.
  - Indicates whether each entry is a directory.
  - Sorts entries with directories first, then alphabetically.
- **Output (`llmContent`):** A string like: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation:** No.

## 2. `read_file` (ReadFile)

`read_file` reads and returns the content of a specified file. This tool handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges. Other binary file types are generally skipped.

- **Tool name:** `read_file`
- **Display name:** ReadFile
- **File:** `read-file.ts`
- **Parameters:**
  - `path` (string, required): The absolute path to the file to read.
  - `offset` (number, optional): For text files, the 0-based line number to start reading from. Requires `limit` to be set.
  - `limit` (number, optional): For text files, the maximum number of lines to read. If omitted, reads a default maximum (e.g., 2000 lines) or the entire file if feasible.
- **Behavior:**
  - For text files: Returns the content. If `offset` and `limit` are used, returns only that slice of lines. Indicates if content was truncated due to line limits or line length limits.
  - For image and PDF files: Returns the file content as a base64-encoded data structure suitable for model consumption.
  - For other binary files: Attempts to identify and skip them, returning a message indicating it's a generic binary file.
- **Output:** (`llmContent`):
  - For text files: The file content, potentially prefixed with a truncation message (e.g., `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`).
  - For image/PDF files: An object containing `inlineData` with `mimeType` and base64 `data` (e.g., `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`).
  - For other binary files: A message like `Cannot display content of binary file: /path/to/data.bin`.
- **Confirmation:** No.

## 3. `write_file` (WriteFile)

`write_file` writes content to a specified file. If the file exists, it will be overwritten. If the file doesn't exist, it (and any necessary parent directories) will be created.

- **Tool name:** `write_file`
- **Display name:** WriteFile
- **File:** `write-file.ts`
- **Parameters:**
  - `file_path` (string, required): The absolute path to the file to write to.
  - `content` (string, required): The content to write into the file.
- **Behavior:**
  - Writes the provided `content` to the `file_path`.
  - Creates parent directories if they don't exist.
- **Output (`llmContent`):** A success message, e.g., `Successfully overwrote file: /path/to/your/file.txt` or `Successfully created and wrote to new file: /path/to/new/file.txt`.
- **Confirmation:** Yes. Shows a diff of changes and asks for user approval before writing.

## 4. `glob` (FindFiles)

`glob` finds files matching specific glob patterns (e.g., `src/**/*.ts`, `*.md`), returning absolute paths sorted by modification time (newest first).

- **Tool name:** `glob`
- **Display name:** FindFiles
- **File:** `glob.ts`
- **Parameters:**
  - `pattern` (string, required): The glob pattern to match against (e.g., `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): The absolute path to the directory to search within. If omitted, searches the tool's root directory.
  - `case_sensitive` (boolean, optional): Whether the search should be case-sensitive. Defaults to `false`.
  - `respect_git_ignore` (boolean, optional): Whether to respect .gitignore patterns when finding files. Defaults to `true`.
- **Behavior:**
  - Searches for files matching the glob pattern within the specified directory.
  - Returns a list of absolute paths, sorted with the most recently modified files first.
  - Ignores common nuisance directories like `node_modules` and `.git` by default.
- **Output (`llmContent`):** A message like: `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **Confirmation:** No.

## 5. `search_file_content` (SearchText)

`search_file_content` searches for a regular expression pattern within the content of files in a specified directory. Can filter files by a glob pattern. Returns the lines containing matches, along with their file paths and line numbers.

- **Tool name:** `search_file_content`
- **Display name:** SearchText
- **File:** `grep.ts`
- **Parameters:**
  - `pattern` (string, required): The regular expression (regex) to search for (e.g., `"function\s+myFunction"`).
  - `path` (string, optional): The absolute path to the directory to search within. Defaults to the current working directory.
  - `include` (string, optional): A glob pattern to filter which files are searched (e.g., `"*.js"`, `"src/**/*.{ts,tsx}"`). If omitted, searches most files (respecting common ignores).
- **Behavior:**
  - Uses `git grep` if available in a Git repository for speed, otherwise falls back to system `grep` or a JavaScript-based search.
  - Returns a list of matching lines, each prefixed with its file path (relative to the search directory) and line number.
- **Output (`llmContent`):** A formatted string of matches, e.g.:
  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---
  ```
- **Confirmation:** No.

## 6. `replace` (Edit)

`replace` replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when `expected_replacements` is specified. This tool is designed for precise, targeted changes and requires significant context around the `old_string` to ensure it modifies the correct location.

- **Tool name:** `replace`
- **Display name:** Edit
- **File:** `edit.ts`
- **Parameters:**
  - `file_path` (string, required): The absolute path to the file to modify.
  - `old_string` (string, required): The exact literal text to replace.

    **CRITICAL:** This string must uniquely identify the single instance to change. It should include at least 3 lines of context _before_ and _after_ the target text, matching whitespace and indentation precisely. If `old_string` is empty, the tool attempts to create a new file at `file_path` with `new_string` as content.

  - `new_string` (string, required): The exact literal text to replace `old_string` with.
  - `expected_replacements` (number, optional): The number of occurrences to replace. Defaults to `1`.

- **Behavior:**
  - If `old_string` is empty and `file_path` does not exist, creates a new file with `new_string` as content.
  - If `old_string` is provided, it reads the `file_path` and attempts to find exactly one occurrence of `old_string`.
  - If one occurrence is found, it replaces it with `new_string`.
  - **Enhanced Reliability (Multi-Stage Edit Correction):** To significantly improve the success rate of edits, especially when the model-provided `old_string` might not be perfectly precise, the tool incorporates a multi-stage edit correction mechanism.
    - If the initial `old_string` isn't found or matches multiple locations, the tool can leverage the Gemini model to iteratively refine `old_string` (and potentially `new_string`).
    - This self-correction process attempts to identify the unique segment the model intended to modify, making the `replace` operation more robust even with slightly imperfect initial context.
- **Failure conditions:** Despite the correction mechanism, the tool will fail if:
  - `file_path` is not absolute or is outside the root directory.
  - `old_string` is not empty, but the `file_path` does not exist.
  - `old_string` is empty, but the `file_path` already exists.
  - `old_string` is not found in the file after attempts to correct it.
  - `old_string` is found multiple times, and the self-correction mechanism cannot resolve it to a single, unambiguous match.
- **Output (`llmContent`):**
  - On success: `Successfully modified file: /path/to/file.txt (1 replacements).` or `Created new file: /path/to/new_file.txt with provided content.`
  - On failure: An error message explaining the reason (e.g., `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`).
- **Confirmation:** Yes. Shows a diff of the proposed changes and asks for user approval before writing to the file.

These file system tools provide a foundation for the Gemini CLI to understand and interact with your local project context.
