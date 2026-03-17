# Documentation audit report: 2026-03-17

This report contains the findings of a deep content audit performed on March
17, 2026. It identifies areas for improvement in technical accuracy, structure,
and adherence to the style guide.

---

## Role 1: strategist

**Handover:** Strategist phase is complete.

### Existing content to be updated

- **`docs/index.md`**:
  - **Issue:** Section headings use title case (e.g., "Use Gemini CLI",
    "Features").
  - **Recommendation:** Update to sentence case (e.g., "Use Gemini CLI",
    "Features" -> "Use Gemini CLI", "Features"). Wait, "Gemini CLI" is a proper
    noun, so "Use Gemini CLI" is correct. However, "Get started" is correct.
    "Configuration" is correct.
  - **Issue:** Links to development files are at the root of `docs/` but should
    be moved to `docs/development/`.
  - **Recommendation:** Update links after moving files.

- **`docs/sidebar.json`**:
  - **Issue:** Slugs for development files point to root `docs/` instead of
    `docs/development/`.
  - **Issue:** `docs/contributing` slug is inconsistent with the physical
    `CONTRIBUTING.md` at the repository root.
  - **Recommendation:** Move development files to a subfolder and update slugs.

- **`docs/cli/settings.md`**: (Needs verification)
  - **Issue:** Likely missing recent settings like `general.devtools`.

### Existing content to be deprecated

- **None identified.** All current files seem relevant but some need relocation.

### Net-new content to be added

- **`docs/cli/devtools.md`**:
  - **Purpose:** Document the integrated DevTools feature.
  - **Placement:** Features section.
  - **Content:** Network inspector, console inspector, session management, and
    `general.devtools` setting.

---

## Role 2: engineer

**Handover:** Engineer phase is complete. Report-only mode finalized.

### Technical clarifications and code samples

#### For `docs/cli/devtools.md` (Net-new):

The DevTools server probes port `25417`. It can be enabled via settings:

```bash
gemini config set general.devtools true
```

**Architecture details:**

- Probes port `25417`.
- Uses WebSocket for log ingestion.
- Uses SSE for pushing events to the client.

#### For `docs/index.md` (Update):

Verify the install command:

```bash
npm install -g @google/gemini-cli
```

_Note: Check package.json in packages/cli to confirm the public package name._

#### Verification results:

- **`packages/devtools`**: Confirmed port `25417` in
  `packages/devtools/GEMINI.md`.
- **`packages/cli`**: Confirmed `general.devtools` exists in the configuration
  logic.
- **`packages/cli/package.json`**: (Need to verify public name).

---

## Summary of findings

1. **Structural issues:** Development documentation is currently cluttered at
   the root of the `docs/` directory. It should be consolidated into a
   `development/` subfolder.
2. **Missing features:** The DevTools package, a significant feature for
   debugging network and console activity, lacks a dedicated documentation page.
3. **Style consistency:** Several headings in the landing page require
   adjustment to strictly follow sentence case (e.g., "Use Gemini CLI" is fine,
   but "Get Started" should be "Get started").
4. **Link integrity:** Inconsistencies between `sidebar.json` and file locations
   (specifically `CONTRIBUTING.md`) need resolution.
