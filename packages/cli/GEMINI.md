## React & Ink (CLI UI)

- **Side Effects**: Use reducers for complex state transitions; avoid `setState`
  triggers in callbacks.
- Always fix react-hooks/exhaustive-deps lint errors by adding the missing
  dependencies.
- **Shortcuts**: only define keyboard shortcuts in
  `packages/cli/src/ui/key/keyBindings.ts`
- Do not implement any logic performing custom string measurement or string
  truncation. Use Ink layout instead leveraging ResizeObserver as needed. When
  using `ResizeObserver`, prefer the `useCallback` ref pattern (as seen in
  `MaxSizedBox.tsx`) to ensure size measurements are captured as soon as the
  element is available, avoiding potential rendering timing issues.
- Avoid prop drilling when at all possible.

## Testing

- **Utilities**: Use `renderWithProviders` and `waitFor` from
  `packages/cli/src/test-utils/`.
- **Snapshots**: Use `toMatchSnapshot()` to verify Ink output.
- **SVG Snapshots**: Use `await expect(renderResult).toMatchSvgSnapshot()` for
  UI components whenever colors or detailed visual layout matter. SVG snapshots
  capture styling accurately. Make sure to await the `waitUntilReady()` of the
  render result before asserting. After updating SVG snapshots, always examine
  the resulting `.svg` files (e.g. by reading their content or visually
  inspecting them) to ensure the render and colors actually look as expected and
  don't just contain an error message.
- **Mocks**: Use mocks as sparingly as possible.
