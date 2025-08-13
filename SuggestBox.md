## Suggestion: Enhance Testing Strategy with Snapshot Testing

**Value & Justification:**
This aligns with our 'Quality' principle by introducing automated visual regression testing for our CLI's UI components. Snapshot testing will increase the reliability of our UI, prevent unintended changes, and improve the overall user experience. This also supports the "User Experience" focus area by ensuring a consistent and predictable interface.

**Problem Solved:**
Currently, changes to the CLI's output, especially for complex, multi-line responses, are verified manually. This process is slow, error-prone, and not easily scalable. It's easy for small visual regressions (e.g., a change in color, spacing, or text) to go unnoticed, leading to a degraded user experience.

**Implementation Plan:**
1. Leverage the built-in snapshot testing capabilities of `vitest`.
2. Identify key UI components in `packages/cli/src/ui` that would benefit from snapshot testing, starting with the main output renderer in `gemini.tsx` and other high-level components.
3. Create new test files (e.g., `MyComponent.snapshot.test.tsx`) for these components.
4. In the tests, render the components with representative props and use `expect(renderedOutput).toMatchSnapshot()` to generate and compare snapshots.
5. Add a section to `CONTRIBUTING.md` explaining how to update snapshots when changes are intentional, including the command to run (`vitest -u`).
6. Run a one-time snapshot generation for all targeted components to establish a baseline.

## Suggestion: Implement a `gemini config` Command

**Value & Justification:**
This suggestion directly supports the "Power & Simplicity" and "User Experience" principles. By providing a dedicated command for configuration, we make the Gemini CLI easier to use and manage, especially for users who are not comfortable editing YAML files directly. This lowers the barrier to entry and makes the tool more accessible.

**Problem Solved:**
Configuration is currently managed by manually editing the `~/.gemini/config.yaml` file. This approach has several drawbacks:
- It's not user-friendly and can be intimidating for novice users.
- It's prone to syntax errors that can break the CLI.
- It's difficult to manage configuration programmatically within scripts.

**Implementation Plan:**
1. Create a new command file at `packages/cli/src/commands/config.ts`.
2. Define the command structure using `yargs`, including subcommands like `get`, `set`, `list`, and `delete`.
3. Implement the logic for each subcommand to read from and write to the `config.yaml` file. Use a library like `js-yaml` for safe YAML parsing and serialization.
4. Implement robust error handling for cases such as a malformed config file, non-existent keys (for `get` and `delete`), or file permission issues.
5. Ensure the command provides clear feedback to the user (e.g., "Configuration key 'x' set to 'y'").
6. Add comprehensive JSDoc comments to the command file to serve as documentation.
7. Create a new documentation file in `docs/cli/` explaining how to use the new `config` command with examples for each subcommand.

## Suggestion: Create a `CONTRIBUTING.md` guide for E2E tests

**Value & Justification:**
This proposal enhances our "Contribution" and "Quality" focus areas. By documenting the end-to-end testing process, we empower more contributors to write high-quality tests for their features. This will lead to better test coverage, a more stable product, and a smoother contribution experience for the community.

**Problem Solved:**
The project has a suite of integration tests, but there is no documentation explaining how to write them. This creates a high barrier for new contributors who want to add features with corresponding end-to-end tests. As a result, new features may be added without adequate testing, or the burden of writing tests falls on a small number of core maintainers.

**Implementation Plan:**
1. Add a new section titled "Writing End-to-End Tests" to the `CONTRIBUTING.md` file.
2. In this section, explain the purpose and architecture of the integration test suite (`integration-tests/`).
3. Detail the steps required to create a new test file, including the file naming conventions and the basic structure of a test.
4. Provide a simple but complete example of an E2E test, such as a test that runs a `gemini` command and checks its output.
5. Explain how to run the E2E tests locally using the `npm run test:e2e` command.
6. Add a reference to this new section in the pull request template to remind contributors to add tests.
7. Add a link to the new "Writing End-to-End Tests" section in the main `README.md` to improve its visibility.
