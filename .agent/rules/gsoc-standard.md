# GSoC 2026 Coding Standards

These rules apply to every file generated for this project.

## TypeScript

- Use TypeScript 5.x features: `satisfies`, `const` type parameters, verbatim
  module syntax.
- Prefer functional programming: pure functions, immutable data (`readonly`,
  `as const`), no mutation.
- Always use `interface` over `type` for object shapes that can be extended.
- Avoid `any`; use `unknown` and narrow explicitly.
- Use `import type` for type-only imports.

## Code Style

- All public APIs must have JSDoc comments (`/** ... */`) including `@param`,
  `@returns`, and `@example`.
- Prefer named exports over default exports.
- Use the Strategy pattern for swappable implementations (no `switch` on type
  strings in business logic).
- Arrow functions for callbacks; `function` declarations for top-level named
  functions.

## Architecture

- New services go in `packages/core/src/services/`.
- New RAG/embedding components go in `packages/core/src/rag/`.
- Eval scorers go in `evals/scorers/`.
- All new `.ts` and `.tsx` files must include the Apache-2.0 license header:
  ```
  /**
   * @license
   * Copyright 2026 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   */
  ```

## Testing

- Every new service must have a co-located `.test.ts` file.
- Use `vi.stubEnv` / `vi.unstubAllEnvs` for environment variables — never mutate
  `process.env`.
- Use stub/mock implementations of external dependencies (never real API calls
  in unit tests).
- Target 100% branch coverage for business logic files.

## Quality Gates (run before every PR)

1. `npm run typecheck` — zero errors required.
2. `npm run lint` — zero warnings required.
3. `npm run test` — all tests green.
4. `npm run build` — clean build required.
