# Latest stable release: v0.49.0

Released: June 25, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Evaluation Inventory:** Added a new `eval:inventory` CLI command along with
  JSON reporting output to inventory and track behavioral evaluations.
- **GDC Air-Gapped Support:** Support for Google Distributed Cloud (GDC)
  air-gapped Service Identity following an auth library update.
- **Standardized Tool Output and Config:** Standardized formatting for tool
  outputs and migrated the `coreTools` configuration setting to `tools.core`.
- **Security and Reliability Fixes:** Prevented potential path traversal
  vulnerabilities during skill installation, handled tmux false-positive
  background detection, and ensured zero-quota API limits fail fast to prevent
  hangs.

## What's Changed

- chore(release): bump version to 0.48.0-nightly.20260609.g3a13b8eeb by
  @gemini-cli-robot in
  [#27779](https://github.com/google-gemini/gemini-cli/pull/27779)
- ci(dependabot): enable cooldown period for npm packages by @ruomengz in
  [#27743](https://github.com/google-gemini/gemini-cli/pull/27743)
- refactor(core): standardize tool output formatting by @galz10 in
  [#27772](https://github.com/google-gemini/gemini-cli/pull/27772)
- ci: update workflow logging and policy configurations by @galz10 in
  [#27853](https://github.com/google-gemini/gemini-cli/pull/27853)
- fix(core): Ensure zero-quota limits fail fast to prevent retry loop hang by
  @luisfelipe-alt in
  [#27698](https://github.com/google-gemini/gemini-cli/pull/27698)
- fix(core): handle multi-line escaped quotes in stripShellWrapper by
  @sanchezcoraspe in
  [#27467](https://github.com/google-gemini/gemini-cli/pull/27467)
- fix(cli): prevent path traversal vulnerabilities during skill install… by
  @ompatel-aiml in
  [#27767](https://github.com/google-gemini/gemini-cli/pull/27767)
- Fix/pending tools and trust overrides by @jvargassanchez-dot in
  [#27854](https://github.com/google-gemini/gemini-cli/pull/27854)
- ci: use internal environment for scheduled nightly releases (#27865) by
  @rmedranollamas in
  [#27939](https://github.com/google-gemini/gemini-cli/pull/27939)
- feat(core): Support GDC air-gapped Service Identity after auth library update
  by @sidhantgoyal-droid in
  [#27956](https://github.com/google-gemini/gemini-cli/pull/27956)
- fix(cli): handle tmux false positive background detection by @amelidev in
  [#27572](https://github.com/google-gemini/gemini-cli/pull/27572)
- Add static eval source analyzer by @ved015 in
  [#27631](https://github.com/google-gemini/gemini-cli/pull/27631)
- fix(config): migrate coreTools setting to tools.core by @galz10 in
  [#27947](https://github.com/google-gemini/gemini-cli/pull/27947)
- fix(core-tools): resolve defensive path resolution for at-reference files by
  @luisfelipe-alt in
  [#27943](https://github.com/google-gemini/gemini-cli/pull/27943)
- Revert "fix(core-tools): resolve defensive path resolution for at-reference
  files" by @galz10 in
  [#27992](https://github.com/google-gemini/gemini-cli/pull/27992)
- chore(release): bump version to 0.49.0-nightly.20260617.g4d3dcdce1 by
  @gemini-cli-robot in
  [#28003](https://github.com/google-gemini/gemini-cli/pull/28003)
- Changelog for v0.48.0-preview.0 by @gemini-cli-robot in
  [#27999](https://github.com/google-gemini/gemini-cli/pull/27999)
- fix(ci): provide fallbacks for package variables in nightly release by @galz10
  in [#28016](https://github.com/google-gemini/gemini-cli/pull/28016)
- chore(deps): pin dependencies and enforce 14-day update cooldown by @galz10 in
  [#27948](https://github.com/google-gemini/gemini-cli/pull/27948)
- fix(ci): append trailing slash to registry url in npmrc by @rmedranollamas in
  [#28038](https://github.com/google-gemini/gemini-cli/pull/28038)
- feat: add eval:inventory CLI command and reporting logic by @ved015 in
  [#28009](https://github.com/google-gemini/gemini-cli/pull/28009)
- fix: resolve workspace publish failures and scheduler event loop starvation by
  @rmedranollamas in
  [#28063](https://github.com/google-gemini/gemini-cli/pull/28063)
- fix(ci): use wombat dressing room fallback in nightly release to prevent
  ENEEDAUTH by @rmedranollamas in
  [#28104](https://github.com/google-gemini/gemini-cli/pull/28104)
- Add JSON output for eval inventory by @ved015 in
  [#28058](https://github.com/google-gemini/gemini-cli/pull/28058)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.47.0...v0.49.0
