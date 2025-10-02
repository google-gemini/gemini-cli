# Provide Context with GEMINI.md Files

Context files, which use the default name `GEMINI.md`, are a powerful feature for providing instructional context to the Gemini model. You can use these files to give project-specific instructions, define a persona, or provide coding style guides to make the AI's responses more accurate and tailored to your needs.

Instead of repeating instructions in every prompt, you can define them once in a context file.

## Understand the context hierarchy

The CLI uses a hierarchical system to source context. It loads various context files from several locations, concatenates the contents of all found files, and sends them to the model with every prompt. The CLI loads files in the following order:

1.  **Global context file:**
    - **Location:** `~/.gemini/GEMINI.md` (in your user home directory).
    - **Scope:** Provides default instructions for all your projects.

2.  **Project root and ancestor context files:**
    - **Location:** The CLI searches for a `GEMINI.md` file in your current working directory and then in each parent directory up to the project root (identified by a `.git` folder).
    - **Scope:** Provides context relevant to the entire project.

3.  **Sub-directory context files:**
    - **Location:** The CLI also scans for `GEMINI.md` files in subdirectories below your current working directory. It respects rules in `.gitignore` and `.geminiignore`.
    - **Scope:** Lets you write highly specific instructions for a particular component or module.

The CLI footer displays the number of loaded context files, which gives you a quick visual cue of the active instructional context.

### Example `GEMINI.md` file

Here is an example of what you can include in a `GEMINI.md` file at the root of a TypeScript project:

```markdown
# Project: My TypeScript Library

## General Instructions

- When you generate new TypeScript code, follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.

## Coding Style

- Use 2 spaces for indentation.
- Prefix interface names with `I` (for example, `IUserService`).
- Always use strict equality (`===` and `!==`).
```

## Manage context with the `/memory` command

You can interact with the loaded context files by using the `/memory` command.

- **`/memory show`**: Displays the full, concatenated content of the current hierarchical memory. This lets you inspect the exact instructional context being provided to the model.
- **`/memory refresh`**: Forces a re-scan and reload of all `GEMINI.md` files from all configured locations.
- **`/memory add <text>`**: Appends your text to your global `~/.gemini/GEMINI.md` file. This lets you add persistent memories on the fly.

## Modularize context with imports

You can break down large `GEMINI.md` files into smaller, more manageable components by importing content from other files using the `@file.md` syntax. This feature supports both relative and absolute paths.

**Example `GEMINI.md` with imports:**

```markdown
# Main GEMINI.md file

This is the main content.

@./components/instructions.md

More content here.

@../shared/style-guide.md
```

For more details, see the [Memory Import Processor](../core/memport.md) documentation.

## Customize the context file name

While `GEMINI.md` is the default filename, you can configure this in your `settings.json` file. To specify a different name or a list of names, use the `context.fileName` property.

**Example `settings.json`:**

```json
{
  "context": {
    "fileName": ["AGENTS.md", "CONTEXT.md", "GEMINI.md"]
  }
}
```
