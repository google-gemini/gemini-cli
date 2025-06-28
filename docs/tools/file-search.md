# File Search Tool (`fileSearch`)

The `fileSearch` tool provides a powerful and efficient way to find files within your project. It uses the `fd-find` utility to perform fast, regular-expression-based searches.

## Functionality

The `fileSearch` tool allows you to:

- Find files using regular expression patterns.
- Search within specific subdirectories.
- Control case sensitivity.
- Respect `.gitignore` rules by default.

## How it Works

When you use a feature that needs to find files (like the `@` command for file-based context), the Gemini CLI can use the `fileSearch` tool. The tool constructs and executes an `fd` command based on your input and returns a list of matching files.

### Automatic Fuzzy Search

If you provide a search pattern with path separators (e.g., `u/c/h`) and it returns no results, the tool will automatically retry the search by appending a wildcard (`[^/]*`) to the end of each path segment.

- **Transformation:** `u/c/h` becomes `u[^/]*/c[^/]*/h[^/]*`
- **Example:**
  - Your search for `u/c/h` fails.
  - The tool automatically retries with `u[^/]*/c[^/]*/h[^/]*`.
  - This new pattern would successfully match files like `utils/common/helpers.ts`.

### Example

If you type `@src/.*\.tsx# File Search Tool (`fileSearch`)

The `fileSearch` tool provides a powerful and efficient way to find files within your project. It uses the `fd-find` utility to perform fast, regular-expression-based searches.

## Functionality

The `fileSearch` tool allows you to:

- Find files using regular expression patterns.
- Search within specific subdirectories.
- Control case sensitivity.
- Respect `.gitignore` rules by default.

, the `fileSearch` tool will be used to find all files in the `src` directory that end with `.tsx`.

## Comparison with `ls`

While the `ls` tool can list the contents of a directory, `fileSearch` is designed for searching. Use `fileSearch` when you need to find files based on a pattern, and `ls` when you just need to see what's in a specific directory.
