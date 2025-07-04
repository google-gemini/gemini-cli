# Memory Import Processor

> **Note:** The Memory Import Processor has evolved to support both modern compatibility with CLAUDE.md and the original GEMINI.md modular import philosophy. This dual-mode approach reflects feedback from the community and the need for interoperability, while honoring the strengths and intentions of the original design. We appreciate the contributions and suggestions that have shaped this feature for all users.

## Import Modes: CLAUDE.md Compatibility vs. Original GEMINI.md

The Memory Import Processor now supports two modes of operation:

| Feature                        | CLAUDE.md Compatibility Mode (Current Default) | Original GEMINI.md Mode (Legacy) |
| ------------------------------ | ---------------------------------------------- | -------------------------------- |
| File types allowed             | Any file type                                  | Only `.md` (Markdown) files      |
| Imports in code/inline code    | Ignored                                        | Processed                        |
| Maximum import depth (default) | 5                                              | 10                               |
| Motivation                     | Interoperability with CLAUDE.md workflows      | Modular, Markdown-centric usage  |

> **Note:** The CLAUDE.md Compatibility Mode is currently active to ensure interoperability with workflows and files designed for CLAUDE.md. The original GEMINI.md mode is documented below for reference and may be restored or toggled in future releases.

---

## CLAUDE.md Compatibility Mode (Current Default)

This mode matches the import semantics of CLAUDE.md for maximum compatibility.

### Key Behaviors

- **Any file type can be imported.** There is no restriction to `.md` files; you may import `.txt`, `.json`, code files, or any other file type.
- **Imports inside code blocks and inline code are ignored.** Only top-level `@filepath` statements outside of code blocks and inline code are processed as imports.
- **Maximum import depth is 5** (to prevent infinite recursion).

### Syntax

Use the `@` symbol followed by the path to the file you want to import:

```markdown
# Main GEMINI.md file

This is the main content.

@./components/instructions.txt

More content here.

@./shared/configuration.json
```

### Supported Path Formats

- `@./file.md` - Import from the same directory
- `@../file.txt` - Import from parent directory
- `@./components/file.json` - Import from subdirectory
- `@/absolute/path/to/file.py` - Import using absolute path

### Example

```markdown
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

@./features/overview.txt
```

### Safety Features

- Circular import detection
- File access security (imports only allowed from specified directories)
- Maximum import depth (default: 5)

### Error Handling

- Missing files: Import fails gracefully with an error comment
- File access errors: Permission issues or other file system errors are handled gracefully

---

## Original GEMINI.md Mode (Legacy)

This mode reflects the original design intent of the GEMINI.md import processor.

### Key Behaviors

- **Only `.md` (Markdown) files can be imported.** Attempting to import files with other extensions (like `.txt`, `.json`, etc.) will result in a warning and the import will fail.
- **Imports are processed everywhere,** including inside code blocks and inline code.
- **Maximum import depth is 10** (to prevent infinite recursion).

### Syntax

Use the `@` symbol followed by the path to the markdown file you want to import:

```markdown
# Main GEMINI.md file

This is the main content.

@./components/instructions.md

More content here.

@./shared/configuration.md
```

### Supported Path Formats

- `@./file.md` - Import from the same directory
- `@../file.md` - Import from parent directory
- `@./components/file.md` - Import from subdirectory
- `@/absolute/path/to/file.md` - Import using absolute path

### Example

```markdown
# My GEMINI.md

Welcome to my project!

@./getting-started.md

## Features

@./features/overview.md
```

### Error Handling

- **Non-MD File Attempts:**
  - If you try to import a non-markdown file, you'll see a warning and the import will fail.
  - Console output:
    ```
    [WARN] [ImportProcessor] Import processor only supports .md files. Attempting to import non-md file: ./instructions.txt. This will fail.
    ```
- **Missing files:** Import fails gracefully with an error comment
- **File access errors:** Permission issues or other file system errors are handled gracefully

---

@./features/overview.md

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

## Code Region Detection

> **Note:** The import processor uses the `marked` library to detect code blocks and inline code spans, ensuring that `@` imports inside these regions are properly ignored. This provides robust handling of nested code blocks and complex Markdown structures that would be difficult to parse with regex alone. The system uses `marked.lexer()` as the primary method with regex fallback for edge cases where `codespan` tokens might not be detected.

---

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

---

## Best Practices

1. **Use descriptive file names** for imported components
2. **Keep imports shallow** - avoid deeply nested import chains
3. **Document your structure** - maintain a clear hierarchy of imported files
4. **Test your imports** - ensure all referenced files exist and are accessible
5. **Use relative paths** when possible for better portability

## Troubleshooting

### Common Issues

1. **Import not working**: Check that the file exists and the path is correct (or that it is a `.md` file in legacy mode)
2. **Import not working**: Check that the file exists and has a `.md` extension
3. **Circular import warnings**: Review your import structure for circular references
4. **Permission errors**: Ensure the files are readable and within allowed directories
5. **Path resolution issues**: Use absolute paths if relative paths aren't resolving correctly

### Debug Mode

Enable debug mode to see detailed logging of the import process:

```typescript
const result = await processImports(content, basePath, true);
```
