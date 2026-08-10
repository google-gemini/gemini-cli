# Documentation Audit Results - 2026-08-10

This file contains identified violations and recommendations based on the
`docs-writer` skill style guidelines.

## Editor Audit Findings

- **File path:** `docs/index.md`
  - **Description:** Violation (Structure): The section `## Development` is
    missing an overview paragraph.
  - **Actionable recommendation:** Add a brief overview paragraph under
    `## Development` explaining the purpose of the section.
- **File path:** `docs/index.md`
  - **Description:** Violation (Links): The link
    `[Contribution guide](/docs/contributing)` includes the `/docs/` prefix,
    which violates the relative link guideline.
  - **Actionable recommendation:** Change the link to
    `[Contribution guide](./contributing.md)`.
- **File path:** `docs/reference/commands.md`
  - **Description:** Violation (Structure): The heading `### Built-in Commands`
    is immediately followed by a sub-heading, lacking an overview paragraph.
  - **Actionable recommendation:** Add an overview paragraph under
    `### Built-in Commands` describing the built-in commands section.

## Software Engineer Audit Findings

- **Description:** The `gemma` CLI command and its subcommands (`setup`,
  `start`, `stop`, `status`, `logs`) for managing local Gemma model routing are
  not documented in the Command Reference.
  - **Location:** `packages/cli/src/commands/gemma.ts`
  - **Recommendation:** Document the `gemma` command and its subcommands in
    `docs/reference/commands.md`.
- **Description:** The `SummarizeToolOutputSettings` configuration (tokenBudget)
  is not explicitly documented in the Settings reference.
  - **Location:** `packages/cli/src/config/settings.ts`
  - **Recommendation:** Add the `SummarizeToolOutputSettings` (tokenBudget) to
    the Settings reference in `docs/cli/settings.md`.
