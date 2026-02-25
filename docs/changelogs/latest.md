# Latest stable release: v0.29.0

Released: February 17, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Plan Mode:** Introduce a dedicated "Plan Mode" to help you architect complex
  changes before implementation. Use `/plan` to get started.
- **Gemini 3 by Default:** Gemini 3 is now the default model family, bringing
  improved performance and reasoning capabilities to all users without needing a
  feature flag.
- **Extension Discovery:** Easily discover and install extensions with the new
  exploration features and registry client.
- **Enhanced Admin Controls:** New administrative capabilities allow for
  allowlisting MCP server configurations, giving organizations more control over
  available tools.
- **Sub-agent Improvements:** Sub-agents have been transitioned to a new format
  with improved definitions and system prompts for better reliability.

## What's Changed

- fix: remove `ask_user` tool from non-interactive modes by @jackwotherspoon in
  [#18154](https://github.com/google-gemini/gemini-cli/pull/18154)
- fix(cli): allow restricted .env loading in untrusted sandboxed folders by
  @galz10 in [#17806](https://github.com/google-gemini/gemini-cli/pull/17806)
- Encourage agent to utilize ecosystem tools to perform work by @gundermanc in
  [#17881](https://github.com/google-gemini/gemini-cli/pull/17881)
- feat(plan): unify workflow location in system prompt to optimize caching by
  @jerop in [#18258](https://github.com/google-gemini/gemini-cli/pull/18258)
- feat(core): enable getUserTierName in config by @sehoon38 in
  [#18265](https://github.com/google-gemini/gemini-cli/pull/18265)
- feat(core): add default execution limits for subagents by @abhipatel12 in
  [#18274](https://github.com/google-gemini/gemini-cli/pull/18274)
- Fix issue where agent gets stuck at interactive commands. by @gundermanc in
  [#18272](https://github.com/google-gemini/gemini-cli/pull/18272)
- chore(release): bump version to 0.29.0-nightly.20260203.71f46f116 by
  @gemini-cli-robot in
  [#18243](https://github.com/google-gemini/gemini-cli/pull/18243)
- feat(core): remove hardcoded policy bypass for local subagents by @abhipatel12
  in [#18153](https://github.com/google-gemini/gemini-cli/pull/18153)
- feat(plan): implement `plan` slash command by @Adib234 in
  [#17698](https://github.com/google-gemini/gemini-cli/pull/17698)
- feat: increase `ask_user` label limit to 16 characters by @jackwotherspoon in
  [#18320](https://github.com/google-gemini/gemini-cli/pull/18320)
- Add information about the agent skills lifecycle and clarify docs-writer skill
  metadata. by @g-samroberts in
  [#18234](https://github.com/google-gemini/gemini-cli/pull/18234)
- feat(core): add `enter_plan_mode` tool by @jerop in
  [#18324](https://github.com/google-gemini/gemini-cli/pull/18324)
- Stop showing an error message in `/plan` by @Adib234 in
  [#18333](https://github.com/google-gemini/gemini-cli/pull/18333)
- fix(hooks): remove unnecessary logging for hook registration by @abhipatel12
  in [#18332](https://github.com/google-gemini/gemini-cli/pull/18332)
- fix(mcp): ensure MCP transport is closed to prevent memory leaks by
  @cbcoutinho in
  [#18054](https://github.com/google-gemini/gemini-cli/pull/18054)
- feat(skills): implement linking for agent skills by @MushuEE in
  [#18295](https://github.com/google-gemini/gemini-cli/pull/18295)
- Changelogs for 0.27.0 and 0.28.0-preview0 by @g-samroberts in
  [#18336](https://github.com/google-gemini/gemini-cli/pull/18336)
- chore: correct docs as skills and hooks are stable by @jackwotherspoon in
  [#18358](https://github.com/google-gemini/gemini-cli/pull/18358)
- feat(admin): Implement admin allowlist for MCP server configurations by
  @skeshive in [#18311](https://github.com/google-gemini/gemini-cli/pull/18311)
- fix(core): add retry logic for transient SSL/TLS errors (#17318) by @ppgranger
  in [#18310](https://github.com/google-gemini/gemini-cli/pull/18310)
- Add support for /extensions config command by @chrstnb in
  [#17895](https://github.com/google-gemini/gemini-cli/pull/17895)
- fix(core): handle non-compliant mcpbridge responses from Xcode 26.3 by
  @peterfriese in
  [#18376](https://github.com/google-gemini/gemini-cli/pull/18376)
- feat(cli): Add W, B, E Vim motions and operator support by @ademuri in
  [#16209](https://github.com/google-gemini/gemini-cli/pull/16209)
- fix: Windows Specific Agent Quality & System Prompt by @scidomino in
  [#18351](https://github.com/google-gemini/gemini-cli/pull/18351)
- feat(plan): support `replace` tool in plan mode to edit plans by @jerop in
  [#18379](https://github.com/google-gemini/gemini-cli/pull/18379)
- Improving memory tool instructions and eval testing by @alisa-alisa in
  [#18091](https://github.com/google-gemini/gemini-cli/pull/18091)
- fix(cli): color extension link success message green by @MushuEE in
  [#18386](https://github.com/google-gemini/gemini-cli/pull/18386)
- undo by @jacob314 in
  [#18147](https://github.com/google-gemini/gemini-cli/pull/18147)
- feat(plan): add guidance on iterating on approved plans vs creating new plans
  by @jerop in [#18346](https://github.com/google-gemini/gemini-cli/pull/18346)
- feat(plan): fix invalid tool calls in plan mode by @Adib234 in
  [#18352](https://github.com/google-gemini/gemini-cli/pull/18352)
- feat(plan): integrate planning artifacts and tools into primary workflows by
  @jerop in [#18375](https://github.com/google-gemini/gemini-cli/pull/18375)
- Fix permission check by @scidomino in
  [#18395](https://github.com/google-gemini/gemini-cli/pull/18395)
- ux(polish) autocomplete in the input prompt by @jacob314 in
  [#18181](https://github.com/google-gemini/gemini-cli/pull/18181)
- fix: resolve infinite loop when using 'Modify with external editor' by
  @ppgranger in [#17453](https://github.com/google-gemini/gemini-cli/pull/17453)
- feat: expand verify-release to macOS and Windows by @yunaseoul in
  [#18145](https://github.com/google-gemini/gemini-cli/pull/18145)
- feat(plan): implement support for MCP servers in Plan mode by @Adib234 in
  [#18229](https://github.com/google-gemini/gemini-cli/pull/18229)
- chore: update folder trust error messaging by @galz10 in
  [#18402](https://github.com/google-gemini/gemini-cli/pull/18402)
- feat(plan): create a metric for execution of plans generated in plan mode by
  @Adib234 in [#18236](https://github.com/google-gemini/gemini-cli/pull/18236)
- perf(ui): optimize stripUnsafeCharacters with regex by @gsquared94 in
  [#18413](https://github.com/google-gemini/gemini-cli/pull/18413)
- feat(context): implement observation masking for tool outputs by @abhipatel12
  in [#18389](https://github.com/google-gemini/gemini-cli/pull/18389)
- feat(core,cli): implement session-linked tool output storage and cleanup by
  @abhipatel12 in
  [#18416](https://github.com/google-gemini/gemini-cli/pull/18416)
- Shorten temp directory by @joshualitt in
  [#17901](https://github.com/google-gemini/gemini-cli/pull/17901)
- feat(plan): add behavioral evals for plan mode by @jerop in
  [#18437](https://github.com/google-gemini/gemini-cli/pull/18437)
- Add extension registry client by @chrstnb in
  [#18396](https://github.com/google-gemini/gemini-cli/pull/18396)
- Enable extension config by default by @chrstnb in
  [#18447](https://github.com/google-gemini/gemini-cli/pull/18447)
- Automatically generate change logs on release by @g-samroberts in
  [#18401](https://github.com/google-gemini/gemini-cli/pull/18401)
- Remove previewFeatures and default to Gemini 3 by @sehoon38 in
  [#18414](https://github.com/google-gemini/gemini-cli/pull/18414)
- feat(admin): apply MCP allowlist to extensions & gemini mcp list command by
  @skeshive in [#18442](https://github.com/google-gemini/gemini-cli/pull/18442)
- fix(cli): improve focus navigation for interactive and background shells by
  @galz10 in [#18343](https://github.com/google-gemini/gemini-cli/pull/18343)
- Add shortcuts hint and panel for discoverability by @LyalinDotCom in
  [#18035](https://github.com/google-gemini/gemini-cli/pull/18035)
- fix(config): treat system settings as read-only during migration and warn user
  by @spencer426 in
  [#18277](https://github.com/google-gemini/gemini-cli/pull/18277)
- feat(plan): add positive test case and update eval stability policy by @jerop
  in [#18457](https://github.com/google-gemini/gemini-cli/pull/18457)
- fix- windows: add shell: true for spawnSync to fix EINVAL with .cmd editors by
  @zackoch in [#18408](https://github.com/google-gemini/gemini-cli/pull/18408)
- bug(core): Fix bug when saving plans. by @joshualitt in
  [#18465](https://github.com/google-gemini/gemini-cli/pull/18465)
- Refactor atCommandProcessor by @scidomino in
  [#18461](https://github.com/google-gemini/gemini-cli/pull/18461)
- feat(core): implement persistence and resumption for masked tool outputs by
  @abhipatel12 in
  [#18451](https://github.com/google-gemini/gemini-cli/pull/18451)
- refactor: simplify tool output truncation to single config by @SandyTao520 in
  [#18446](https://github.com/google-gemini/gemini-cli/pull/18446)
- bug(core): Ensure storage is initialized early, even if config is not. by
  @joshualitt in
  [#18471](https://github.com/google-gemini/gemini-cli/pull/18471)
- chore: Update build-and-start script to support argument forwarding by
  @Abhijit-2592 in
  [#18241](https://github.com/google-gemini/gemini-cli/pull/18241)
- fix(core): prevent subagent bypass in plan mode by @jerop in
  [#18484](https://github.com/google-gemini/gemini-cli/pull/18484)
- feat(cli): add WebSocket-based network logging and streaming chunk support by
  @SandyTao520 in
  [#18383](https://github.com/google-gemini/gemini-cli/pull/18383)
- feat(cli): update approval modes UI by @jerop in
  [#18476](https://github.com/google-gemini/gemini-cli/pull/18476)
- fix(cli): reload skills and agents on extension restart by @NTaylorMullen in
  [#18411](https://github.com/google-gemini/gemini-cli/pull/18411)
- fix(core): expand excludeTools with legacy aliases for renamed tools by
  @SandyTao520 in
  [#18498](https://github.com/google-gemini/gemini-cli/pull/18498)
- feat(core): overhaul system prompt for rigor, integrity, and intent alignment
  by @NTaylorMullen in
  [#17263](https://github.com/google-gemini/gemini-cli/pull/17263)
- Patch for generate changelog docs yaml file by @g-samroberts in
  [#18496](https://github.com/google-gemini/gemini-cli/pull/18496)
- Code review fixes for show question mark pr. by @jacob314 in
  [#18480](https://github.com/google-gemini/gemini-cli/pull/18480)
- fix(cli): add SS3 Shift+Tab support for Windows terminals by @ThanhNguyxn in
  [#18187](https://github.com/google-gemini/gemini-cli/pull/18187)
- chore: remove redundant planning prompt from final shell by @jerop in
  [#18528](https://github.com/google-gemini/gemini-cli/pull/18528)
- docs: require pr-creator skill for PR generation by @NTaylorMullen in
  [#18536](https://github.com/google-gemini/gemini-cli/pull/18536)
- chore: update colors for ask_user dialog by @jackwotherspoon in
  [#18543](https://github.com/google-gemini/gemini-cli/pull/18543)
- feat(core): exempt high-signal tools from output masking by @abhipatel12 in
  [#18545](https://github.com/google-gemini/gemini-cli/pull/18545)
- refactor(core): remove memory tool instructions from Gemini 3 prompt by
  @NTaylorMullen in
  [#18559](https://github.com/google-gemini/gemini-cli/pull/18559)
- chore: remove feedback instruction from system prompt by @NTaylorMullen in
  [#18560](https://github.com/google-gemini/gemini-cli/pull/18560)
- feat(context): add remote configuration for tool output masking thresholds by
  @abhipatel12 in
  [#18553](https://github.com/google-gemini/gemini-cli/pull/18553)
- feat(core): pause agent timeout budget while waiting for tool confirmation by
  @abhipatel12 in
  [#18415](https://github.com/google-gemini/gemini-cli/pull/18415)
- refactor(config): remove experimental.enableEventDrivenScheduler setting by
  @abhipatel12 in
  [#17924](https://github.com/google-gemini/gemini-cli/pull/17924)
- feat(cli): truncate shell output in UI history and improve active shell
  display by @jwhelangoog in
  [#17438](https://github.com/google-gemini/gemini-cli/pull/17438)
- refactor(cli): switch useToolScheduler to event-driven engine by @abhipatel12
  in [#18565](https://github.com/google-gemini/gemini-cli/pull/18565)
- fix(core): correct escaped interpolation in system prompt by @NTaylorMullen in
  [#18557](https://github.com/google-gemini/gemini-cli/pull/18557)
- propagate abortSignal by @scidomino in
  [#18477](https://github.com/google-gemini/gemini-cli/pull/18477)
- feat(core): conditionally include ctrl+f prompt based on interactive shell
  setting by @NTaylorMullen in
  [#18561](https://github.com/google-gemini/gemini-cli/pull/18561)
- fix(core): ensure `enter_plan_mode` tool registration respects
  `experimental.plan` by @jerop in
  [#18587](https://github.com/google-gemini/gemini-cli/pull/18587)
- feat(core): transition sub-agents to XML format and improve definitions by
  @NTaylorMullen in
  [#18555](https://github.com/google-gemini/gemini-cli/pull/18555)
- docs: Add Plan Mode documentation by @jerop in
  [#18582](https://github.com/google-gemini/gemini-cli/pull/18582)
- chore: strengthen validation guidance in system prompt by @NTaylorMullen in
  [#18544](https://github.com/google-gemini/gemini-cli/pull/18544)
- Fix newline insertion bug in replace tool by @werdnum in
  [#18595](https://github.com/google-gemini/gemini-cli/pull/18595)
- fix(evals): update save_memory evals and simplify tool description by
  @NTaylorMullen in
  [#18610](https://github.com/google-gemini/gemini-cli/pull/18610)
- chore(evals): update validation_fidelity_pre_existing_errors to USUALLY_PASSES
  by @NTaylorMullen in
  [#18617](https://github.com/google-gemini/gemini-cli/pull/18617)
- fix: shorten tool call IDs and fix duplicate tool name in truncated output
  filenames by @SandyTao520 in
  [#18600](https://github.com/google-gemini/gemini-cli/pull/18600)
- feat(cli): implement atomic writes and safety checks for trusted folders by
  @galz10 in [#18406](https://github.com/google-gemini/gemini-cli/pull/18406)
- Remove relative docs links by @chrstnb in
  [#18650](https://github.com/google-gemini/gemini-cli/pull/18650)
- docs: add legacy snippets convention to GEMINI.md by @NTaylorMullen in
  [#18597](https://github.com/google-gemini/gemini-cli/pull/18597)
- fix(chore): Support linting for cjs by @aswinashok44 in
  [#18639](https://github.com/google-gemini/gemini-cli/pull/18639)
- feat: move shell efficiency guidelines to tool description by @NTaylorMullen
  in [#18614](https://github.com/google-gemini/gemini-cli/pull/18614)
- Added "" as default value, since getText() used to expect a string only and
  thus crashed when undefined... Fixes #18076 by @019-Abhi in
  [#18099](https://github.com/google-gemini/gemini-cli/pull/18099)
- Allow @-includes outside of workspaces (with permission) by @scidomino in
  [#18470](https://github.com/google-gemini/gemini-cli/pull/18470)
- chore: make `ask_user` header description more clear by @jackwotherspoon in
  [#18657](https://github.com/google-gemini/gemini-cli/pull/18657)
- refactor(core): model-dependent tool definitions by @aishaneeshah in
  [#18563](https://github.com/google-gemini/gemini-cli/pull/18563)
- Harded code assist converter. by @jacob314 in
  [#18656](https://github.com/google-gemini/gemini-cli/pull/18656)
- bug(core): Fix minor bug in migration logic. by @joshualitt in
  [#18661](https://github.com/google-gemini/gemini-cli/pull/18661)
- feat: enable plan mode experiment in settings by @jerop in
  [#18636](https://github.com/google-gemini/gemini-cli/pull/18636)
- refactor: push isValidPath() into parsePastedPaths() by @scidomino in
  [#18664](https://github.com/google-gemini/gemini-cli/pull/18664)
- fix(cli): correct 'esc to cancel' position and restore duration display by
  @NTaylorMullen in
  [#18534](https://github.com/google-gemini/gemini-cli/pull/18534)
- feat(cli): add DevTools integration with gemini-cli-devtools by @SandyTao520
  in [#18648](https://github.com/google-gemini/gemini-cli/pull/18648)
- chore: remove unused exports and redundant hook files by @SandyTao520 in
  [#18681](https://github.com/google-gemini/gemini-cli/pull/18681)
- Fix number of lines being reported in rewind confirmation dialog by @Adib234
  in [#18675](https://github.com/google-gemini/gemini-cli/pull/18675)
- feat(cli): disable folder trust in headless mode by @galz10 in
  [#18407](https://github.com/google-gemini/gemini-cli/pull/18407)
- Disallow unsafe type assertions by @gundermanc in
  [#18688](https://github.com/google-gemini/gemini-cli/pull/18688)
- Change event type for release by @g-samroberts in
  [#18693](https://github.com/google-gemini/gemini-cli/pull/18693)
- feat: handle multiple dynamic context filenames in system prompt by
  @NTaylorMullen in
  [#18598](https://github.com/google-gemini/gemini-cli/pull/18598)
- Properly parse at-commands with narrow non-breaking spaces by @scidomino in
  [#18677](https://github.com/google-gemini/gemini-cli/pull/18677)
- refactor(core): centralize core tool definitions and support model-specific
  schemas by @aishaneeshah in
  [#18662](https://github.com/google-gemini/gemini-cli/pull/18662)
- feat(core): Render memory hierarchically in context. by @joshualitt in
  [#18350](https://github.com/google-gemini/gemini-cli/pull/18350)
- feat: Ctrl+O to expand paste placeholder by @jackwotherspoon in
  [#18103](https://github.com/google-gemini/gemini-cli/pull/18103)
- fix(cli): Improve header spacing by @NTaylorMullen in
  [#18531](https://github.com/google-gemini/gemini-cli/pull/18531)
- Feature/quota visibility 16795 by @spencer426 in
  [#18203](https://github.com/google-gemini/gemini-cli/pull/18203)
- Inline thinking bubbles with summary/full modes by @LyalinDotCom in
  [#18033](https://github.com/google-gemini/gemini-cli/pull/18033)
- docs: remove TOC marker from Plan Mode header by @jerop in
  [#18678](https://github.com/google-gemini/gemini-cli/pull/18678)
- fix(ui): remove redundant newlines in Gemini messages by @NTaylorMullen in
  [#18538](https://github.com/google-gemini/gemini-cli/pull/18538)
- test(cli): fix AppContainer act() warnings and improve waitFor resilience by
  @NTaylorMullen in
  [#18676](https://github.com/google-gemini/gemini-cli/pull/18676)
- refactor(core): refine Security & System Integrity section in system prompt by
  @NTaylorMullen in
  [#18601](https://github.com/google-gemini/gemini-cli/pull/18601)
- Fix layout rounding. by @gundermanc in
  [#18667](https://github.com/google-gemini/gemini-cli/pull/18667)
- docs(skills): enhance pr-creator safety and interactivity by @NTaylorMullen in
  [#18616](https://github.com/google-gemini/gemini-cli/pull/18616)
- test(core): remove hardcoded model from TestRig by @NTaylorMullen in
  [#18710](https://github.com/google-gemini/gemini-cli/pull/18710)
- feat(core): optimize sub-agents system prompt intro by @NTaylorMullen in
  [#18608](https://github.com/google-gemini/gemini-cli/pull/18608)
- feat(cli): update approval mode labels and shortcuts per latest UX spec by
  @jerop in [#18698](https://github.com/google-gemini/gemini-cli/pull/18698)
- fix(plan): update persistent approval mode setting by @Adib234 in
  [#18638](https://github.com/google-gemini/gemini-cli/pull/18638)
- fix: move toasts location to left side by @jackwotherspoon in
  [#18705](https://github.com/google-gemini/gemini-cli/pull/18705)
- feat(routing): restrict numerical routing to Gemini 3 family by @mattKorwel in
  [#18478](https://github.com/google-gemini/gemini-cli/pull/18478)
- fix(ide): fix ide nudge setting by @skeshive in
  [#18733](https://github.com/google-gemini/gemini-cli/pull/18733)
- fix(core): standardize tool formatting in system prompts by @NTaylorMullen in
  [#18615](https://github.com/google-gemini/gemini-cli/pull/18615)
- chore: consolidate to green in ask user dialog by @jackwotherspoon in
  [#18734](https://github.com/google-gemini/gemini-cli/pull/18734)
- feat: add `extensionsExplore` setting to enable extensions explore UI. by
  @sripasg in [#18686](https://github.com/google-gemini/gemini-cli/pull/18686)
- feat(cli): defer devtools startup and integrate with F12 by @SandyTao520 in
  [#18695](https://github.com/google-gemini/gemini-cli/pull/18695)
- ui: update & subdue footer colors and animate progress indicator by
  @keithguerin in
  [#18570](https://github.com/google-gemini/gemini-cli/pull/18570)
- test: add model-specific snapshots for coreTools by @aishaneeshah in
  [#18707](https://github.com/google-gemini/gemini-cli/pull/18707)
- ci: shard windows tests and fix event listener leaks by @NTaylorMullen in
  [#18670](https://github.com/google-gemini/gemini-cli/pull/18670)
- fix: allow `ask_user` tool in yolo mode by @jackwotherspoon in
  [#18541](https://github.com/google-gemini/gemini-cli/pull/18541)
- feat: redact disabled tools from system prompt (#13597) by @NTaylorMullen in
  [#18613](https://github.com/google-gemini/gemini-cli/pull/18613)
- Update Gemini.md to use the curent year on creating new files by @sehoon38 in
  [#18460](https://github.com/google-gemini/gemini-cli/pull/18460)
- Code review cleanup for thinking display by @jacob314 in
  [#18720](https://github.com/google-gemini/gemini-cli/pull/18720)
- fix(cli): hide scrollbars when in alternate buffer copy mode by @werdnum in
  [#18354](https://github.com/google-gemini/gemini-cli/pull/18354)
- Fix issues with rip grep by @gundermanc in
  [#18756](https://github.com/google-gemini/gemini-cli/pull/18756)
- fix(cli): fix history navigation regression after prompt autocomplete by
  @sehoon38 in [#18752](https://github.com/google-gemini/gemini-cli/pull/18752)
- chore: cleanup unused and add unlisted dependencies in packages/cli by
  @adamfweidman in
  [#18749](https://github.com/google-gemini/gemini-cli/pull/18749)
- Fix issue where Gemini CLI creates tests in a new file by @gundermanc in
  [#18409](https://github.com/google-gemini/gemini-cli/pull/18409)
- feat(telemetry): Ensure experiment IDs are included in OpenTelemetry logs by
  @kevin-ramdass in
  [#18747](https://github.com/google-gemini/gemini-cli/pull/18747)
- fix(patch): cherry-pick e9a9474 to release/v0.29.0-preview.0-pr-18840 to patch
  version v0.29.0-preview.0 and create version 0.29.0-preview.1 by
  @gemini-cli-robot in
  [#18841](https://github.com/google-gemini/gemini-cli/pull/18841)
- fix(patch): cherry-pick 08e8eea to release/v0.29.0-preview.1-pr-18855 to patch
  version v0.29.0-preview.1 and create version 0.29.0-preview.2 by
  @gemini-cli-robot in
  [#18905](https://github.com/google-gemini/gemini-cli/pull/18905)
- fix(patch): cherry-pick d0c6a56 to release/v0.29.0-preview.2-pr-18976 to patch
  version v0.29.0-preview.2 and create version 0.29.0-preview.3 by
  @gemini-cli-robot in
  [#19023](https://github.com/google-gemini/gemini-cli/pull/19023)
- fix(patch): cherry-pick e5ff202 to release/v0.29.0-preview.3-pr-19254 to patch
  version v0.29.0-preview.3 and create version 0.29.0-preview.4 by
  @gemini-cli-robot in
  [#19264](https://github.com/google-gemini/gemini-cli/pull/19264)
- fix(patch): cherry-pick 9590a09 to release/v0.29.0-preview.4-pr-18771 to patch
  version v0.29.0-preview.4 and create version 0.29.0-preview.5 by
  @gemini-cli-robot in
  [#19274](https://github.com/google-gemini/gemini-cli/pull/19274)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.28.2...v0.29.0
