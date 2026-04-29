# Gemini CLI — Project Mandates & Release Workflow

This repository follows a strict "Downstream Maintainer" model to ensure that
local enhancements (CAMP-specific logic, UI tweaks) are integrated robustly with
upstream Gemini CLI releases.

## Branching Model

- **`main`**: Pure mirror of the upstream repository. Never commit local changes
  here.
- **`CAMP-main`**: Our primary integration branch. Contains all local patches
  (e.g., CAMP §24 automation, enhanced UI components, robust SEA detection). All
  new local features start here.
- **`release/v<version>`**: Ephemeral branches carved from `CAMP-main` for
  specific releases (e.g., `release/v0.39.x`). These branches are for final
  validation, building, and tagging.

## Release and Rebase Workflow

1.  **Upstream Sync**: When a new upstream release is available, pull it into
    the `main` branch.
2.  **Strategic Assessment**:
    - **CRITICAL**: Before rebasing `CAMP-main`, the agent MUST analyze the
      upstream changelog and source code.
    - **Goal**: Identify if upstream has introduced features that overlap with
      or improve upon our CAMP implementation.
    - **Action**: If upstream provides a native primitive (e.g., a new hook or a
      `ContextProcessor`), prioritize migrating our local "hacks" to the native
      upstream approach to improve the long-term stability of the CAMP spec.
3.  **Forward Porting**: Rebase `CAMP-main` onto `main`. Resolve conflicts with
    a focus on preserving the architectural intent of our local changes.
4.  **Release Carving**: Once `CAMP-main` is stable on the new version, create a
    `release/v<version>` branch.
5.  **Validation**: Perform a full `npm run build` and `npm run test` on the
    release branch.
6.  **Deterministic Release**:
    - Run `make target-install` to deploy to the stable runtime path
      (`~/.local/share/gemini-custom-runtime/`).
    - Create an annotated git tag (e.g., `v0.40.0-rrs.1`) pointing to the
      verified commit.

## Development Standards

- **Fix-Forward**: If a bug is found in a release branch, implement the fix in
  `CAMP-main` first, then cherry-pick it to the active release branches. This
  ensures fixes are not lost during the next rebase.
- **Deterministic Builds**: Always use the Node.js execution model (via the Bash
  wrapper) instead of experimental ELF/SEA binaries for production use.
- **Makefile**: Use `make target-install` for all deployments to ensure a clean,
  isolated runtime environment.

## Contextual Mandates (CAMP)

- Refer to `~/AI/multi-agent-memory-architecture.md` for the core memory
  protocols.
- All session-end activities MUST include a diary entry in AAAK format.
