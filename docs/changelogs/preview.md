# Preview release: v0.30.0-preview.3

Released: February 19, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Initial SDK Package:** Introduced the initial SDK package with support for
  custom skills and dynamic system instructions.
- **Refined Plan Mode:** Refined Plan Mode with support for enabling skills,
  improved agentic execution, and project exploration without planning.
- **Enhanced CLI UI:** Enhanced CLI UI with a new clean UI toggle, minimal-mode
  bleed-through, and support for Ctrl-Z suspension.
- **`--policy` flag:** Added the `--policy` flag to support user-defined
  policies.
- **New Themes:** Added Solarized Dark and Solarized Light themes.

## What's Changed

- fix(patch): cherry-pick 261788c to release/v0.30.0-preview.0-pr-19453 to patch
  version v0.30.0-preview.0 and create version 0.30.0-preview.1 by
  @gemini-cli-robot in
  [#19490](https://github.com/google-gemini/gemini-cli/pull/19490)
- feat(ux): added text wrapping capabilities to markdown tables by @devr0306 in
  [#18240](https://github.com/google-gemini/gemini-cli/pull/18240)
- Revert "fix(mcp): ensure MCP transport is closed to prevent memory leaks" by
  @skeshive in [#18771](https://github.com/google-gemini/gemini-cli/pull/18771)
- chore(release): bump version to 0.30.0-nightly.20260210.a2174751d by
  @gemini-cli-robot in
  [#18772](https://github.com/google-gemini/gemini-cli/pull/18772)
- chore: cleanup unused and add unlisted dependencies in packages/core by
  @adamfweidman in
  [#18762](https://github.com/google-gemini/gemini-cli/pull/18762)
- chore(core): update activate_skill prompt verbiage to be more direct by
  @NTaylorMullen in
  [#18605](https://github.com/google-gemini/gemini-cli/pull/18605)
- Add autoconfigure memory usage setting to the dialog by @jacob314 in
  [#18510](https://github.com/google-gemini/gemini-cli/pull/18510)
- fix(core): prevent race condition in policy persistence by @braddux in
  [#18506](https://github.com/google-gemini/gemini-cli/pull/18506)
- fix(evals): prevent false positive in hierarchical memory test by
  @Abhijit-2592 in
  [#18777](https://github.com/google-gemini/gemini-cli/pull/18777)
- test(evals): mark all `save_memory` evals as `USUALLY_PASSES` due to
  unreliability by @jerop in
  [#18786](https://github.com/google-gemini/gemini-cli/pull/18786)
- feat(cli): add setting to hide shortcuts hint UI by @LyalinDotCom in
  [#18562](https://github.com/google-gemini/gemini-cli/pull/18562)
- feat(core): formalize 5-phase sequential planning workflow by @jerop in
  [#18759](https://github.com/google-gemini/gemini-cli/pull/18759)
- Introduce limits for search results. by @gundermanc in
  [#18767](https://github.com/google-gemini/gemini-cli/pull/18767)
- fix(cli): allow closing debug console after auto-open via flicker by
  @SandyTao520 in
  [#18795](https://github.com/google-gemini/gemini-cli/pull/18795)
- feat(masking): enable tool output masking by default by @abhipatel12 in
  [#18564](https://github.com/google-gemini/gemini-cli/pull/18564)
- perf(ui): optimize table rendering by memoizing styled characters by @devr0306
  in [#18770](https://github.com/google-gemini/gemini-cli/pull/18770)
- feat: multi-line text answers in ask-user tool by @jackwotherspoon in
  [#18741](https://github.com/google-gemini/gemini-cli/pull/18741)
- perf(cli): truncate large debug logs and limit message history by @mattKorwel
  in [#18663](https://github.com/google-gemini/gemini-cli/pull/18663)
- fix(core): complete MCP discovery when configured servers are skipped by
  @LyalinDotCom in
  [#18586](https://github.com/google-gemini/gemini-cli/pull/18586)
- fix(core): cache CLI version to ensure consistency during sessions by
  @sehoon38 in [#18793](https://github.com/google-gemini/gemini-cli/pull/18793)
- fix(cli): resolve double rendering in shpool and address vscode lint warnings
  by @braddux in
  [#18704](https://github.com/google-gemini/gemini-cli/pull/18704)
- feat(plan): document and validate Plan Mode policy overrides by @jerop in
  [#18825](https://github.com/google-gemini/gemini-cli/pull/18825)
- Fix pressing any key to exit select mode. by @jacob314 in
  [#18421](https://github.com/google-gemini/gemini-cli/pull/18421)
- fix(cli): update F12 behavior to only open drawer if browser fails by
  @SandyTao520 in
  [#18829](https://github.com/google-gemini/gemini-cli/pull/18829)
- feat(plan): allow skills to be enabled in plan mode by @Adib234 in
  [#18817](https://github.com/google-gemini/gemini-cli/pull/18817)
- docs(plan): add documentation for plan mode tools by @jerop in
  [#18827](https://github.com/google-gemini/gemini-cli/pull/18827)
- Remove experimental note in extension settings docs by @chrstnb in
  [#18822](https://github.com/google-gemini/gemini-cli/pull/18822)
- Update prompt and grep tool definition to limit context size by @gundermanc in
  [#18780](https://github.com/google-gemini/gemini-cli/pull/18780)
- docs(plan): add `ask_user` tool documentation by @jerop in
  [#18830](https://github.com/google-gemini/gemini-cli/pull/18830)
- Revert unintended credentials exposure by @Adib234 in
  [#18840](https://github.com/google-gemini/gemini-cli/pull/18840)
- feat(core): update internal utility models to Gemini 3 by @SandyTao520 in
  [#18773](https://github.com/google-gemini/gemini-cli/pull/18773)
- feat(a2a): add value-resolver for auth credential resolution by @adamfweidman
  in [#18653](https://github.com/google-gemini/gemini-cli/pull/18653)
- Removed getPlainTextLength by @devr0306 in
  [#18848](https://github.com/google-gemini/gemini-cli/pull/18848)
- More grep prompt tweaks by @gundermanc in
  [#18846](https://github.com/google-gemini/gemini-cli/pull/18846)
- refactor(cli): Reactive useSettingsStore hook by @psinha40898 in
  [#14915](https://github.com/google-gemini/gemini-cli/pull/14915)
- fix(mcp): Ensure that stdio MCP server execution has the `GEMINI_CLI=1` env
  variable populated. by @richieforeman in
  [#18832](https://github.com/google-gemini/gemini-cli/pull/18832)
- fix(core): improve headless mode detection for flags and query args by @galz10
  in [#18855](https://github.com/google-gemini/gemini-cli/pull/18855)
- refactor(cli): simplify UI and remove legacy inline tool confirmation logic by
  @abhipatel12 in
  [#18566](https://github.com/google-gemini/gemini-cli/pull/18566)
- feat(cli): deprecate --allowed-tools and excludeTools in favor of policy
  engine by @Abhijit-2592 in
  [#18508](https://github.com/google-gemini/gemini-cli/pull/18508)
- fix(workflows): improve maintainer detection for automated PR actions by
  @bdmorgan in [#18869](https://github.com/google-gemini/gemini-cli/pull/18869)
- refactor(cli): consolidate useToolScheduler and delete legacy implementation
  by @abhipatel12 in
  [#18567](https://github.com/google-gemini/gemini-cli/pull/18567)
- Update changelog for v0.28.0 and v0.29.0-preview0 by @g-samroberts in
  [#18819](https://github.com/google-gemini/gemini-cli/pull/18819)
- fix(core): ensure sub-agents are registered regardless of tools.allowed by
  @mattKorwel in
  [#18870](https://github.com/google-gemini/gemini-cli/pull/18870)
- Show notification when there's a conflict with an extensions command by
  @chrstnb in [#17890](https://github.com/google-gemini/gemini-cli/pull/17890)
- fix(cli): dismiss '?' shortcuts help on hotkeys and active states by
  @LyalinDotCom in
  [#18583](https://github.com/google-gemini/gemini-cli/pull/18583)
- fix(core): prioritize conditional policy rules and harden Plan Mode by
  @Abhijit-2592 in
  [#18882](https://github.com/google-gemini/gemini-cli/pull/18882)
- feat(core): refine Plan Mode system prompt for agentic execution by
  @NTaylorMullen in
  [#18799](https://github.com/google-gemini/gemini-cli/pull/18799)
- feat(plan): create metrics for usage of `AskUser` tool by @Adib234 in
  [#18820](https://github.com/google-gemini/gemini-cli/pull/18820)
- feat(cli): support Ctrl-Z suspension by @scidomino in
  [#18931](https://github.com/google-gemini/gemini-cli/pull/18931)
- fix(github-actions): use robot PAT for release creation to trigger release
  notes by @SandyTao520 in
  [#18794](https://github.com/google-gemini/gemini-cli/pull/18794)
- feat: add strict seatbelt profiles and remove unusable closed profiles by
  @SandyTao520 in
  [#18876](https://github.com/google-gemini/gemini-cli/pull/18876)
- chore: cleanup unused and add unlisted dependencies in packages/a2a-server by
  @adamfweidman in
  [#18916](https://github.com/google-gemini/gemini-cli/pull/18916)
- fix(plan): isolate plan files per session by @Adib234 in
  [#18757](https://github.com/google-gemini/gemini-cli/pull/18757)
- fix: character truncation in raw markdown mode by @jackwotherspoon in
  [#18938](https://github.com/google-gemini/gemini-cli/pull/18938)
- feat(cli): prototype clean UI toggle and minimal-mode bleed-through by
  @LyalinDotCom in
  [#18683](https://github.com/google-gemini/gemini-cli/pull/18683)
- ui(polish) blend background color with theme by @jacob314 in
  [#18802](https://github.com/google-gemini/gemini-cli/pull/18802)
- Add generic searchable list to back settings and extensions by @chrstnb in
  [#18838](https://github.com/google-gemini/gemini-cli/pull/18838)
- feat(ui): align `AskUser` color scheme with UX spec by @jerop in
  [#18943](https://github.com/google-gemini/gemini-cli/pull/18943)
- Hide AskUser tool validation errors from UI (agent self-corrects) by @jerop in
  [#18954](https://github.com/google-gemini/gemini-cli/pull/18954)
- bug(cli) fix flicker due to AppContainer continuous initialization by
  @jacob314 in [#18958](https://github.com/google-gemini/gemini-cli/pull/18958)
- feat(admin): Add admin controls documentation by @skeshive in
  [#18644](https://github.com/google-gemini/gemini-cli/pull/18644)
- feat(cli): disable ctrl-s shortcut outside of alternate buffer mode by
  @jacob314 in [#18887](https://github.com/google-gemini/gemini-cli/pull/18887)
- fix(vim): vim support that feels (more) complete by @ppgranger in
  [#18755](https://github.com/google-gemini/gemini-cli/pull/18755)
- feat(policy): add --policy flag for user defined policies by @allenhutchison
  in [#18500](https://github.com/google-gemini/gemini-cli/pull/18500)
- Update installation guide by @g-samroberts in
  [#18823](https://github.com/google-gemini/gemini-cli/pull/18823)
- refactor(core): centralize tool definitions (Group 1: replace, search, grep)
  by @aishaneeshah in
  [#18944](https://github.com/google-gemini/gemini-cli/pull/18944)
- refactor(cli): finalize event-driven transition and remove interaction bridge
  by @abhipatel12 in
  [#18569](https://github.com/google-gemini/gemini-cli/pull/18569)
- Fix drag and drop escaping by @scidomino in
  [#18965](https://github.com/google-gemini/gemini-cli/pull/18965)
- feat(sdk): initial package bootstrap for SDK by @mbleigh in
  [#18861](https://github.com/google-gemini/gemini-cli/pull/18861)
- feat(sdk): implements SessionContext for SDK tool calls by @mbleigh in
  [#18862](https://github.com/google-gemini/gemini-cli/pull/18862)
- fix(plan): make question type required in AskUser tool by @Adib234 in
  [#18959](https://github.com/google-gemini/gemini-cli/pull/18959)
- fix(core): ensure --yolo does not force headless mode by @NTaylorMullen in
  [#18976](https://github.com/google-gemini/gemini-cli/pull/18976)
- refactor(core): adopt `CoreToolCallStatus` enum for type safety by @jerop in
  [#18998](https://github.com/google-gemini/gemini-cli/pull/18998)
- Enable in-CLI extension management commands for team by @chrstnb in
  [#18957](https://github.com/google-gemini/gemini-cli/pull/18957)
- Adjust lint rules to avoid unnecessary warning. by @scidomino in
  [#18970](https://github.com/google-gemini/gemini-cli/pull/18970)
- fix(vscode): resolve unsafe type assertion lint errors by @ehedlund in
  [#19006](https://github.com/google-gemini/gemini-cli/pull/19006)
- Remove unnecessary eslint config file by @scidomino in
  [#19015](https://github.com/google-gemini/gemini-cli/pull/19015)
- fix(core): Prevent loop detection false positives on lists with long shared
  prefixes by @SandyTao520 in
  [#18975](https://github.com/google-gemini/gemini-cli/pull/18975)
- feat(core): fallback to chat-base when using unrecognized models for chat by
  @SandyTao520 in
  [#19016](https://github.com/google-gemini/gemini-cli/pull/19016)
- docs: fix inconsistent commandRegex example in policy engine by @NTaylorMullen
  in [#19027](https://github.com/google-gemini/gemini-cli/pull/19027)
- fix(plan): persist the approval mode in UI even when agent is thinking by
  @Adib234 in [#18955](https://github.com/google-gemini/gemini-cli/pull/18955)
- feat(sdk): Implement dynamic system instructions by @mbleigh in
  [#18863](https://github.com/google-gemini/gemini-cli/pull/18863)
- Docs: Refresh docs to organize and standardize reference materials. by
  @jkcinouye in [#18403](https://github.com/google-gemini/gemini-cli/pull/18403)
- fix windows escaping (and broken tests) by @scidomino in
  [#19011](https://github.com/google-gemini/gemini-cli/pull/19011)
- refactor: use `CoreToolCallStatus` in the the history data model by @jerop in
  [#19033](https://github.com/google-gemini/gemini-cli/pull/19033)
- feat(cleanup): enable 30-day session retention by default by @skeshive in
  [#18854](https://github.com/google-gemini/gemini-cli/pull/18854)
- feat(plan): hide plan write and edit operations on plans in Plan Mode by
  @jerop in [#19012](https://github.com/google-gemini/gemini-cli/pull/19012)
- bug(ui) fix flicker refreshing background color by @jacob314 in
  [#19041](https://github.com/google-gemini/gemini-cli/pull/19041)
- chore: fix dep vulnerabilities by @scidomino in
  [#19036](https://github.com/google-gemini/gemini-cli/pull/19036)
- Revamp automated changelog skill by @g-samroberts in
  [#18974](https://github.com/google-gemini/gemini-cli/pull/18974)
- feat(sdk): implement support for custom skills by @mbleigh in
  [#19031](https://github.com/google-gemini/gemini-cli/pull/19031)
- refactor(core): complete centralization of core tool definitions by
  @aishaneeshah in
  [#18991](https://github.com/google-gemini/gemini-cli/pull/18991)
- feat: add /commands reload to refresh custom TOML commands by @korade-krushna
  in [#19078](https://github.com/google-gemini/gemini-cli/pull/19078)
- fix(cli): wrap terminal capability queries in hidden sequence by @srithreepo
  in [#19080](https://github.com/google-gemini/gemini-cli/pull/19080)
- fix(workflows): fix GitHub App token permissions for maintainer detection by
  @bdmorgan in [#19139](https://github.com/google-gemini/gemini-cli/pull/19139)
- test: fix hook integration test flakiness on Windows CI by @NTaylorMullen in
  [#18665](https://github.com/google-gemini/gemini-cli/pull/18665)
- fix(core): Encourage non-interactive flags for scaffolding commands by
  @NTaylorMullen in
  [#18804](https://github.com/google-gemini/gemini-cli/pull/18804)
- fix(core): propagate User-Agent header to setup-phase CodeAssist API calls by
  @gsquared94 in
  [#19182](https://github.com/google-gemini/gemini-cli/pull/19182)
- docs: document .agents/skills alias and discovery precedence by @kevmoo in
  [#19166](https://github.com/google-gemini/gemini-cli/pull/19166)
- feat(cli): add loading state to new agents notification by @sehoon38 in
  [#19190](https://github.com/google-gemini/gemini-cli/pull/19190)
- Add base branch to workflow. by @g-samroberts in
  [#19189](https://github.com/google-gemini/gemini-cli/pull/19189)
- feat(cli): handle invalid model names in useQuotaAndFallback by @sehoon38 in
  [#19222](https://github.com/google-gemini/gemini-cli/pull/19222)
- docs: custom themes in extensions by @jackwotherspoon in
  [#19219](https://github.com/google-gemini/gemini-cli/pull/19219)
- Disable workspace settings when starting GCLI in the home directory. by
  @kevinjwang1 in
  [#19034](https://github.com/google-gemini/gemini-cli/pull/19034)
- feat(cli): refactor model command to support set and manage subcommands by
  @sehoon38 in [#19221](https://github.com/google-gemini/gemini-cli/pull/19221)
- Add refresh/reload aliases to slash command subcommands by @korade-krushna in
  [#19218](https://github.com/google-gemini/gemini-cli/pull/19218)
- refactor: consolidate development rules and add cli guidelines by @jacob314 in
  [#19214](https://github.com/google-gemini/gemini-cli/pull/19214)
- chore(ui): remove outdated tip about model routing by @sehoon38 in
  [#19226](https://github.com/google-gemini/gemini-cli/pull/19226)
- feat(core): support custom reasoning models by default by @NTaylorMullen in
  [#19227](https://github.com/google-gemini/gemini-cli/pull/19227)
- Add Solarized Dark and Solarized Light themes by @rmedranollamas in
  [#19064](https://github.com/google-gemini/gemini-cli/pull/19064)
- fix(telemetry): replace JSON.stringify with safeJsonStringify in file
  exporters by @gsquared94 in
  [#19244](https://github.com/google-gemini/gemini-cli/pull/19244)
- feat(telemetry): add keychain availability and token storage metrics by
  @abhipatel12 in
  [#18971](https://github.com/google-gemini/gemini-cli/pull/18971)
- feat(cli): update approval mode cycle order by @jerop in
  [#19254](https://github.com/google-gemini/gemini-cli/pull/19254)
- refactor(cli): code review cleanup fix for tab+tab by @jacob314 in
  [#18967](https://github.com/google-gemini/gemini-cli/pull/18967)
- feat(plan): support project exploration without planning when in plan mode by
  @Adib234 in [#18992](https://github.com/google-gemini/gemini-cli/pull/18992)
- feat: add role-specific statistics to telemetry and UI (cont. #15234) by
  @yunaseoul in [#18824](https://github.com/google-gemini/gemini-cli/pull/18824)
- feat(cli): remove Plan Mode from rotation when actively working by @jerop in
  [#19262](https://github.com/google-gemini/gemini-cli/pull/19262)
- Fix side breakage where anchors don't work in slugs. by @g-samroberts in
  [#19261](https://github.com/google-gemini/gemini-cli/pull/19261)
- feat(config): add setting to make directory tree context configurable by
  @kevin-ramdass in
  [#19053](https://github.com/google-gemini/gemini-cli/pull/19053)
- fix(acp): Wait for mcp initialization in acp (#18893) by @Mervap in
  [#18894](https://github.com/google-gemini/gemini-cli/pull/18894)
- docs: format UTC times in releases doc by @pavan-sh in
  [#18169](https://github.com/google-gemini/gemini-cli/pull/18169)
- Docs: Clarify extensions documentation. by @jkcinouye in
  [#19277](https://github.com/google-gemini/gemini-cli/pull/19277)
- refactor(core): modularize tool definitions by model family by @aishaneeshah
  in [#19269](https://github.com/google-gemini/gemini-cli/pull/19269)
- fix(paths): Add cross-platform path normalization by @spencer426 in
  [#18939](https://github.com/google-gemini/gemini-cli/pull/18939)
- feat(core): experimental in-progress steering hints (1 of 3) by @joshualitt in
  [#19008](https://github.com/google-gemini/gemini-cli/pull/19008)

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.29.0-preview.5...v0.30.0-preview.3
