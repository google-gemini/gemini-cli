# Preview release: v0.33.0-preview.0

Released: March 3, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Plan Mode Enhancements**: Added support for annotating plans with feedback
  for iteration, enabling built-in research subagents in plan mode, and a new
  `copy` subcommand.
- **Agent and Skill Improvements**: Introduced the new `github-issue-creator`
  skill, implemented HTTP authentication support for A2A remote agents, and
  added support for authenticated A2A agent card discovery.
- **CLI UX/UI Updates**: Redesigned the header to be compact with an ASCII icon,
  inverted the context window display to show usage, and directly indicate auth
  required state for agents.
- **Core and ACP Enhancements**: Implemented slash command handling in ACP (for
  `/memory`, `/init`, `/extensions`, and `/restore`), added a set models
  interface to ACP, and centralized `read_file` limits while truncating large
  MCP tool output.

## What's Changed

- Docs: Update model docs to remove Preview Features. by @jkcinouye in
  [#20084](https://github.com/google-gemini/gemini-cli/pull/20084)
- docs: fix typo in installation documentation by @AdityaSharma-Git3207 in
  [#20153](https://github.com/google-gemini/gemini-cli/pull/20153)
- docs: add Windows PowerShell equivalents for environments and scripting by
  @scidomino in [#20333](https://github.com/google-gemini/gemini-cli/pull/20333)
- fix(core): parse raw ASCII buffer strings in Gaxios errors by @sehoon38 in
  [#20626](https://github.com/google-gemini/gemini-cli/pull/20626)
- chore(release): bump version to 0.33.0-nightly.20260227.ba149afa0 by @galz10
  in [#20637](https://github.com/google-gemini/gemini-cli/pull/20637)
- fix(github): use robot PAT for automated PRs to pass CLA check by @galz10 in
  [#20641](https://github.com/google-gemini/gemini-cli/pull/20641)
- chore/release: bump version to 0.33.0-nightly.20260228.1ca5c05d0 by
  @gemini-cli-robot in
  [#20644](https://github.com/google-gemini/gemini-cli/pull/20644)
- Changelog for v0.31.0 by @gemini-cli-robot in
  [#20634](https://github.com/google-gemini/gemini-cli/pull/20634)
- fix: use full paths for ACP diff payloads by @JagjeevanAK in
  [#19539](https://github.com/google-gemini/gemini-cli/pull/19539)
- Changelog for v0.32.0-preview.0 by @gemini-cli-robot in
  [#20627](https://github.com/google-gemini/gemini-cli/pull/20627)
- fix: acp/zed race condition between MCP initialisation and prompt by
  @kartikangiras in
  [#20205](https://github.com/google-gemini/gemini-cli/pull/20205)
- fix(cli): reset themeManager between tests to ensure isolation by
  @NTaylorMullen in
  [#20598](https://github.com/google-gemini/gemini-cli/pull/20598)
- refactor(core): Extract tool parameter names as constants by @SandyTao520 in
  [#20460](https://github.com/google-gemini/gemini-cli/pull/20460)
- fix(cli): resolve autoThemeSwitching when background hasn't changed but theme
  mismatches by @sehoon38 in
  [#20706](https://github.com/google-gemini/gemini-cli/pull/20706)
- feat(skills): add github-issue-creator skill by @sehoon38 in
  [#20709](https://github.com/google-gemini/gemini-cli/pull/20709)
- fix(cli): allow sub-agent confirmation requests in UI while preventing
  background flicker by @abhipatel12 in
  [#20722](https://github.com/google-gemini/gemini-cli/pull/20722)
- Merge User and Agent Card Descriptions #20849 by @adamfweidman in
  [#20850](https://github.com/google-gemini/gemini-cli/pull/20850)
- fix(core): reduce LLM-based loop detection false positives by @SandyTao520 in
  [#20701](https://github.com/google-gemini/gemini-cli/pull/20701)
- fix(plan): deflake plan mode integration tests by @Adib234 in
  [#20477](https://github.com/google-gemini/gemini-cli/pull/20477)
- Add /unassign support by @scidomino in
  [#20864](https://github.com/google-gemini/gemini-cli/pull/20864)
- feat(core): implement HTTP authentication support for A2A remote agents by
  @SandyTao520 in
  [#20510](https://github.com/google-gemini/gemini-cli/pull/20510)
- feat(core): centralize read_file limits and update gemini-3 description by
  @aishaneeshah in
  [#20619](https://github.com/google-gemini/gemini-cli/pull/20619)
- Do not block CI on evals by @gundermanc in
  [#20870](https://github.com/google-gemini/gemini-cli/pull/20870)
- document node limitation for shift+tab by @scidomino in
  [#20877](https://github.com/google-gemini/gemini-cli/pull/20877)
- Add install as an option when extension is selected. by @DavidAPierce in
  [#20358](https://github.com/google-gemini/gemini-cli/pull/20358)
- Update CODEOWNERS for README.md reviewers by @g-samroberts in
  [#20860](https://github.com/google-gemini/gemini-cli/pull/20860)
- feat(core): truncate large MCP tool output by @SandyTao520 in
  [#19365](https://github.com/google-gemini/gemini-cli/pull/19365)
- Subagent activity UX. by @gundermanc in
  [#17570](https://github.com/google-gemini/gemini-cli/pull/17570)
- style(cli) : Dialog pattern for /hooks Command by @AbdulTawabJuly in
  [#17930](https://github.com/google-gemini/gemini-cli/pull/17930)
- feat: redesign header to be compact with ASCII icon by @keithguerin in
  [#18713](https://github.com/google-gemini/gemini-cli/pull/18713)
- fix(core): ensure subagents use qualified MCP tool names by @abhipatel12 in
  [#20801](https://github.com/google-gemini/gemini-cli/pull/20801)
- feat(core): support authenticated A2A agent card discovery by @SandyTao520 in
  [#20622](https://github.com/google-gemini/gemini-cli/pull/20622)
- refactor(cli): fully remove React anti patterns, improve type safety and fix
  UX oversights in SettingsDialog.tsx by @psinha40898 in
  [#18963](https://github.com/google-gemini/gemini-cli/pull/18963)
- Adding MCPOAuthProvider implementing the MCPSDK OAuthClientProvider by
  @Nayana-Parameswarappa in
  [#20121](https://github.com/google-gemini/gemini-cli/pull/20121)
- feat(core): add tool name validation in TOML policy files by @allenhutchison
  in [#19281](https://github.com/google-gemini/gemini-cli/pull/19281)
- docs: fix broken markdown links in main README.md by @Hamdanbinhashim in
  [#20300](https://github.com/google-gemini/gemini-cli/pull/20300)
- refactor(core): replace manual syncPlanModeTools with declarative policy rules
  by @jerop in [#20596](https://github.com/google-gemini/gemini-cli/pull/20596)
- fix(core): increase default headers timeout to 5 minutes by @gundermanc in
  [#20890](https://github.com/google-gemini/gemini-cli/pull/20890)
- feat(admin): enable 30 day default retention for chat history & remove warning
  by @skeshive in
  [#20853](https://github.com/google-gemini/gemini-cli/pull/20853)
- feat(plan): support annotating plans with feedback for iteration by @Adib234
  in [#20876](https://github.com/google-gemini/gemini-cli/pull/20876)
- Add some dos and don'ts to behavioral evals README. by @gundermanc in
  [#20629](https://github.com/google-gemini/gemini-cli/pull/20629)
- fix(core): skip telemetry logging for AbortError exceptions by @yunaseoul in
  [#19477](https://github.com/google-gemini/gemini-cli/pull/19477)
- fix(core): restrict "System: Please continue" invalid stream retry to Gemini 2
  models by @SandyTao520 in
  [#20897](https://github.com/google-gemini/gemini-cli/pull/20897)
- ci(evals): only run evals in CI if prompts or tools changed by @gundermanc in
  [#20898](https://github.com/google-gemini/gemini-cli/pull/20898)
- Build binary by @aswinashok44 in
  [#18933](https://github.com/google-gemini/gemini-cli/pull/18933)
- Code review fixes as a pr by @jacob314 in
  [#20612](https://github.com/google-gemini/gemini-cli/pull/20612)
- fix(ci): handle empty APP_ID in stale PR closer by @bdmorgan in
  [#20919](https://github.com/google-gemini/gemini-cli/pull/20919)
- feat(cli): invert context window display to show usage by @keithguerin in
  [#20071](https://github.com/google-gemini/gemini-cli/pull/20071)
- fix(plan): clean up session directories and plans on deletion by @jerop in
  [#20914](https://github.com/google-gemini/gemini-cli/pull/20914)
- fix(core): enforce optionality for API response fields in code_assist by
  @sehoon38 in [#20714](https://github.com/google-gemini/gemini-cli/pull/20714)
- feat(extensions): add support for plan directory in extension manifest by
  @mahimashanware in
  [#20354](https://github.com/google-gemini/gemini-cli/pull/20354)
- feat(plan): enable built-in research subagents in plan mode by @Adib234 in
  [#20972](https://github.com/google-gemini/gemini-cli/pull/20972)
- feat(agents): directly indicate auth required state by @adamfweidman in
  [#20986](https://github.com/google-gemini/gemini-cli/pull/20986)
- fix(cli): wait for background auto-update before relaunching by @scidomino in
  [#20904](https://github.com/google-gemini/gemini-cli/pull/20904)
- fix: pre-load @scripts/copy_files.js references from external editor prompts
  by @kartikangiras in
  [#20963](https://github.com/google-gemini/gemini-cli/pull/20963)
- feat(evals): add behavioral evals for ask_user tool by @Adib234 in
  [#20620](https://github.com/google-gemini/gemini-cli/pull/20620)
- refactor common settings logic for skills,agents by @ishaanxgupta in
  [#17490](https://github.com/google-gemini/gemini-cli/pull/17490)
- Update docs-writer skill with new resource by @g-samroberts in
  [#20917](https://github.com/google-gemini/gemini-cli/pull/20917)
- fix(cli): pin clipboardy to ~5.2.x by @scidomino in
  [#21009](https://github.com/google-gemini/gemini-cli/pull/21009)
- feat: Implement slash command handling in ACP for
  `/memory`,`/init`,`/extensions` and `/restore` by @sripasg in
  [#20528](https://github.com/google-gemini/gemini-cli/pull/20528)
- Docs/add hooks reference by @AadithyaAle in
  [#20961](https://github.com/google-gemini/gemini-cli/pull/20961)
- feat(plan): add copy subcommand to plan (#20491) by @ruomengz in
  [#20988](https://github.com/google-gemini/gemini-cli/pull/20988)
- fix(core): sanitize and length-check MCP tool qualified names by @abhipatel12
  in [#20987](https://github.com/google-gemini/gemini-cli/pull/20987)
- Format the quota/limit style guide. by @g-samroberts in
  [#21017](https://github.com/google-gemini/gemini-cli/pull/21017)
- fix(core): send shell output to model on cancel by @devr0306 in
  [#20501](https://github.com/google-gemini/gemini-cli/pull/20501)
- remove hardcoded tiername when missing tier by @sehoon38 in
  [#21022](https://github.com/google-gemini/gemini-cli/pull/21022)
- feat(acp): add set models interface by @skeshive in
  [#20991](https://github.com/google-gemini/gemini-cli/pull/20991)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.32.0-preview.0...v0.33.0-preview.0
