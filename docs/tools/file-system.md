# File system tools reference

The Gemini CLI core provides a suite of tools for interacting with the local
file system. These tools allow the model to explore and modify your codebase.

## Technical reference

All file system tools operate within a `rootDirectory` (the current working
directory or workspace root) for security.

### `list_directory` (ReadFolder)

Lists the names of files and subdirectories directly within a specified path.

- **Tool name:** `list_directory`
- **Arguments:**
  - `dir_path` (string, required): Absolute or relative path to the directory.
  - `ignore` (array, optional): Glob patterns to exclude.
  - `file_filtering_options` (object, optional): Configuration for `.gitignore`
    and `.geminiignore` compliance.

### `read_file` (ReadFile)

Reads and returns the content of a specific file. Supports text, images, audio,
and PDF.

- **Tool name:** `read_file`
- **Arguments:**
  - `file_path` (string, required): Path to the file.
  - `offset` (number, optional): Start line for text files (0-based).
  - `limit` (number, optional): Maximum lines to read.

### `write_file` (WriteFile)

Writes content to a specified file, overwriting it if it exists or creating it
if not.

- **Tool name:** `write_file`
- **Arguments:**
  - `file_path` (string, required): Path to the file.
  - `content` (string, required): Data to write.
- **Confirmation:** Requires manual user approval.

### `glob` (FindFiles)

Finds files matching specific glob patterns across the workspace.

- **Tool name:** `glob`
- **Display name:** FindFiles
- **File:** `glob.ts`
- **Parameters:**
  - `pattern` (string, required): The glob pattern to match against (e.g.,
    `"*.py"`, `"src/**/*.js"`).
  - `path` (string, optional): The absolute path to the directory to search
    within. If omitted, searches the tool's root directory.
  - `case_sensitive` (boolean, optional): Whether the search should be
    case-sensitive. Defaults to `false`.
  - `respect_git_ignore` (boolean, optional): Whether to respect .gitignore
    patterns when finding files. Defaults to `true`.
- **Behavior:**
  - Searches for files matching the glob pattern within the specified directory.
  - Returns a list of absolute paths, sorted with the most recently modified
    files first.
  - Ignores common nuisance directories like `node_modules` and `.git` by
    default.
- **Output (`llmContent`):** A message like:
  `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **Confirmation:** No.

## 5. `grep_search` (SearchText)

`grep_search` searches for a regular expression pattern within the content of
files in a specified directory. Can filter files by a glob pattern. Returns the
lines containing matches, along with their file paths and line numbers.

- **Tool name:** `grep_search`
- **Display name:** SearchText
- **File:** `grep.ts`
- **Parameters:**
  - `pattern` (string, required): The regular expression (regex) to search for
    (e.g., `"function\s+myFunction"`).
  - `path` (string, optional): The absolute path to the directory to search
    within. Defaults to the current working directory.
  - `include` (string, optional): A glob pattern to filter which files are
    searched (e.g., `"*.js"`, `"src/**/*.{ts,tsx}"`). If omitted, searches most
    files (respecting common ignores).
- **Behavior:**
  - Uses `git grep` if available in a Git repository for speed; otherwise, falls
    back to system `grep` or a JavaScript-based search.
  - Returns a list of matching lines, each prefixed with its file path (relative
    to the search directory) and line number.
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

`replace` replaces text within a file. By default, the tool expects to find and
replace exactly ONE occurrence of `old_string`. If you want to replace multiple
occurrences of the exact same string, set `allow_multiple` to `true`. This tool
is designed for precise, targeted changes and requires significant context
around the `old_string` to ensure it modifies the correct location.

- **Tool name:** `replace`
- **Arguments:**
  - `file_path` (string, required): Path to the file.
  - `instruction` (string, required): Semantic description of the change.
  - `old_string` (string, required): Exact literal text to find.
  - `new_string` (string, required): Exact literal text to replace with.
  - `allow_multiple` (boolean, optional): If `true`, replaces all occurrences.
    If `false` (default), only succeeds if exactly one occurrence is found.
- **Confirmation:** Requires manual user approval.

## Next steps

- Follow the [File management tutorial](../cli/tutorials/file-management.md) for
  practical examples.
- Learn about [Trusted folders](../cli/trusted-folders.md) to manage access
  permissions.
