# Google Python Style Guide Summary

This document summarizes key rules and best practices from the Google Python
Style Guide.

## 1. Python Language Rules

- **Linting:** Run `pylint` on your code to catch bugs and style issues.
- **Imports:** Use `import x` for packages/modules. Use `from x import y` only
  when `y` is a submodule.
- **Exceptions:** Use built-in exception classes. Do not use bare `except:`
  clauses.
- **Global State:** Avoid mutable global state. Module-level constants are okay
  and should be `ALL_CAPS_WITH_UNDERSCORES`.
- **Comprehensions:** Use for simple cases. Avoid for complex logic where a full
  loop is more readable.
- **Default Argument Values:** Do not use mutable objects (like `[]` or `{}`) as
  default values.
- **True/False Evaluations:** Use implicit false (e.g., `if not my_list:`). Use
  `if foo is None:` to check for `None`.
- **Type Annotations:** Strongly encouraged for all public APIs.

## 2. Python Style Rules

- **Line Length:** Maximum 80 characters.
- **Indentation:** 4 spaces per indentation level. Never use tabs.
- **Blank Lines:** Two blank lines between top-level definitions (classes,
  functions). One blank line between method definitions.
- **Whitespace:** Avoid extraneous whitespace. Surround binary operators with
  single spaces.
- **Docstrings:** Use `"""triple double quotes"""`. Every public module,
  function, class, and method must have a docstring.
  - **Format:** Start with a one-line summary. Include `Args:`, `Returns:`, and
    `Raises:` sections.
- **Strings:** Use f-strings for formatting. Be consistent with single (`'`) or
  double (`"`) quotes.
- **`TODO` Comments:** Use `TODO(username): Fix this.` format.
- **Imports Formatting:** Imports should be on separate lines and grouped:
  standard library, third-party, and your own application's imports.

## 3. Naming

- **General:** `snake_case` for modules, functions, methods, and variables.
- **Classes:** `PascalCase`.
- **Constants:** `ALL_CAPS_WITH_UNDERSCORES`.
- **Internal Use:** Use a single leading underscore (`_internal_variable`) for
  internal module/class members.

## 4. Main

- All executable files should have a `main()` function that contains the main
  logic, called from a `if __name__ == '__main__':` block.

**BE CONSISTENT.** When editing code, match the existing style.

_Source:
[Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)_
