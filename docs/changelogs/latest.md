# Latest stable release: v0.23.0

Released: January 6, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Gemini CLI wrapped:** Run `npx gemini-wrapped` to visualize your usage
  stats, top models, languages, and more!
- **Windows clipboard image support:** Windows users can now paste images
  directly from their clipboard into the CLI using `Alt`+`V`.
  ([pr](https://github.com/google-gemini/gemini-cli/pull/13997) by
  [@sgeraldes](https://github.com/sgeraldes))
- **Terminal background color detection:** Automatically optimizes your
  terminal's background color to select compatible themes and provide
  accessibility warnings.
  ([pr](https://github.com/google-gemini/gemini-cli/pull/15132) by
  [@jacob314](https://github.com/jacob314))
- **Session logout:** Use the new `/logout` command to instantly clear
  credentials and reset your authentication state for seamless account
  switching. ([pr](https://github.com/google-gemini/gemini-cli/pull/13383) by
  [@CN-Scars](https://github.com/CN-Scars))

## What's changed

- Code assist service metrics. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15024
- chore/release: bump version to 0.21.0-nightly.20251216.bb0c0d8ee by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15121
- Docs by @Roaimkhan in https://github.com/google-gemini/gemini-cli/pull/15103
- Use official ACP SDK and support HTTP/SSE based MCP servers by @SteffenDE in
  https://github.com/google-gemini/gemini-cli/pull/13856
- Remove foreground for themes other than shades of purple and holiday. by
  @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14606
- chore: remove repo specific tips by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15164
- chore: remove user query from footer in debug mode by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/15169
- Disallow unnecessary awaits. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15172
- Add one to the padding in settings dialog to avoid flicker. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15173
- feat(core): introduce remote agent infrastructure and rename local executor by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/15110
- feat(cli): Add `/auth logout` command to clear credentials and auth state by
  @CN-Scars in https://github.com/google-gemini/gemini-cli/pull/13383
- (fix) Automated pr labeller by @DaanVersavel in
  https://github.com/google-gemini/gemini-cli/pull/14885
- feat: launch Gemini 3 Flash in Gemini CLI ⚡️⚡️⚡️ by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15196
- Refactor: Migrate console.error in ripGrep.ts to debugLogger by @Adib234 in
  https://github.com/google-gemini/gemini-cli/pull/15201
- chore: update a2a-js to 0.3.7 by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/15197
- chore(core): remove redundant isModelAvailabilityServiceEnabled toggle and
  clean up dead code by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/15207
- feat(core): Late resolve `GenerateContentConfig`s and reduce mutation. by
  @joshualitt in https://github.com/google-gemini/gemini-cli/pull/14920
- Respect previewFeatures value from the remote flag if undefined by @sehoon38
  in https://github.com/google-gemini/gemini-cli/pull/15214
- feat(ui): add Windows clipboard image support and Alt+V paste workaround by
  @jacob314 in https://github.com/google-gemini/gemini-cli/pull/15218
- chore(core): remove legacy fallback flags and migrate loop detection by
  @adamfweidman in https://github.com/google-gemini/gemini-cli/pull/15213
- fix(ui): Prevent eager slash command completion hiding sibling commands by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15224
- Docs: Update Changelog for Dec 17, 2025 by @jkcinouye in
  https://github.com/google-gemini/gemini-cli/pull/15204
- Code Assist backend telemetry for user accept/reject of suggestions by
  @gundermanc in https://github.com/google-gemini/gemini-cli/pull/15206
- fix(cli): correct initial history length handling for chat commands by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15223
- chore/release: bump version to 0.21.0-nightly.20251218.739c02bd6 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15231
- Change detailed model stats to use a new shared Table class to resolve
  robustness issues. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15208
- feat: add agent toml parser by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15112
- Add core tool that adds all context from the core package. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15238
- (docs): Add reference section to hooks documentation by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15159
- feat(hooks): add support for friendly names and descriptions by @abhipatel12
  in https://github.com/google-gemini/gemini-cli/pull/15174
- feat: Detect background color by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15132
- add 3.0 to allowed sensitive keywords by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15276
- feat: Pass additional environment variables to shell execution by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15160
- Remove unused code by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15290
- Handle all 429 as retryableQuotaError by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/15288
- Remove unnecessary dependencies by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15291
- fix: prevent infinite loop in prompt completion on error by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/14548
- fix(ui): show command suggestions even on perfect match and sort them by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15287
- feat(hooks): reduce log verbosity and improve error reporting in UI by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15297
- feat: simplify tool confirmation labels for better UX by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15296
- chore/release: bump version to 0.21.0-nightly.20251219.70696e364 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15301
- feat(core): Implement JIT context memory loading and UI sync by @SandyTao520
  in https://github.com/google-gemini/gemini-cli/pull/14469
- feat(ui): Put "Allow for all future sessions" behind a setting off by default.
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/15322
- fix(cli):change the placeholder of input during the shell mode by
  @JayadityaGit in https://github.com/google-gemini/gemini-cli/pull/15135
- Validate OAuth resource parameter matches MCP server URL by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15289
- docs(cli): add System Prompt Override (GEMINI_SYSTEM_MD) by @ashmod in
  https://github.com/google-gemini/gemini-cli/pull/9515
- more robust command parsing logs by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15339
- Introspection agent demo by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15232
- fix(core): sanitize hook command expansion and prevent injection by
  @SandyTao520 in https://github.com/google-gemini/gemini-cli/pull/15343
- fix(folder trust): add validation for trusted folder level by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/12215
- fix(cli): fix right border overflow in trust dialogs by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/15350
- fix(policy): fix bug where accepting-edits continued after it was turned off
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/15351
- fix: prevent infinite relaunch loop when --resume fails (#14941) by @Ying-xi
  in https://github.com/google-gemini/gemini-cli/pull/14951
- chore/release: bump version to 0.21.0-nightly.20251220.41a1a3eed by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15352
- feat(telemetry): add clearcut logging for hooks by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15405
- fix(core): Add `.geminiignore` support to SearchText tool by @xyrolle in
  https://github.com/google-gemini/gemini-cli/pull/13763
- fix(patch): cherry-pick 0843d9a to release/v0.23.0-preview.0-pr-15443 to patch
  version v0.23.0-preview.0 and create version 0.23.0-preview.1 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15445
- fix(patch): cherry-pick 9cdb267 to release/v0.23.0-preview.1-pr-15494 to patch
  version v0.23.0-preview.1 and create version 0.23.0-preview.2 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15592
- fix(patch): cherry-pick 37be162 to release/v0.23.0-preview.2-pr-15601 to patch
  version v0.23.0-preview.2 and create version 0.23.0-preview.3 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15603
- fix(patch): cherry-pick 07e597d to release/v0.23.0-preview.3-pr-15684
  [CONFLICTS] by @gemini-cli-robot in
  https://github.com/google-gemini/gemini-cli/pull/15734
- fix(patch): cherry-pick c31f053 to release/v0.23.0-preview.4-pr-16004 to patch
  version v0.23.0-preview.4 and create version 0.23.0-preview.5 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/16027
- fix(patch): cherry-pick 788bb04 to release/v0.23.0-preview.5-pr-15817
  [CONFLICTS] by @gemini-cli-robot in
  https://github.com/google-gemini/gemini-cli/pull/16038

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.22.5...v0.23.0
