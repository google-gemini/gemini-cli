---
name: docs-changelog
description: Provides a step-by-step procedure for generating Gemini CLI changelog files based on github release information.
---

# Procedure: Updating Changelog for New Releases

The following instructions are run by Gemini CLI when processing new releases.

## Objective

To standardize the process of updating the Gemini CLI changelog files for a new
release, ensuring accuracy, consistency, and adherence to project style
guidelines.

## Release Types

This skill covers two types of releases:

*   **Standard Releases:** Regular, versioned releases that are announced to all
    users. These updates modify `docs/changelogs/latest.md` and
    `docs/changelogs/index.md`.
*   **Preview Releases:** Pre-release versions for testing and feedback. These
    updates only modify `docs/changelogs/preview.md`.

Ignore all other releases, such as nightly releases.

### Expected Inputs

Regardless of the type of release, the following information is expected:

*   **New version number:** The version number for the new release
    (e.g., `v0.27.0`).
*   **Release date:** The date of the new release (e.g., `2026-02-03`).
*   **Raw changelog data:** A list of all pull requests and changes
    included in the release, in the format `description by @author in
    #pr_number`.
*   **Previous version number:** The version number of the last release can be
    calculated by decreasing the minor version number by one and setting the
    patch or bug fix version number.

## Procedure

### Initial Setup

1.  Identify the files to be modified: 

    For standard releases, update `docs/changelogs/latest.md` and
    `docs/changelogs/index.md`. For preview releases, update
    `docs/changelogs/preview.md`.

2.  Activate the `docs-writer` skill.

### Analyze Raw Changelog Data

1.  Review the complete list of changes. If it is a patch or a bug fix with few
    changes, skip to the "Update `docs/changelogs/latest.md` or
    `docs/changelogs/preview.md`" section.

2.  Group related changes into high-level categories such as
    important features, "UI/UX Improvements", and "Bug Fixes". Use the existing
    announcements in `docs/changelogs/index.md` as an example.

### Create Highlight Summaries

Create two distinct versions of the release highlights.

**Important:** Carefully inspect highlights for "experimental" or
"preview" features before public announcement, and do not include them.

#### Version 1: Comprehensive Highlights (for `latest.md` or `preview.md`)

Write a detailed summary for each category focusing on user-facing
impact.

#### Version 2: Concise Highlights (for `index.md`)

Skip this step for preview releases.

Write concise summaries including the primary PR and author
(e.g., `([#12345](link) by @author)`).

### Update `docs/changelogs/latest.md` or `docs/changelogs/preview.md`

1. Read current content and use `write_file` to replace it with the new
  version number, and date.
  
  If it is a patch or bug fix with few changes, simply add these
  changes to the "What's Changed" list. Otherwise, replace comprehensive
  highlights, and the full "What's Changed" list. 

2. For each item in the "What's Changed" list, keep usernames in plaintext, and
  add github links for each issue number. Example:

  "- feat: implement /rewind command by @username in
  [#12345](https://github.com/google-gemini/gemini-cli/pull/12345)"

3. Skip entries by @gemini-cli-robot.

4. Do not add the "New Contributors" section.

5. Update the "Full changelog:" link by doing one of following:

   If it is a patch or bug fix with few changes, retain the original link
   but replace the latter version with the new version. For example, if the
   patch is version is "v0.28.1", replace the latter version:
   "https://github.com/google-gemini/gemini-cli/compare/v0.27.0...v0.28.0" with
   "https://github.com/google-gemini/gemini-cli/compare/v0.27.0...v0.28.1".
   
   Otherwise, for minor and major version changes, replace the link with the
   one included at the end of the changelog data.

6. Ensure lines are wrapped to 80 characters.

### Update `docs/changelogs/index.md`

Skip this step for patches, bug fixes, or preview releases.

Insert a new "Announcements" section for the new version directly
above the previous version's section. Ensure lines are wrapped to
80 characters.

### Finalize

Run `npm run format` to ensure consistency.
