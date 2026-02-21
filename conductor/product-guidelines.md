# Product Guidelines

## Design Principles

- **Terminal First:** Optimize for readability and interaction within a terminal
  environment. Use clear, concise text and standard ANSI colors.
- **Responsiveness:** Ensure UI elements adapt gracefully to terminal resizing
  using `ResizeObserver` and `Ink` layout primitives. Avoid custom string
  truncation.
- **Minimalism:** Provide high-signal output. Avoid excessive verbosity or
  "chitchat". Focus on intent and technical rationale.
- **Predictability:** Use consistent keyboard shortcuts defined centrally in
  `packages/cli/src/config/keyBindings.ts`.

## Code Style & Architecture

- **State Management:** Use reducers for complex state transitions in React/Ink
  components. Avoid triggering state updates (`setState`) directly within render
  callbacks.
- **Component Structure:** Avoid prop drilling. Use context or state management
  libraries where appropriate.
- **Modularity:** Maintain strict boundaries between packages (`cli`, `core`).
  Use specific imports and avoid restricted relative imports.
- **Testing:** Prioritize `vitest` for unit testing and `renderWithProviders`
  for Ink component testing. Use snapshots (`toMatchSnapshot`) for UI
  verification.
- **Linting & Formatting:** Adhere strictly to ESLint and Prettier
  configurations. Fix all lint errors and warnings.

## Documentation

- **Completeness:** Ensure all new features and changes are documented in the
  `docs/` directory.
- **Clarity:** Write documentation that is easy to understand for developers of
  all levels.
- **Accuracy:** Keep documentation up-to-date with code changes.
