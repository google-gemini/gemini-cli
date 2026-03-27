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

## Open issue search review

Search snapshot date: 2026-03-27.

### Open issues from the repo search for `XDG`

| Issue                                                              | Classification                  | Notes                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [#23796](https://github.com/google-gemini/gemini-cli/issues/23796) | Fully resolved for the main ask | Adds XDG-aware config selection, exact `$GEMINI_CONFIG_DIR`, and legacy compatibility.                      |
| [#1825](https://github.com/google-gemini/gemini-cli/issues/1825)   | Partially resolved              | Covers the XDG config/cache/tmp direction. Full XDG data/state/runtime classification is still outstanding. |
| [#22274](https://github.com/google-gemini/gemini-cli/issues/22274) | Not related                     | Mentions `XDG_SESSION_TYPE`; not a config/cache/tmp directory issue.                                        |
| [#21983](https://github.com/google-gemini/gemini-cli/issues/21983) | Not related                     | Wayland/browser issue; not about XDG base-directory handling.                                               |
| [#2023](https://github.com/google-gemini/gemini-cli/issues/2023)   | Not related                     | Search hit only; not a user-directory issue.                                                                |
| [#12657](https://github.com/google-gemini/gemini-cli/issues/12657) | Not related                     | Search hit only; not a user-directory issue.                                                                |

### Open issues from the repo searches for `$HOME/.gemini` or `~/.gemini`

| Issue                                                              | Classification     | Notes                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#23622](https://github.com/google-gemini/gemini-cli/issues/23622) | Mostly resolved    | This PR documents deprecated `$GEMINI_CLI_HOME` semantics clearly and adds exact `*_DIR` overrides so users no longer need to rely on the hidden `.gemini` leaf. |
| [#21652](https://github.com/google-gemini/gemini-cli/issues/21652) | Partially resolved | Temporary files now default to `<cache directory>/tmp` or `$GEMINI_TMP_DIR`, but this PR does not yet change cleanup or retention policy.                        |
| [#19263](https://github.com/google-gemini/gemini-cli/issues/19263) | Partially resolved | User-level `.env` loading now follows the selected user config dir, and legacy `~/.gemini/.env` remains a compatibility fallback for existing users.             |
| [#2493](https://github.com/google-gemini/gemini-cli/issues/2493)   | Not resolved       | This PR preserves existing project `.env` precedence; it does not add an “ignore local `.env`” mode.                                                             |
| [#19663](https://github.com/google-gemini/gemini-cli/issues/19663) | Not resolved       | This PR does not implement merged hierarchical `.env` loading.                                                                                                   |
| [#20005](https://github.com/google-gemini/gemini-cli/issues/20005) | Not resolved       | Adjacent `.env` trust-warning UX only; this PR does not change untrusted-workspace warning behaviour.                                                            |
| [#22309](https://github.com/google-gemini/gemini-cli/issues/22309) | Not resolved       | Adjacent home-directory warning behaviour only; not changed here.                                                                                                |
| [#22929](https://github.com/google-gemini/gemini-cli/issues/22929) | Not resolved       | Adjacent home-directory command conflict behaviour only; not changed here.                                                                                       |

Literal `~/.gemini` / `$HOME/.gemini` searches also surface many incidental open
issues where those paths appear only in logs, crash output, or repro examples
rather than as the underlying feature request. I reviewed those search hits as
well, but did not treat them as related config-path issues in this PR. Examples
include [#23934](https://github.com/google-gemini/gemini-cli/issues/23934) and
[#23665](https://github.com/google-gemini/gemini-cli/issues/23665).

## Earlier issue context

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
