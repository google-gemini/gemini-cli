# Latest stable release: v0.27.0

Released: February 3, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Event-Driven Architecture:** The CLI now uses an event-driven scheduler for
  tool execution, improving performance and responsiveness. This includes
  migrating non-interactive flows and sub-agents to the new scheduler.
- **Enhanced User Experience:** This release introduces several UI/UX
  improvements, including queued tool confirmations and the ability to expand
  and collapse large pasted text blocks. The `Settings` dialog has been improved
  to reduce jitter and preserve focus.
- **Agent and Skill Improvements:** Agent Skills have been promoted to a stable
  feature. Sub-agents now use a JSON schema for input and are tracked by an
  `AgentRegistry`.
- **New `/rewind` Command:** A new `/rewind` command has been implemented to
  allow users to go back in their session history.
- **Improved Shell and File Handling:** The shell tool's output format has been
  optimized, and the CLI now gracefully handles disk-full errors during chat
  recording. A bug in detecting already added paths has been fixed.
- **Linux Clipboard Support:** Image pasting capabilities for Wayland and X11 on
  Linux have been added.

## What's Changed

- remove fireAgent and beforeAgent hook by @ishaanxgupta in
  [#16919](https://github.com/google-gemini/gemini-cli/pull/16919)
- Remove unused modelHooks and toolHooks by @ved015 in
  [#17115](https://github.com/google-gemini/gemini-cli/pull/17115)
- feat(cli): sanitize ANSI escape sequences in non-interactive output by
  @sehoon38 in [#17172](https://github.com/google-gemini/gemini-cli/pull/17172)
- Update Attempt text to Retry when showing the retry happening to the … by
  @sehoon38 in [#17178](https://github.com/google-gemini/gemini-cli/pull/17178)
- chore(skills): update pr-creator skill workflow by @sehoon38 in
  [#17180](https://github.com/google-gemini/gemini-cli/pull/17180)
- feat(cli): implement event-driven tool execution scheduler by @abhipatel12 in
  [#17078](https://github.com/google-gemini/gemini-cli/pull/17078)
- chore(release): bump version to 0.27.0-nightly.20260121.97aac696f by
  @gemini-cli-robot in
  [#17181](https://github.com/google-gemini/gemini-cli/pull/17181)
- Remove other rewind reference in docs by @chrstnb in
  [#17149](https://github.com/google-gemini/gemini-cli/pull/17149)
- feat(skills): add code-reviewer skill by @sehoon38 in
  [#17187](https://github.com/google-gemini/gemini-cli/pull/17187)
- feat(plan): Extend Shift+Tab Mode Cycling to include Plan Mode by @Adib234 in
  [#17177](https://github.com/google-gemini/gemini-cli/pull/17177)
- feat(plan): refactor TestRig and eval helper to support configurable approval
  modes by @jerop in
  [#17171](https://github.com/google-gemini/gemini-cli/pull/17171)
- feat(workflows): support recursive workstream labeling and new IDs by
  @bdmorgan in [#17207](https://github.com/google-gemini/gemini-cli/pull/17207)
- Run evals for all models. by @gundermanc in
  [#17123](https://github.com/google-gemini/gemini-cli/pull/17123)
- fix(github): improve label-workstream-rollup efficiency with GraphQL by
  @bdmorgan in [#17217](https://github.com/google-gemini/gemini-cli/pull/17217)
- Docs: Update changelogs for v.0.25.0 and v0.26.0-preview.0 releases. by
  @g-samroberts in
  [#17215](https://github.com/google-gemini/gemini-cli/pull/17215)
- Migrate beforeTool and afterTool hooks to hookSystem by @ved015 in
  [#17204](https://github.com/google-gemini/gemini-cli/pull/17204)
- fix(github): improve label-workstream-rollup efficiency and fix bugs by
  @bdmorgan in [#17219](https://github.com/google-gemini/gemini-cli/pull/17219)
- feat(cli): improve skill enablement/disablement verbiage by @NTaylorMullen in
  [#17192](https://github.com/google-gemini/gemini-cli/pull/17192)
- fix(admin): Ensure CLI commands run in non-interactive mode by @skeshive in
  [#17218](https://github.com/google-gemini/gemini-cli/pull/17218)
- feat(core): support dynamic variable substitution in system prompt override by
  @NTaylorMullen in
  [#17042](https://github.com/google-gemini/gemini-cli/pull/17042)
- fix(core,cli): enable recursive directory access for by @galz10 in
  [#17094](https://github.com/google-gemini/gemini-cli/pull/17094)
- Docs: Marking for experimental features by @jkcinouye in
  [#16760](https://github.com/google-gemini/gemini-cli/pull/16760)
- Support command/ctrl/alt backspace correctly by @scidomino in
  [#17175](https://github.com/google-gemini/gemini-cli/pull/17175)
- feat(plan): add approval mode instructions to system prompt by @jerop in
  [#17151](https://github.com/google-gemini/gemini-cli/pull/17151)
- feat(core): enable disableLLMCorrection by default by @SandyTao520 in
  [#17223](https://github.com/google-gemini/gemini-cli/pull/17223)
- Remove unused slug from sidebar by @chrstnb in
  [#17229](https://github.com/google-gemini/gemini-cli/pull/17229)
- drain stdin on exit by @scidomino in
  [#17241](https://github.com/google-gemini/gemini-cli/pull/17241)
- refactor(cli): decouple UI from live tool execution via ToolActionsContext by
  @abhipatel12 in
  [#17183](https://github.com/google-gemini/gemini-cli/pull/17183)
- fix(core): update token count and telemetry on /chat resume history load by
  @psinha40898 in
  [#16279](https://github.com/google-gemini/gemini-cli/pull/16279)
- fix: /policy to display policies according to mode by @ishaanxgupta in
  [#16772](https://github.com/google-gemini/gemini-cli/pull/16772)
- fix(core): simplify replace tool error message by @SandyTao520 in
  [#17246](https://github.com/google-gemini/gemini-cli/pull/17246)
- feat(cli): consolidate shell inactivity and redirection monitoring by
  @NTaylorMullen in
  [#17086](https://github.com/google-gemini/gemini-cli/pull/17086)
- fix(scheduler): prevent stale tool re-publication and fix stuck UI state by
  @abhipatel12 in
  [#17227](https://github.com/google-gemini/gemini-cli/pull/17227)
- feat(config): default enableEventDrivenScheduler to true by @abhipatel12 in
  [#17211](https://github.com/google-gemini/gemini-cli/pull/17211)
- feat(hooks): enable hooks system by default by @abhipatel12 in
  [#17247](https://github.com/google-gemini/gemini-cli/pull/17247)
- feat(core): Enable AgentRegistry to track all discovered subagents by
  @SandyTao520 in
  [#17253](https://github.com/google-gemini/gemini-cli/pull/17253)
- feat(core): Have subagents use a JSON schema type for input. by @joshualitt in
  [#17152](https://github.com/google-gemini/gemini-cli/pull/17152)
- feat: replace large text pastes with [Pasted Text: X lines] placeholder by
  @jackwotherspoon in
  [#16422](https://github.com/google-gemini/gemini-cli/pull/16422)
- security(hooks): Wrap hook-injected context in distinct XML tags by @yunaseoul
  in [#17237](https://github.com/google-gemini/gemini-cli/pull/17237)
- Enable the ability to queue specific nightly eval tests by @gundermanc in
  [#17262](https://github.com/google-gemini/gemini-cli/pull/17262)
- docs(hooks): comprehensive update of hook documentation and specs by
  @abhipatel12 in
  [#16816](https://github.com/google-gemini/gemini-cli/pull/16816)
- refactor: improve large text paste placeholder by @jacob314 in
  [#17269](https://github.com/google-gemini/gemini-cli/pull/17269)
- feat: implement /rewind command by @Adib234 in
  [#15720](https://github.com/google-gemini/gemini-cli/pull/15720)
- Feature/jetbrains ide detection by @SoLoHiC in
  [#16243](https://github.com/google-gemini/gemini-cli/pull/16243)
- docs: update typo in mcp-server.md file by @schifferl in
  [#17099](https://github.com/google-gemini/gemini-cli/pull/17099)
- Sanitize command names and descriptions by @ehedlund in
  [#17228](https://github.com/google-gemini/gemini-cli/pull/17228)
- fix(auth): don't crash when initial auth fails by @skeshive in
  [#17308](https://github.com/google-gemini/gemini-cli/pull/17308)
- Added image pasting capabilities for Wayland and X11 on Linux by @devr0306 in
  [#17144](https://github.com/google-gemini/gemini-cli/pull/17144)
- feat: add AskUser tool schema by @jackwotherspoon in
  [#16988](https://github.com/google-gemini/gemini-cli/pull/16988)
- fix cli settings: resolve layout jitter in settings bar by @Mag1ck in
  [#16256](https://github.com/google-gemini/gemini-cli/pull/16256)
- fix: show whitespace changes in edit tool diffs by @Ujjiyara in
  [#17213](https://github.com/google-gemini/gemini-cli/pull/17213)
- Remove redundant calls setting linuxClipboardTool. getUserLinuxClipboardTool()
  now handles the caching internally by @jacob314 in
  [#17320](https://github.com/google-gemini/gemini-cli/pull/17320)
- ci: allow failure in evals-nightly run step by @gundermanc in
  [#17319](https://github.com/google-gemini/gemini-cli/pull/17319)
- feat(cli): Add state management and plumbing for agent configuration dialog by
  @SandyTao520 in
  [#17259](https://github.com/google-gemini/gemini-cli/pull/17259)
- bug: fix ide-client connection to ide-companion when inside docker via
  ssh/devcontainer by @kapsner in
  [#15049](https://github.com/google-gemini/gemini-cli/pull/15049)
- Emit correct newline type return by @scidomino in
  [#17331](https://github.com/google-gemini/gemini-cli/pull/17331)
- New skill: docs-writer by @g-samroberts in
  [#17268](https://github.com/google-gemini/gemini-cli/pull/17268)
- fix(core): Resolve AbortSignal MaxListenersExceededWarning (#5950) by
  @spencer426 in
  [#16735](https://github.com/google-gemini/gemini-cli/pull/16735)
- Disable tips after 10 runs by @Adib234 in
  [#17101](https://github.com/google-gemini/gemini-cli/pull/17101)
- Fix so rewind starts at the bottom and loadHistory refreshes static content.
  by @jacob314 in
  [#17335](https://github.com/google-gemini/gemini-cli/pull/17335)
- feat(core): Remove legacy settings. by @joshualitt in
  [#17244](https://github.com/google-gemini/gemini-cli/pull/17244)
- feat(plan): add 'communicate' tool kind by @jerop in
  [#17341](https://github.com/google-gemini/gemini-cli/pull/17341)
- feat(routing): A/B Test Numerical Complexity Scoring for Gemini 3 by
  @mattKorwel in
  [#16041](https://github.com/google-gemini/gemini-cli/pull/16041)
- feat(plan): update UI Theme for Plan Mode by @Adib234 in
  [#17243](https://github.com/google-gemini/gemini-cli/pull/17243)
- fix(ui): stabilize rendering during terminal resize in alternate buffer by
  @lkk214 in [#15783](https://github.com/google-gemini/gemini-cli/pull/15783)
- feat(cli): add /agents config command and improve agent discovery by
  @SandyTao520 in
  [#17342](https://github.com/google-gemini/gemini-cli/pull/17342)
- feat(mcp): add enable/disable commands for MCP servers (#11057) by @jasmeetsb
  in [#16299](https://github.com/google-gemini/gemini-cli/pull/16299)
- fix(cli)!: Default to interactive mode for positional arguments by
  @ishaanxgupta in
  [#16329](https://github.com/google-gemini/gemini-cli/pull/16329)
- Fix issue #17080 by @jacob314 in
  [#17100](https://github.com/google-gemini/gemini-cli/pull/17100)
- feat(core): Refresh agents after loading an extension. by @joshualitt in
  [#17355](https://github.com/google-gemini/gemini-cli/pull/17355)
- fix(cli): include source in policy rule display by @allenhutchison in
  [#17358](https://github.com/google-gemini/gemini-cli/pull/17358)
- fix: remove obsolete CloudCode PerDay quota and 120s terminal threshold by
  @gsquared94 in
  [#17236](https://github.com/google-gemini/gemini-cli/pull/17236)
- Refactor subagent delegation to be one tool per agent by @gundermanc in
  [#17346](https://github.com/google-gemini/gemini-cli/pull/17346)
- fix(core): Include MCP server name in OAuth message by @jerop in
  [#17351](https://github.com/google-gemini/gemini-cli/pull/17351)
- Fix pr-triage.sh script to update pull requests with tags "help wanted" and
  "maintainer only" by @jacob314 in
  [#17324](https://github.com/google-gemini/gemini-cli/pull/17324)
- feat(plan): implement simple workflow for planning in main agent by @jerop in
  [#17326](https://github.com/google-gemini/gemini-cli/pull/17326)
- fix: exit with non-zero code when esbuild is missing by @yuvrajangadsingh in
  [#16967](https://github.com/google-gemini/gemini-cli/pull/16967)
- fix: ensure @docs/cli/custom-commands.md UI message ordering and test by
  @medic-code in
  [#12038](https://github.com/google-gemini/gemini-cli/pull/12038)
- fix(core): add alternative command names for Antigravity editor detec… by
  @baeseokjae in
  [#16829](https://github.com/google-gemini/gemini-cli/pull/16829)
- Refactor: Migrate CLI appEvents to Core coreEvents by @Adib234 in
  [#15737](https://github.com/google-gemini/gemini-cli/pull/15737)
- fix(core): await MCP initialization in non-interactive mode by @Ratish1 in
  [#17390](https://github.com/google-gemini/gemini-cli/pull/17390)
- Fix modifyOtherKeys enablement on unsupported terminals by @seekskyworld in
  [#16714](https://github.com/google-gemini/gemini-cli/pull/16714)
- fix(core): gracefully handle disk full errors in chat recording by
  @godwiniheuwa in
  [#17305](https://github.com/google-gemini/gemini-cli/pull/17305)
- fix(oauth): update oauth to use 127.0.0.1 instead of localhost by @skeshive in
  [#17388](https://github.com/google-gemini/gemini-cli/pull/17388)
- fix(core): use RFC 9728 compliant path-based OAuth protected resource
  discovery by @vrv in
  [#15756](https://github.com/google-gemini/gemini-cli/pull/15756)
- Update Code Wiki README badge by @PatoBeltran in
  [#15229](https://github.com/google-gemini/gemini-cli/pull/15229)
- Add conda installation instructions for Gemini CLI by @ishaanxgupta in
  [#16921](https://github.com/google-gemini/gemini-cli/pull/16921)
- chore(refactor): extract BaseSettingsDialog component by @SandyTao520 in
  [#17369](https://github.com/google-gemini/gemini-cli/pull/17369)
- fix(cli): preserve input text when declining tool approval (#15624) by
  @ManojINaik in
  [#15659](https://github.com/google-gemini/gemini-cli/pull/15659)
- chore: upgrade dep: diff 7.0.0-> 8.0.3 by @scidomino in
  [#17403](https://github.com/google-gemini/gemini-cli/pull/17403)
- feat: add AskUserDialog for UI component of AskUser tool by @jackwotherspoon
  in [#17344](https://github.com/google-gemini/gemini-cli/pull/17344)
- feat(ui): display user tier in about command by @sehoon38 in
  [#17400](https://github.com/google-gemini/gemini-cli/pull/17400)
- feat: add clearContext to AfterAgent hooks by @jackwotherspoon in
  [#16574](https://github.com/google-gemini/gemini-cli/pull/16574)
- fix(cli): change image paste location to global temp directory (#17396) by
  @devr0306 in [#17396](https://github.com/google-gemini/gemini-cli/pull/17396)
- Fix line endings issue with Notice file by @scidomino in
  [#17417](https://github.com/google-gemini/gemini-cli/pull/17417)
- feat(plan): implement persistent approvalMode setting by @Adib234 in
  [#17350](https://github.com/google-gemini/gemini-cli/pull/17350)
- feat(ui): Move keyboard handling into BaseSettingsDialog by @SandyTao520 in
  [#17404](https://github.com/google-gemini/gemini-cli/pull/17404)
- Allow prompt queueing during MCP initialization by @Adib234 in
  [#17395](https://github.com/google-gemini/gemini-cli/pull/17395)
- feat: implement AgentConfigDialog for /agents config command by @SandyTao520
  in [#17370](https://github.com/google-gemini/gemini-cli/pull/17370)
- fix(agents): default to all tools when tool list is omitted in subagents by
  @gundermanc in
  [#17422](https://github.com/google-gemini/gemini-cli/pull/17422)
- feat(cli): Moves tool confirmations to a queue UX by @abhipatel12 in
  [#17276](https://github.com/google-gemini/gemini-cli/pull/17276)
- fix(core): hide user tier name by @sehoon38 in
  [#17418](https://github.com/google-gemini/gemini-cli/pull/17418)
- feat: Enforce unified folder trust for /directory add by @galz10 in
  [#17359](https://github.com/google-gemini/gemini-cli/pull/17359)
- migrate fireToolNotificationHook to hookSystem by @ved015 in
  [#17398](https://github.com/google-gemini/gemini-cli/pull/17398)
- Clean up dead code by @scidomino in
  [#17443](https://github.com/google-gemini/gemini-cli/pull/17443)
- feat(workflow): add stale pull request closer with linked-issue enforcement by
  @bdmorgan in [#17449](https://github.com/google-gemini/gemini-cli/pull/17449)
- feat(workflow): expand stale-exempt labels to include help wanted and Public
  Roadmap by @bdmorgan in
  [#17459](https://github.com/google-gemini/gemini-cli/pull/17459)
- chore(workflow): remove redundant label-enforcer workflow by @bdmorgan in
  [#17460](https://github.com/google-gemini/gemini-cli/pull/17460)
- Resolves the confusing error message `ripgrep exited with code null that
  occurs when a search operation is cancelled or aborted by @maximmasiutin in
  [#14267](https://github.com/google-gemini/gemini-cli/pull/14267)
- fix: detect pnpm/pnpx in ~/.local by @rwakulszowa in
  [#15254](https://github.com/google-gemini/gemini-cli/pull/15254)
- docs: Add instructions for MacPorts and uninstall instructions for Homebrew by
  @breun in [#17412](https://github.com/google-gemini/gemini-cli/pull/17412)
- docs(hooks): clarify mandatory 'type' field and update hook schema
  documentation by @abhipatel12 in
  [#17499](https://github.com/google-gemini/gemini-cli/pull/17499)
- Improve error messages on failed onboarding by @gsquared94 in
  [#17357](https://github.com/google-gemini/gemini-cli/pull/17357)
- Follow up to "enableInteractiveShell for external tooling relying on a2a
  server" by @DavidAPierce in
  [#17130](https://github.com/google-gemini/gemini-cli/pull/17130)
- Fix/issue 17070 by @alih552 in
  [#17242](https://github.com/google-gemini/gemini-cli/pull/17242)
- fix(core): handle URI-encoded workspace paths in IdeClient by @dong-jun-shin
  in [#17476](https://github.com/google-gemini/gemini-cli/pull/17476)
- feat(cli): add quick clear input shortcuts in vim mode by @harshanadim in
  [#17470](https://github.com/google-gemini/gemini-cli/pull/17470)
- feat(core): optimize shell tool llmContent output format by @SandyTao520 in
  [#17538](https://github.com/google-gemini/gemini-cli/pull/17538)
- Fix bug in detecting already added paths. by @jacob314 in
  [#17430](https://github.com/google-gemini/gemini-cli/pull/17430)
- feat(scheduler): support multi-scheduler tool aggregation and nested call IDs
  by @abhipatel12 in
  [#17429](https://github.com/google-gemini/gemini-cli/pull/17429)
- feat(agents): implement first-run experience for project-level sub-agents by
  @gundermanc in
  [#17266](https://github.com/google-gemini/gemini-cli/pull/17266)
- Update extensions docs by @chrstnb in
  [#16093](https://github.com/google-gemini/gemini-cli/pull/16093)
- Docs: Refactor left nav on the website by @jkcinouye in
  [#17558](https://github.com/google-gemini/gemini-cli/pull/17558)
- fix(core): stream grep/ripgrep output to prevent OOM by @adamfweidman in
  [#17146](https://github.com/google-gemini/gemini-cli/pull/17146)
- feat(plan): add persistent plan file storage by @jerop in
  [#17563](https://github.com/google-gemini/gemini-cli/pull/17563)
- feat(agents): migrate subagents to event-driven scheduler by @abhipatel12 in
  [#17567](https://github.com/google-gemini/gemini-cli/pull/17567)
- Fix extensions config error by @chrstnb in
  [#17580](https://github.com/google-gemini/gemini-cli/pull/17580)
- fix(plan): remove subagent invocation from plan mode by @jerop in
  [#17593](https://github.com/google-gemini/gemini-cli/pull/17593)
- feat(ui): add solid background color option for input prompt by @jacob314 in
  [#16563](https://github.com/google-gemini/gemini-cli/pull/16563)
- feat(plan): refresh system prompt when approval mode changes (Shift+Tab) by
  @jerop in [#17585](https://github.com/google-gemini/gemini-cli/pull/17585)
- feat(cli): add global setting to disable UI spinners by @galz10 in
  [#17234](https://github.com/google-gemini/gemini-cli/pull/17234)
- fix(security): enforce strict policy directory permissions by @yunaseoul in
  [#17353](https://github.com/google-gemini/gemini-cli/pull/17353)
- test(core): fix tests in windows by @scidomino in
  [#17592](https://github.com/google-gemini/gemini-cli/pull/17592)
- feat(mcp/extensions): Allow users to selectively enable/disable MCP servers
  included in an extension( Issue #11057 & #17402) by @jasmeetsb in
  [#17434](https://github.com/google-gemini/gemini-cli/pull/17434)
- Always map mac keys, even on other platforms by @scidomino in
  [#17618](https://github.com/google-gemini/gemini-cli/pull/17618)
- Ctrl-O by @jacob314 in
  [#17617](https://github.com/google-gemini/gemini-cli/pull/17617)
- feat(plan): update cycling order of approval modes by @Adib234 in
  [#17622](https://github.com/google-gemini/gemini-cli/pull/17622)
- fix(cli): restore 'Modify with editor' option in external terminals by
  @abhipatel12 in
  [#17621](https://github.com/google-gemini/gemini-cli/pull/17621)
- Slash command for helping in debugging by @gundermanc in
  [#17609](https://github.com/google-gemini/gemini-cli/pull/17609)
- feat: add double-click to expand/collapse large paste placeholders by
  @jackwotherspoon in
  [#17471](https://github.com/google-gemini/gemini-cli/pull/17471)
- refactor(cli): migrate non-interactive flow to event-driven scheduler by
  @abhipatel12 in
  [#17572](https://github.com/google-gemini/gemini-cli/pull/17572)
- fix: loadcodeassist eligible tiers getting ignored for unlicensed users
  (regression) by @gsquared94 in
  [#17581](https://github.com/google-gemini/gemini-cli/pull/17581)
- chore(core): delete legacy nonInteractiveToolExecutor by @abhipatel12 in
  [#17573](https://github.com/google-gemini/gemini-cli/pull/17573)
- feat(core): enforce server prefixes for MCP tools in agent definitions by
  @abhipatel12 in
  [#17574](https://github.com/google-gemini/gemini-cli/pull/17574)
- feat (mcp): Refresh MCP prompts on list changed notification by @MrLesk in
  [#14863](https://github.com/google-gemini/gemini-cli/pull/14863)
- feat(ui): pretty JSON rendering tool outputs by @medic-code in
  [#9767](https://github.com/google-gemini/gemini-cli/pull/9767)
- Fix iterm alternate buffer mode issue rendering backgrounds by @jacob314 in
  [#17634](https://github.com/google-gemini/gemini-cli/pull/17634)
- feat(cli): add gemini extensions list --output-format=json by @AkihiroSuda in
  [#14479](https://github.com/google-gemini/gemini-cli/pull/14479)
- fix(extensions): add .gitignore to extension templates by @godwiniheuwa in
  [#17293](https://github.com/google-gemini/gemini-cli/pull/17293)
- paste transform followup by @jacob314 in
  [#17624](https://github.com/google-gemini/gemini-cli/pull/17624)
- refactor: rename formatMemoryUsage to formatBytes by @Nubebuster in
  [#14997](https://github.com/google-gemini/gemini-cli/pull/14997)
- chore: remove extra top margin from /hooks and /extensions by @jackwotherspoon
  in [#17663](https://github.com/google-gemini/gemini-cli/pull/17663)
- feat(cli): add oncall command for issue triage by @sehoon38 in
  [#17661](https://github.com/google-gemini/gemini-cli/pull/17661)
- Fix sidebar issue for extensions link by @chrstnb in
  [#17668](https://github.com/google-gemini/gemini-cli/pull/17668)
- Change formatting to prevent UI redressing attacks by @scidomino in
  [#17611](https://github.com/google-gemini/gemini-cli/pull/17611)
- Fix cluster of bugs in the settings dialog. by @jacob314 in
  [#17628](https://github.com/google-gemini/gemini-cli/pull/17628)
- Update sidebar to resolve site build issues by @chrstnb in
  [#17674](https://github.com/google-gemini/gemini-cli/pull/17674)
- fix(admin): fix a few bugs related to admin controls by @skeshive in
  [#17590](https://github.com/google-gemini/gemini-cli/pull/17590)
- revert bad changes to tests by @scidomino in
  [#17673](https://github.com/google-gemini/gemini-cli/pull/17673)
- feat(cli): show candidate issue state reason and duplicate status in triage by
  @sehoon38 in [#17676](https://github.com/google-gemini/gemini-cli/pull/17676)
- Fix missing slash commands when Gemini CLI is in a project with a package.json
  that doesn't follow semantic versioning by @Adib234 in
  [#17561](https://github.com/google-gemini/gemini-cli/pull/17561)
- feat(core): Model family-specific system prompts by @joshualitt in
  [#17614](https://github.com/google-gemini/gemini-cli/pull/17614)
- Sub-agents documentation. by @gundermanc in
  [#16639](https://github.com/google-gemini/gemini-cli/pull/16639)
- feat: wire up AskUserTool with dialog by @jackwotherspoon in
  [#17411](https://github.com/google-gemini/gemini-cli/pull/17411)
- Load extension settings for hooks, agents, skills by @chrstnb in
  [#17245](https://github.com/google-gemini/gemini-cli/pull/17245)
- Fix issue where Gemini CLI can make changes when simply asked a question by
  @gundermanc in
  [#17608](https://github.com/google-gemini/gemini-cli/pull/17608)
- Update docs-writer skill for editing and add style guide for reference. by
  @g-samroberts in
  [#17669](https://github.com/google-gemini/gemini-cli/pull/17669)
- fix(ux): have user message display a short path for pasted images by @devr0306
  in [#17613](https://github.com/google-gemini/gemini-cli/pull/17613)
- feat(plan): enable AskUser tool in Plan mode for clarifying questions by
  @jerop in [#17694](https://github.com/google-gemini/gemini-cli/pull/17694)
- GEMINI.md polish by @jacob314 in
  [#17680](https://github.com/google-gemini/gemini-cli/pull/17680)
- refactor(core): centralize path validation and allow temp dir access for tools
  by @NTaylorMullen in
  [#17185](https://github.com/google-gemini/gemini-cli/pull/17185)
- feat(skills): promote Agent Skills to stable by @abhipatel12 in
  [#17693](https://github.com/google-gemini/gemini-cli/pull/17693)
- refactor(cli): keyboard handling and AskUserDialog by @jacob314 in
  [#17414](https://github.com/google-gemini/gemini-cli/pull/17414)
- docs: Add Experimental Remote Agent Docs by @adamfweidman in
  [#17697](https://github.com/google-gemini/gemini-cli/pull/17697)
- revert: promote Agent Skills to stable (#17693) by @abhipatel12 in
  [#17712](https://github.com/google-gemini/gemini-cli/pull/17712)
- feat(ux) Expandable (ctrl-O) and scrollable approvals in alternate buffer
  mode. by @jacob314 in
  [#17640](https://github.com/google-gemini/gemini-cli/pull/17640)
- feat(skills): promote skills settings to stable by @abhipatel12 in
  [#17713](https://github.com/google-gemini/gemini-cli/pull/17713)
- fix(cli): Preserve settings dialog focus when searching by @SandyTao520 in
  [#17701](https://github.com/google-gemini/gemini-cli/pull/17701)
- feat(ui): add terminal cursor support by @jacob314 in
  [#17711](https://github.com/google-gemini/gemini-cli/pull/17711)
- docs(skills): remove experimental labels and update tutorials by @abhipatel12
  in [#17714](https://github.com/google-gemini/gemini-cli/pull/17714)
- docs: remove 'experimental' syntax for hooks in docs by @abhipatel12 in
  [#17660](https://github.com/google-gemini/gemini-cli/pull/17660)
- Add support for an additional exclusion file besides .gitignore and
  .geminiignore by @alisa-alisa in
  [#16487](https://github.com/google-gemini/gemini-cli/pull/16487)
- feat: add review-frontend-and-fix command by @galz10 in
  [#17707](https://github.com/google-gemini/gemini-cli/pull/17707)

**Full changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.26.0...v0.27.0
