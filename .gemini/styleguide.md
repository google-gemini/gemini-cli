# Gemini CLI Coding Style Guide

This style guide defines the coding standards and best practices for the Gemini CLI repository. Adherence to these rules is mandatory for all contributions.

## 1. Licensing
- **Apache-2.0 License:** All new source files (`.ts`, `.tsx`, `.js`) must include the Apache-2.0 license header with the current year.
- **Example:**
  ```typescript
  /**
   * @license
   * Copyright 2026 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   */
  ```

## 2. Commit Messages
- **Conventional Commits:** Use the [Conventional Commits](https://www.conventionalcommits.org/) standard for all commit messages.
- **Format:** `<type>(<scope>): <description>` (e.g., `feat(core): add tool repair`, `fix(cli): resolve layout race`).
- **Allowed Types:** `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`.

## 3. Engineering Standards
- **Validation:** All PRs must pass `npm run preflight` completely before merge. This includes building, linting, type-checking, and all tests.
- **Testing:** New features and bug fixes must include corresponding tests.
- **Surgical Changes:** PRs should be small, atomic, and focused on a single issue. Avoid unrelated refactoring or "cleanup".
- **Imports:** Use specific imports and avoid restricted relative imports between packages.

## 4. Documentation
- **User-facing Changes:** Any changes affecting the user experience must be accompanied by updates to the `/docs` directory and `sidebar.json`.
- **Reference:** Use the `docs-writer` local skill for documentation tasks.
