# Pattern-Based File Permissions

The Gemini CLI offers a powerful pattern-based file permission system that allows for fine-grained control over which files the AI agent can read from or write to. This ensures that the agent only accesses files you explicitly authorize, enhancing security and control over your workspace.

## Configuration

Pattern-based file permissions are configured within your `settings.json` file (usually located at `~/.gemini/settings.json` for user settings or `.gemini/settings.json` in your workspace). You define these permissions under the `filePermissions` key, which takes an array of rule objects.

Each rule object has the following properties:

*   `patterns` (array of strings): An array of glob patterns that specify the files or directories this rule applies to. Patterns are matched relative to your project's target directory.
*   `operations` (array of strings): An array defining the operations this rule governs. Valid operations are:
    *   `"read"`: Allows or denies reading the content of matching files.
    *   `"write"`: Allows or denies writing to or modifying matching files (this includes creating, overwriting, and editing files).
*   `effect` (string): Determines the outcome of the rule. Valid effects are:
    *   `"allow"`: Permits the specified operations on matching files.
    *   `"deny"`: Prohibits the specified operations on matching files.
*   `description` (string, optional): A brief description of what the rule does, for your own reference.

**Example `settings.json`:**

```json
{
  // ... other settings ...
  "filePermissions": [
    {
      "description": "Allow reading all markdown files anywhere in the project.",
      "patterns": ["**/*.md"],
      "operations": ["read"],
      "effect": "allow"
    },
    {
      "description": "Deny writing to any TypeScript files directly under the 'src' directory.",
      "patterns": ["src/*.ts"],
      "operations": ["write"],
      "effect": "deny"
    },
    {
      "description": "Allow full read/write access to files in the 'tmp/scratchpad' directory.",
      "patterns": ["tmp/scratchpad/**/*"],
      "operations": ["read", "write"],
      "effect": "allow"
    },
    {
      "description": "Specifically deny reading any files ending with '.key' in the 'config' directory.",
      "patterns": ["config/**/*.key"],
      "operations": ["read"],
      "effect": "deny"
    },
    {
      "description": "Globally deny writing to any '.env' files.",
      "patterns": ["**/.env"],
      "operations": ["write"],
      "effect": "deny"
    }
  ]
  // ... other settings ...
}
```

### Glob Patterns

Glob patterns are a powerful way to specify sets of filenames using wildcard characters. Some common examples:

*   `*.txt`: Matches all files ending with `.txt` in the immediate directory relative to where the pattern is being applied (within `targetDir` context).
*   `src/**/*.js`: Matches all JavaScript files in the `src` directory and any of its subdirectories.
*   `docs/chapter?.md`: Matches `chapter1.md`, `chapterA.md`, etc., in the `docs` directory.
*   `!(*.log)`: (If supported by the glob library, often requires specific flags) Can be used for negating patterns, though direct `allow`/`deny` is usually clearer.

The Gemini CLI uses a standard glob matching library (minimatch).

## Rule Evaluation

*   **Order Matters:** Rules in the `filePermissions` array are evaluated in the order they are defined. The **first rule** that matches the file path and the operation determines the outcome.
*   **Default-Deny Policy:** If a file operation is attempted and **no rule** in the `filePermissions` array explicitly allows it by matching the file and operation, the operation will be **denied** by default. This is a security-first approach. For an operation to be permitted, there must be an `allow` rule that matches it, and no preceding `deny` rule that also matches.

## Interaction with Other Mechanisms

*   **Tool Enablement (`coreTools` / `excludeTools`):** Pattern-based permissions provide control *within* enabled tools. If a tool like `WriteFileTool` is globally disabled via `excludeTools`, these file permissions will not re-enable it for specific files.
*   **Target Directory (`targetDir`):** All operations are still confined to the project's `targetDir`. Pattern-based permissions do not grant access outside this directory.
*   **Ignore Files (`.geminiignore`, `.gitignore`):** Files listed in `.geminiignore` (and `.gitignore` if `respectGitIgnore` is enabled) are typically hidden from discovery tools (like `ls` or when the agent searches for context).
    *   If a tool attempts to operate on a file path *explicitly provided* to it (e.g., `read_file /path/to/ignored.txt`), pattern-based permissions will still be checked. A `deny` rule in `filePermissions` will always be respected. An `allow` rule *could* permit an operation on such an explicitly targeted file, but this depends on the specific tool's behavior with ignored files.

## Examples

**Scenario 1: Secure a `secrets` directory**

You want to ensure the agent can never read from or write to any file within a `secrets/` directory.

```json
{
  "filePermissions": [
    {
      "description": "Deny all access to the secrets directory.",
      "patterns": ["secrets/**/*"],
      "operations": ["read", "write"],
      "effect": "deny"
    }
    // ... other rules (e.g., general read allow for *.md)
  ]
}
```
*Because this deny rule is broad, place more specific `allow` rules for other paths *after* it if they are less critical, or *before* it if they are exceptions within `secrets/` that should be allowed (though generally, denying all to `secrets/` is safer).*
*Correction: Given "first rule wins", to deny all to `secrets/`, this rule should ideally be placed early in the list if there are other broader allow rules.*

**Scenario 2: Allow writing only to a `dist/` output directory**

You want the agent to be able to read from `src/` but only write files into the `dist/` directory.

```json
{
  "filePermissions": [
    {
      "description": "Allow reading from the src directory.",
      "patterns": ["src/**/*"],
      "operations": ["read"],
      "effect": "allow"
    },
    {
      "description": "Allow writing only to the dist directory.",
      "patterns": ["dist/**/*"],
      "operations": ["write"],
      "effect": "allow"
    },
    {
      "description": "Deny writing to all other locations (including src).",
      "patterns": ["**/*"], // Matches all files
      "operations": ["write"],
      "effect": "deny" // This acts as a fallback deny for write operations
    }
    // Note: A general read allow might be needed if not covered by other rules,
    // e.g. { "patterns": ["**/*"], "operations": ["read"], "effect": "allow" }
    // placed after specific read denies.
  ]
}
```
*In this setup, the specific `allow write` for `dist/**/*` would be matched first for files in `dist/`. Then, the `deny write` for `**/*` would prevent writes elsewhere. Reads from `src/` are allowed. Default deny handles reads elsewhere if no other rule permits them.*

By carefully crafting your `filePermissions` rules, you can create a secure and controlled environment for the Gemini CLI agent to operate within your projects. Remember the "first match wins" and "default deny" principles when ordering your rules.
