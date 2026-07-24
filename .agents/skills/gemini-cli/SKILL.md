```markdown
# gemini-cli Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `gemini-cli` TypeScript codebase, which is built on the Express framework. You'll learn about file naming, import/export styles, commit message conventions, and how to write and organize tests. This guide is ideal for contributors looking to maintain consistency and quality in the project.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `geminiRouter.ts`, `userService.ts`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // userService.ts
    export function getUser(id: string) { ... }
    ```

### Commit Message Conventions
- Use **Conventional Commits**.
- Allowed prefixes: `chore`, `fix`
- Example:
  ```
  chore: update dependencies
  fix: handle null user in login flow
  ```

## Workflows

_No explicit workflows detected in the repository._

## Testing Patterns

- Test files use the pattern: `*.test.*`
  - Example: `userService.test.ts`
- The specific testing framework is **unknown**, but tests are kept alongside or near the code they test.
- To add a new test:
  1. Create a file named `yourModule.test.ts` in the same directory as `yourModule.ts`.
  2. Follow the project's import/export conventions in your test code.

## Commands
| Command | Purpose |
|---------|---------|
| /test   | Run all test files matching `*.test.*` |
| /commit | Create a commit message following conventional commit style |
```