## TLDR

This pull request introduces a comprehensive Chinese translation for the project's documentation. The goal is to make the Gemini CLI more accessible and user-friendly for the Chinese-speaking community.

## Dive Deeper

This contribution adds a new `i18n/chinese` directory which mirrors the structure of the root documentation. It includes translated versions of:
- Core project documents (`README.md`, `GEMINI.md`, `CONTRIBUTING.md`, etc.).
- The entire `docs/` directory, covering all aspects of installation, usage, and configuration.
- The `pull_request_template.md`.

Additionally, links have been added to the top of the original English markdown files to direct users to the newly available Chinese versions, ensuring easy navigation between languages.

## Reviewer Test Plan

As this is a documentation-only change, validation is primarily focused on content and structure:

1.  **Review Translations:** Please review the translated `.md` files in the `i18n/chinese/` directory for accuracy, clarity, and consistency.
2.  **Verify Links:** Check the "查看中文版" (View Chinese version) links at the top of the modified root-level English documents (e.g., `README.md`, `GEMINI.md`) to ensure they correctly navigate to their translated counterparts.
3.  **Check File Structure:** Confirm that the directory structure within `i18n/chinese/` correctly mirrors the original English documentation structure.

No functional testing of the CLI tool is required, as no code has been changed.

## Testing Matrix

These changes are purely documentation-related and do not affect the runtime behavior of the application. Therefore, the testing matrix is not applicable.

| | | | |
| :--- | :---: | :---: | :---: |
| **npm run** | N/A | N/A | N/A |
| **npx** | N/A | N/A | N/A |
| **Docker** | N/A | N/A | N/A |
| **Podman** | - | - | - |
| **Seatbelt** | - | - | - |

## Linked issues / bugs

No associated issue.
