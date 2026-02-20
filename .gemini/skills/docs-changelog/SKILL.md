---
name: docs-changelog
description: >-
  Generates and formats changelog files for a new release based on provided
  version and raw changelog data.
---

# Procedure: Updating Changelog for New Releases

## Objective

To standardize the process of updating changelog files (`latest.md`,
`preview.md`, `index.md`) based on automated release information.

## Inputs

- **version**: The release version string (e.g., `v0.28.0`,
  `v0.29.0-preview.2`).
- **TIME**: The release timestamp (e.g., `2026-02-12T20:33:15Z`).
- **BODY**: The raw markdown release notes, containing a "What's Changed"
  section and a "Full Changelog" link.

## Guidelines for `latest.md` and `preview.md` Highlights

- Aim for **3-5 key highlight points**.
- Each highlight point must start with a bold-typed title that summarizes the
  change (e.g., `**New Feature:** A brief description...`).
- **Prioritize** summarizing new features over other changes like bug fixes or
  chores.
- **Avoid** mentioning features that are "experimental" or "in preview" in
  Stable Releases.
- **DO NOT** include PR numbers, links, or author names in these highlights.
- Refer to `.gemini/skills/docs-changelog/references/highlights_examples.md`
  for the correct style and tone.

## Initial Processing

1.  **Analyze Version**: Determine the release path based on the `version`
    string.
    - If `version` contains "nightly", **STOP**. No changes are made.
    - If `version` ends in `.0`, follow the **Path A: New Minor Version**
      procedure.
    - If `version` does not end in `.0`, follow the **Path B: Patch Version**
      procedure.
2.  **Process Time**: Convert the `TIME` input into two formats for later use:
    `yyyy-mm-dd` and `Month dd, yyyy`.
3.  **Process Body**:
    - Save the incoming `BODY` content to a temporary file for processing.
    - In the "What's Changed" section of the temporary file, reformat all pull
      request URLs to be markdown links with the PR number as the text (e.g.,
      `[#12345](URL)`).
    - If a "New Contributors" section exists, delete it.
    - Preserve the "**Full Changelog**" link. The processed content of this
      temporary file will be used in subsequent steps.

---

## Path A: New Minor Version

*Use this path if the version number ends in `.0`.*

### A.1: Stable Release (e.g., `v0.28.0`)

For a stable release, you will generate two distinct summaries from the
changelog: a concise **announcement** for the main changelog page, and a more
detailed **highlights** section for the release-specific page.

1.  **Create the Announcement for `index.md`**:
    -   Generate a concise announcement summarizing the most important changes.
        Each announcement entry must start with a bold-typed title that
        summarizes the change.
    -   **Important**: The format for this announcement is unique. You **must**
        use the existing announcements in `docs/changelogs/index.md` and the
        example within
        `.gemini/skills/docs-changelog/references/index_template.md` as your
        guide. This format includes PR links and authors.
    -   Add this new announcement to the top of `docs/changelogs/index.md`.

2.  **Create Highlights and Update `latest.md`**:
    -   Generate a comprehensive "Highlights" section, following the guidelines
        in the "Guidelines for `latest.md` and `preview.md` Highlights" section
        above.
    -   Take the content from
        `.gemini/skills/docs-changelog/references/latest_template.md`.
    -   Populate the template with the `version`, `release_date`, generated
        `highlights`, and the processed content from the temporary file.
    -   **Completely replace** the contents of `docs/changelogs/latest.md` with
        the populated template.

### A.2: Preview Release (e.g., `v0.29.0-preview.0`)

1.  **Update `preview.md`**:
    -   Generate a comprehensive "Highlights" section, following the highlight
        guidelines.
    -   Take the content from
        `.gemini/skills/docs-changelog/references/preview_template.md`.
    -   Populate the template with the `version`, `release_date`, generated
        `highlights`, and the processed content from the temporary file.
    -   **Completely replace** the contents of `docs/changelogs/preview.md`
        with the populated template.

---

## Path B: Patch Version

*Use this path if the version number does **not** end in `.0`.*

### B.1: Stable Patch (e.g., `v0.28.1`)

- **Target File**: `docs/changelogs/latest.md`
- Perform the following edits on the target file:
    1.  Update the version in the main header. The line should read,
        `# Latest stable release: {{version}}`
    2.  Update the rease date. The line should read,
        `Released: {{release_date_month_dd_yyyy}}`
    3.  **Prepend** the processed "What's Changed" list from the temporary file
        to the existing "What's Changed" list in `latest.md`. Do not change or
        replace the existing list, **only add** to the beginning of it.
    4.  In the "Full Changelog", edit **only** the end of the URL. Identify the
        last part of the URL that looks like `...{previous_version}` and update
        it to be `...{version}`.

        Example: assume the patch version is `v0.29.1`. Change
        `Full Changelog: https://github.com/google-gemini/gemini-cli/compare/v0.28.2…v0.29.0`
        to
        `Full Changelog: https://github.com/google-gemini/gemini-cli/compare/v0.28.2…v0.29.1`

### B.2: Preview Patch (e.g., `v0.29.0-preview.3`)

- **Target File**: `docs/changelogs/preview.md`
- Perform the following edits on the target file:
    1.  Update the version in the main header. The line should read,
        `# Preview release: {{version}}`
    2.  Update the rease date. The line should read,
        `Released: {{release_date_month_dd_yyyy}}`
    3.  **Prepend** the processed "What's Changed" list from the temporary file
        to the existing "What's Changed" list in `preview.md`. Do not change or
        replace the existing list, **only add** to the beginning of it.
    4.  In the "Full Changelog", edit **only** the end of the URL. Identify the
        last part of the URL that looks like `...{previous_version}` and update
        it to be `...{version}`.

        Example: assume the patch version is `v0.29.0-preview.1`. Change
        `Full Changelog: https://github.com/google-gemini/gemini-cli/compare/v0.28.2…v0.29.0-preview.0`
        to
        `Full Changelog: https://github.com/google-gemini/gemini-cli/compare/v0.28.2…v0.29.0-preview.1`

---

## Finalize

- After making changes, run `npm run format` to ensure consistency.
- Delete any temporary files created during the process.
