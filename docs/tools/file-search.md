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

### Example

If you type `@src/.*\.tsx$`, the `fileSearch` tool will be used to find all files in the `src` directory that end with `.tsx`.

## Comparison with `ls`

While the `ls` tool can list the contents of a directory, `fileSearch` is designed for searching. Use `fileSearch` when you need to find files based on a pattern, and `ls` when you just need to see what's in a specific directory.
