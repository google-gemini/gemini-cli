# Memory Import Processor

Modularize your GEMINI.md file with the Memory Import Processor. The Memory Import Processor lets you split large GEMINI.md files into smaller components, using the `@file.md` syntax.

## How the Memory Import Processor works

The Memory Import Processor lets you split large GEMINI.md files into smaller, more manageable components that can be reused across different contexts. The import processor supports both relative and absolute paths, with built-in safety features to prevent circular imports and ensure file access security.

For more information on GEMINI.md files in general, see the [GEMINI.md documentation](../cli/gemini-md.md).

## Syntax

Use the `@` symbol followed by the path to the file you want to import:

```markdown
# Main GEMINI.md file

This is the main content.

@./components/instructions.md

More content here.

@./shared/configuration.md
```

## Supported path formats

The Memory Import Processor supports relative and absolute paths. We recommend using relative paths where possible.

### Relative paths

- `@./file.md`: Import from the same directory.
- `@../file.md`: Import from parent directory.
- `@./components/file.md`: Import from subdirectory.

### Absolute paths

- `@/absolute/path/to/file.md`: Import using absolute path.

## Examples

Here are some examples demonstrating how to use the import syntax:

### Basic import

```markdown
# My GEMINI.md

Welcome to my project!

@./get-started.md

## Features

@./features/overview.md
```

### Nested imports

The imported files can themselves contain imports, creating a nested structure:

```markdown
# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown
# header.md

# Project Header

@./shared/title.md
```

## Safety features

The import processor includes several safety features to ensure secure and reliable operation, including circular import detection, file access security, and a maximum import depth.

### Circular import detection

The processor automatically detects and prevents circular imports:

```markdown
# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- This will be detected and prevented -->
```

### File access security

The `validateImportPath` function ensures that imports are only allowed from specified directories, preventing access to sensitive files outside the allowed scope.

### Maximum import depth

To prevent infinite recursion, there's a configurable maximum import depth (default: 5 levels).

## Error handling

Error handling is designed to be graceful and informative. There are two common errors:

- **Missing files:** If a referenced file doesn't exist, the import will fail gracefully with an error comment in the output.
- **File access errors:** Permission issues or other file system errors are handled gracefully with appropriate error messages.

## Code region detection

The import processor uses the `marked` library to detect code blocks and inline code spans, ensuring that `@` imports inside these regions are properly ignored. This provides robust handling of nested code blocks and complex Markdown structures.

## Import tree structure

The processor returns an import tree that shows the hierarchy of imported files, similar to Claude's `/memory` feature. This helps users debug problems with their GEMINI.md files by showing which files were read and their import relationships.

Example tree structure:

```
Memory Files
 L project: GEMINI.md
            L a.md
              L b.md
                L c.md
              L d.md
                L e.md
                  L f.md
            L included.md
```

The tree preserves the order that files were imported and shows the complete import chain for debugging purposes.

## Comparison to Claude Code's `/memory` (`claude.md`) approach

Claude Code's `/memory` feature (as seen in `claude.md`) produces a flat, linear document by concatenating all included files, always marking file boundaries with clear comments and path names. It does not explicitly present the import hierarchy, but the LLM receives all file contents and paths, which is sufficient for reconstructing the hierarchy if needed.

Note: The import tree is mainly for clarity during development and has limited relevance to LLM consumption.

## API reference

The following API functions are available for programmatic interaction with the Memory Import Processor.

### `processImports(content, basePath, debugMode?, importState?)`

Processes import statements in GEMINI.md content.

**Parameters:**

- `content` (string): The content to process for imports.
- `basePath` (string): The directory path where the current file is located.
- `debugMode` (boolean, optional): Whether to enable debug logging (default: `false`).
- `importState` (ImportState, optional): State tracking for circular import prevention.

**Returns:** Promise&lt;ProcessImportsResult&gt; - Object containing processed content and import tree.

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // The processed content with imports resolved
  importTree: MemoryFile; // Tree structure showing the import hierarchy
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // The file path
  imports?: MemoryFile[]; // Direct imports, in the order they were imported
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

Validates import paths to ensure they are safe and within allowed directories.

**Parameters:**

- `importPath` (string): The import path to validate.
- `basePath` (string): The base directory for resolving relative paths.
- `allowedDirectories` (string[]): Array of allowed directory paths.

**Returns:** boolean - Whether the import path is valid.

### `findProjectRoot(startDir)`

Finds the project root by searching for a `.git` directory upwards from the given start directory. Implemented as an **async** function using non-blocking file system APIs to avoid blocking the Node.js event loop.

**Parameters:**

- `startDir` (string): The directory to start searching from

**Returns:** Promise&lt;string&gt; - The project root directory (or the start directory if no `.git` is found)

## Best practices

To effectively use the Memory Import Processor, consider the following best practices:

- **Use descriptive file names:** Use descriptive file names for imported components to enhance readability.
- **Keep imports shallow:** Keep imports shallow to reduce the complexity of maintenance and troubleshooting.
- **Document your structure:** Maintain a clear hierarchy of imported files.
- **Test your imports:** Ensure all referenced files exist and are accessible.
- **Use relative paths:** Improve portability with relative paths.

## Troubleshooting

This section addresses common issues and explains how to enable debug mode.

### Common issues

Common issues encountered with the Memory Import Processor include:

- **Import not working:** Check that the file exists and the path is correct.
- **Circular import warnings:** Review your import structure for circular references.
- **Permission errors:** Ensure the files are readable and within allowed directories.
- **Path resolution issues:** Use absolute paths if relative paths aren't resolving correctly.

### Debug mode

Enable debug mode to see detailed logging of the import process:

```typescript
const result = await processImports(content, basePath, true);
```
