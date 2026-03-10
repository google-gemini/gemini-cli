---
description:
  Run linter, build the project, and run the full test suite — the complete
  quality gate before submitting a PR.
---

# /ship-it Workflow

Use this workflow before every pull request to ensure the codebase is in a clean
state.

// turbo-all

1. **Lint** — Check for style and rule violations.

   ```
   npm run lint
   ```

2. **Type-check** — Ensure TypeScript compiles with zero errors.

   ```
   npm run typecheck
   ```

3. **Build** — Compile all packages to JavaScript.

   ```
   npm run build
   ```

4. **Test** — Run the full unit test suite across all workspaces.

   ```
   npm run test
   ```

5. **Report** — Confirm all 4 steps exited with code 0. If any step fails, stop
   and fix before proceeding.
