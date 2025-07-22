feat: Enhance shell tool with timeout and fix paste newline issue

This commit introduces a new `timeout` parameter to the `ShellTool` for better control over shell command execution duration. It also resolves a critical issue where pasting content into the CLI would incorrectly add newlines, improving the user experience.

Furthermore, this commit includes several fixes to enhance cross-platform compatibility and address linting issues:

-   **Shell Tool Enhancements:**
    -   Added `timeout` parameter to `ShellToolParams` and its implementation in `execute` method.
    -   Updated `shell.md` documentation to reflect the new `timeout` parameter.
    -   Resolved linting error in `shell.ts` by renaming `description` to `_description` and updating its references.
-   **Paste Functionality Fix:**
    -   Implemented proper handling for bracketed paste sequences in `text-buffer.ts` to prevent unintended newlines when pasting.
-   **Cross-Platform Compatibility & Test Stability:**
    -   Addressed numerous pathing inconsistencies across various test files (`restoreCommand.test.ts`, `atCommandProcessor.test.ts`, `useCompletion.integration.test.ts`, `bfsFileSearch.test.ts`, `errorReporting.test.ts`, `getFolderStructure.test.ts`, `gitIgnoreParser.test.ts`, `modifiable-tool.test.ts`, `read-file.test.ts`, `shell.test.ts`) by consistently using `path.normalize` or `path.join`.
    -   Updated snapshots in `ModelStatsDisplay.test.tsx`, `SessionSummaryDisplay.test.tsx`, and `StatsDisplay.test.tsx` to reflect correct output on all platforms.
    -   Ensured correct `fs` import in `restoreCommand.test.ts`.

These changes collectively improve the robustness, usability, and cross-platform compatibility of the CLI.