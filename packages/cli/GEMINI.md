## React & Ink (CLI UI)

- **Side Effects**: Use reducers for complex state transitions; avoid `setState`
  triggers in callbacks.
- Always fix react-hooks/exhaustive-deps lint errors by adding the missing
  dependencies.
- **Shortcuts**: only define keyboard shortcuts in
  `packages/cli/src/config/keyBindings.ts

## Testing

- **Utilities**: Use `renderWithProviders` and `waitFor` from
  `packages/cli/src/test-utils/`.
- **Snapshots**: Use `toMatchSnapshot()` to verify Ink output.
- **Mocks**: Use mocks as sparingly as possilble.
