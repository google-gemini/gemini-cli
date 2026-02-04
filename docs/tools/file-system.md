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
- **Arguments:**
  - `pattern` (string, required): Glob pattern (for example, `src/**/*.ts`).
  - `dir_path` (string, optional): Directory to search within.

### `search_file_content` (SearchText)

Searches for regular expression patterns within file contents using `ripgrep` or
system grep.

- **Tool name:** `search_file_content`
- **Arguments:**
  - `pattern` (string, required): Regex to search for.
  - `dir_path` (string, optional): Directory to search.
  - `include` (string, optional): Glob pattern to filter files.

### `read_many_files` (ReadManyFiles)

Reads and concatenates multiple files matching include/exclude patterns.

- **Tool name:** `read_many_files`
- **Arguments:**
  - `include` (array, required): Patterns or paths to include.
  - `exclude` (array, optional): Patterns to ignore.

### `replace` (Edit)

Performs precise text replacement within a file based on literal string matching
and context.

- **Tool name:** `replace`
- **Arguments:**
  - `file_path` (string, required): Path to the file.
  - `instruction` (string, required): Semantic description of the change.
  - `old_string` (string, required): Exact literal text to find.
  - `new_string` (string, required): Exact literal text to replace with.
- **Confirmation:** Requires manual user approval.

## Next steps

- Follow the [File management tutorial](../tutorials/file-management.md) for
  practical examples.
- Learn about [Trusted folders](../cli/trusted-folders.md) to manage access
  permissions.
