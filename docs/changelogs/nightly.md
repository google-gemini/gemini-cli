# Nightly release: Release v0.20.0-nightly.20251202.29920b16d

Released: December 2, 2025

We have a nightly release cadence that includes the most recent features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the nightly release:

```
npm install -g @google/gemini-cli@nightly
```

## What's Changed

- fix: Exclude web-fetch tool from executing in default non-interactive mode to
  avoid CLI hang. by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/14244
- Always use MCP server instructions by @chrstnb in
  https://github.com/google-gemini/gemini-cli/pull/14297
- feat: auto-execute simple slash commands on Enter by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/13985
- chore/release: bump version to 0.20.0-nightly.20251201.2fe609cb6 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14304
- feat: Add startup profiler to measure and record application initialization
  phases. by @kevin-ramdass in
  https://github.com/google-gemini/gemini-cli/pull/13638
- bug(core): Avoid stateful tool use in `executor`. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/14305
- feat(themes): add built-in holiday theme 🎁 by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/14301
- Updated ToC on docs intro; updated title casing to match Google style by
  @pcoet in https://github.com/google-gemini/gemini-cli/pull/13717
- feat(a2a): Urgent fix - Process modelInfo agent message by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/14315
- feat(core): enhance availability routing with wrapped fallback and
  single-model policies by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/13874
- chore(logging): log the problematic event for #12122 by @briandealwis in
  https://github.com/google-gemini/gemini-cli/pull/14092
- fix: remove invalid type key in bug_report.yml by @fancive in
  https://github.com/google-gemini/gemini-cli/pull/13576
- update screenshot by @Transient-Onlooker in
  https://github.com/google-gemini/gemini-cli/pull/13976
- docs: Fix grammar error in Release Cadence (Nightly section) by @JuanCS-Dev in
  https://github.com/google-gemini/gemini-cli/pull/13866
- fix(async): prevent missed async errors from bypassing catch handlers by
  @amsminn in https://github.com/google-gemini/gemini-cli/pull/13714
- fix(zed-integration): remove extra field from acp auth request by
  @marcocondrache in https://github.com/google-gemini/gemini-cli/pull/13646
- feat(cli): Documentation for model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/12967
- fix(ui): misaligned markdown table rendering by @dumbbellcode in
  https://github.com/google-gemini/gemini-cli/pull/8336
- docs: Update 4 files by @g-samroberts in
  https://github.com/google-gemini/gemini-cli/pull/13628

## New Contributors

- @pcoet made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13717
- @Transient-Onlooker made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13976
- @JuanCS-Dev made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13866
- @amsminn made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13714
- @marcocondrache made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13646
- @g-samroberts made their first contribution in
  https://github.com/google-gemini/gemini-cli/pull/13628

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.19.0-nightly.20251125.f6d97d448...v0.19.0-nightly.20251126.03845198c
