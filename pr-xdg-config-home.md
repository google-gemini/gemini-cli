## Summary

This PR makes Gemini CLI's user-directory handling XDG-aware for configuration,
cache, and temporary files, while preserving compatibility for existing users.

It adds exact directory overrides:

1. `$GEMINI_CONFIG_DIR`
2. `$GEMINI_CACHE_DIR`
3. `$GEMINI_TMP_DIR`

It also deprecates `$GEMINI_CLI_HOME` as a root override. Gemini CLI now exits
at startup if `$GEMINI_CLI_HOME` is set together with any exact `*_DIR`
override.

The resolved defaults are now:

1. Configuration directory: `$XDG_CONFIG_HOME/gemini-cli`
2. Cache directory: `$XDG_CACHE_HOME/gemini-cli`
3. Temporary directory: `<cache directory>/tmp`

If the configuration directory does not exist and a legacy `~/.gemini` directory
already exists, Gemini CLI keeps using `~/.gemini`. If neither exists, Gemini
CLI creates and uses `$XDG_CONFIG_HOME/gemini-cli`. If `$GEMINI_CONFIG_DIR` is
set, Gemini CLI creates that directory if it does not exist.

## Why this approach

- Aligns the default user layout with XDG config/cache expectations.
- Adds exact-path overrides with clear semantics. Unlike deprecated
  `$GEMINI_CLI_HOME`, they do not force a hidden `.gemini` subdirectory.
- Preserves legacy `~/.gemini` behaviour for existing users.
- Keeps the XDG directory name as `gemini-cli`, matching `/etc/gemini-cli`.
- Leaves project-level `.gemini` behaviour intentionally unchanged.

## Legacy and conflict handling

For the user configuration directory:

- The configuration directory is `$XDG_CONFIG_HOME/gemini-cli`.
- A pre-existing legacy `~/.gemini` directory is used only if the configuration
  directory does not exist.
- If both directories exist, Gemini CLI resolves real paths first. If they point
  to different directories, Gemini CLI warns at startup for that session and
  uses `$XDG_CONFIG_HOME/gemini-cli`. If they point to the same real directory,
  the warning is suppressed.

The warning gives explicit options:

1. Merge all config into `$XDG_CONFIG_HOME/gemini-cli` (recommended)
2. Merge all config into `~/.gemini` (deprecated legacy directory)
3. Do nothing and continue receiving this warning before using
   `$XDG_CONFIG_HOME/gemini-cli`

## Scope boundaries

- No project-level `.gemini-cli -> .gemini` fallback was added.
  - Rationale: a second project-local config root would create duplicate and
    ambiguous precedence risk inside active repositories.
- This change covers user-level configuration, cache, and temporary-directory
  resolution, plus the related docs, warnings, policy rules, and sandbox path
  allowances.
- This PR does not yet fully classify all persisted artefacts across the full
  XDG config/data/state model.

## Future follow-ups

- Audit long-lived mutable files that still live under the configuration
  directory and decide which should move to `$XDG_STATE_HOME/gemini-cli`.
- Audit durable non-config artefacts and decide whether any belong in
  `$XDG_DATA_HOME/gemini-cli`.
- Consider `$XDG_RUNTIME_DIR` only for artefacts that actually need its
  lifecycle and permissions semantics; do not partially emulate it.
- Tighten the macOS strict seatbelt profiles further once that broader read
  scope can be validated safely on macOS.

## Sandbox impact

- macOS seatbelt templates now take the resolved configuration, cache, and
  temporary directory paths instead of assuming hard-coded legacy paths.
- Linux sandbox behaviour did not need structural changes for this patch.
- The strict macOS profiles still retain broader pre-existing reads of
  `~/.config` and `~/.cache`; this PR only threads the exact selected Gemini
  directories through the templates.

## Related issues from the repo search for `$XDG_CONFIG_HOME`

Search snapshot date: 2026-03-26.

| Issue                                                              | Classification                           | Notes                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#23796](https://github.com/google-gemini/gemini-cli/issues/23796) | Fully resolved for the main ask          | Adds XDG-aware config selection, exact `$GEMINI_CONFIG_DIR`, and legacy compatibility.                                                                                    |
| [#1825](https://github.com/google-gemini/gemini-cli/issues/1825)   | Partially resolved                       | Covers the XDG config/cache/tmp direction. Full XDG data/state classification is still outstanding.                                                                       |
| [#2815](https://github.com/google-gemini/gemini-cli/issues/2815)   | Partially resolved                       | This PR adds the explicit config-dir override that issue wanted, via `$GEMINI_CONFIG_DIR`. It does not implement the broader set of XDG base-dir changes discussed there. |
| [#7280](https://github.com/google-gemini/gemini-cli/issues/7280)   | Fully resolved as a side-effect          | Not really a config-path issue on its own, but this PR does satisfy the `.config`-style expectation it was tagged with.                                                   |
| [#8440](https://github.com/google-gemini/gemini-cli/issues/8440)   | Partially resolved / partially unrelated | Exact user config override is now supported via `$GEMINI_CONFIG_DIR`. Other items in that issue remain out of scope here.                                                 |
| [#6438](https://github.com/google-gemini/gemini-cli/issues/6438)   | String-only linked                       | Not a user-directory issue; it appears in the search only because `$XDG_CONFIG_HOME` is mentioned in a shell snippet.                                                     |

## Related PR context

- [#1825](https://github.com/google-gemini/gemini-cli/issues/1825): useful
  earlier XDG discussion, but the proposed implementation is old and no longer
  matches the current code shape.
- [#2815](https://github.com/google-gemini/gemini-cli/issues/2815): good
  motivation for an exact config-dir override; this PR adds that explicitly
  instead of continuing to overload deprecated `$GEMINI_CLI_HOME`.
- [#7280](https://github.com/google-gemini/gemini-cli/issues/7280): not a
  duplicate, but this PR does resolve the `.config` expectation behind that tag.

## Testing

- Added and updated tests for:
  - exact `$GEMINI_CONFIG_DIR`, `$GEMINI_CACHE_DIR`, and `$GEMINI_TMP_DIR`
  - startup validation when deprecated `$GEMINI_CLI_HOME` is combined with exact
    `*_DIR` overrides
  - XDG cache/tmp path resolution
  - plan-mode storage policy matching for the resolved temp directory
  - macOS sandbox propagation of resolved config/cache/tmp paths
- Updated docs to describe the new directory semantics and the deprecated
  `$GEMINI_CLI_HOME` behaviour.
