# Memory Import Processor

The Memory Import Processor is a feature that allows you to modularize your GEMINI.md files by importing content from other markdown files using the `@file.md` syntax.

## Overview

This feature enables you to break down large GEMINI.md files into smaller, more manageable components that can be reused across different contexts. The import processor supports both relative and absolute paths, with built-in safety features to prevent circular imports and ensure file access security.

## Important Limitations

**This feature only supports `.md` (markdown) files.** Attempting to import files with other extensions (like `.txt`, `.json`, etc.) will result in a warning and the import will fail.

## Syntax

Use the `@` symbol followed by the path to the markdown file you want to import:

```markdown
# Main GEMINI.md file

This is the main content.

@./components/instructions.md

More content here.

@./shared/configuration.md
```

## Supported Path Formats

### Relative Paths

- `@./file.md` - Import from the same directory
- `@../file.md` - Import from parent directory
- `@./components/file.md` - Import from subdirectory

### Absolute Paths

- `@/absolute/path/to/file.md` - Import using absolute path

## Examples

### Basic Import

```markdown
# My GEMINI.md

Welcome to my project!

@./getting-started.md

## Features

@./features/overview.md
```

### Nested Imports

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

## Safety Features

### Circular Import Detection

The processor automatically detects and prevents circular imports:

```markdown
# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- This will be detected and prevented -->
```

### File Access Security

The `validateImportPath` function ensures that imports are only allowed from specified directories, preventing access to sensitive files outside the allowed scope.

### Maximum Import Depth

To prevent infinite recursion, there's a configurable maximum import depth (default: 10 levels).

## Error Handling

### Non-MD File Attempts

If you try to import a non-markdown file, you'll see a warning:

```markdown
@./instructions.txt <!-- This will show a warning and fail -->
```

Console output:

```
[WARN] [ImportProcessor] Import processor only supports .md files. Attempting to import non-md file: ./instructions.txt. This will fail.
```

### Missing Files

If a referenced file doesn't exist, the import will fail gracefully with an error comment in the output.

### File Access Errors

Permission issues or other file system errors are handled gracefully with appropriate error messages.

## API Reference

### `processImports(content, basePath, debugMode?, importState?)`

Processes import statements in GEMINI.md content.

**Parameters:**

- `content` (string): The content to process for imports
- `basePath` (string): The directory path where the current file is located
- `debugMode` (boolean, optional): Whether to enable debug logging (default: false)
- `importState` (ImportState, optional): State tracking for circular import prevention

**Returns:** Promise<string> - Processed content with imports resolved

### `validateImportPath(importPath, basePath, allowedDirectories)`

Validates import paths to ensure they are safe and within allowed directories.

**Parameters:**

- `importPath` (string): The import path to validate
- `basePath` (string): The base directory for resolving relative paths
- `allowedDirectories` (string[]): Array of allowed directory paths

**Returns:** boolean - Whether the import path is valid

## Best Practices

1. **Use descriptive file names** for imported components
2. **Keep imports shallow** - avoid deeply nested import chains
3. **Document your structure** - maintain a clear hierarchy of imported files
4. **Test your imports** - ensure all referenced files exist and are accessible
5. **Use relative paths** when possible for better portability

## Troubleshooting

### Common Issues

1. **Import not working**: Check that the file exists and has a `.md` extension
2. **Circular import warnings**: Review your import structure for circular references
3. **Permission errors**: Ensure the files are readable and within allowed directories
4. **Path resolution issues**: Use absolute paths if relative paths aren't resolving correctly

### Debug Mode

Enable debug mode to see detailed logging of the import process:

```typescript
const result = await processImports(content, basePath, true);
```
