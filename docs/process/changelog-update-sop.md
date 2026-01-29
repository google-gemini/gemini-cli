# SOP: Updating Changelog for New Releases

## Objective

To standardize the process of updating the Gemini CLI changelog files
(`docs/changelogs/index.md` and `docs/changelogs/latest.md`) for a new release,
ensuring accuracy, consistency, and adherence to project style guidelines.

## Expected inputs

## Expected inputs

- **New version number:** The version number for the new release (e.g.,
  `v0.27.0`).
- **Release date:** The date of the new release (e.g., `2026-02-03`).
- **Raw changelog data:** A list of all pull requests and changes included in
  the release, in the format `description by @author in #pr_number`.
- **Previous version number:** The version number of the last release (e.g.,
  `v0.26.0`).

## Step-by-step procedure

### Initial setup

1.  Identify the two files to be modified:
    - `docs/changelogs/latest.md`
    - `docs/changelogs/index.md`
2.  Activate the `docs-writer` skill.

### Analyze raw changelog data

1.  Review the complete list of changes.
2.  Group related changes into high-level categories. Common categories include:
    - Agents and Skills
    - UI/UX Improvements
    - Core Stability and Performance
    - Experimental Features
    - Scheduler and Policy
    - Documentation
    - Bug Fixes

### Create highlight summaries

Create two distinct versions of the release highlights.

**Important:** Carefully inspect any highlights for "experimental" or "preview"
features. Consider whether to announce these publicly in the changelog.

**Version 1: Comprehensive highlights (for `latest.md`)**

- Write a detailed but readable summary for each category.
- Focus on explaining the user-facing impact of the changes.

**Version 2: Concise highlights (for `index.md`)**

- Write a more concise summary for each category.
- For major, user-facing features, identify the primary pull request and author
  from the raw changelog data.
- Embed the PR link and author callout directly into the summary (e.g.,
  `([#12345](link) by @author)`).

### Update `docs/changelogs/latest.md`

1.  Read the current content of `docs/changelogs/latest.md`.
2.  Use the `write_file` command to replace the entire file's content with the
    following:
    - The new version number and release date.
    - The comprehensive highlights.
    - The complete, formatted "What's Changed" list, with each item linking to
      its pull request.

### Update `docs/changelogs/index.md`

1.  Read the current content of `docs/changelogs/index.md`.
2.  Use the `replace` command to insert a new "Announcements" section for the
    new version.
3.  This new section should be placed directly above the announcements for the
    previous version.
4.  The content of this section should be the concise highlights, ensuring all
    lines are wrapped to 80 characters.

### Finalize

1.  Run `npm run format` to ensure consistency.

## Example: v0.26.0 release

- **Inputs:**
  - New version: `v0.26.0`
  - Release date: `2026-01-27`
  - Raw changelog: (A long list of commits, as provided previously)
- **Process:**
  1.  The raw changelog is analyzed and grouped into categories like "Agents and
      Skills," "Experimental Plan Mode," etc.
  2.  Two sets of highlights are generated.
  3.  `latest.md` is updated with the comprehensive highlights and the full list
      of changes.
  4.  `index.md` is updated with a new `## Announcements: v0.26.0 - 2026-01-27`
      section containing the concise, wrapped highlights with PR/author
      callouts.
  5.  `npm run format` is executed.
