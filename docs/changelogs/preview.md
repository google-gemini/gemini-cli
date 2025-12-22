# Preview release: Release v0.22.0-preview.0

Released: December 16, 2025

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## What's Changed

- feat(ide): fallback to GEMINI_CLI_IDE_AUTH_TOKEN env var by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14843
- feat: display quota stats for unused models in /stats by @sehoon38 in
  https://github.com/google-gemini/gemini-cli/pull/14764
- feat: ensure codebase investigator uses preview model when main agent does by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/14412
- chore: add closing reason to stale bug workflow by @galz10 in
  https://github.com/google-gemini/gemini-cli/pull/14861
- Send the model and CLI version with the user agent by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/14865
- refactor(sessions): move session summary generation to startup by
  @jackwotherspoon in https://github.com/google-gemini/gemini-cli/pull/14691
- Limit search depth in path corrector by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14869
- Fix: Correct typo in code comment by @kuishou68 in
  https://github.com/google-gemini/gemini-cli/pull/14671
- feat(core): Plumbing for late resolution of model configs. by @joshualitt in
  https://github.com/google-gemini/gemini-cli/pull/14597
- feat: attempt more error parsing by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14899
- Add missing await. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/14910
- feat(core): Add support for transcript_path in hooks for git-ai/Gemini
  extension by @svarlamov in
  https://github.com/google-gemini/gemini-cli/pull/14663
- refactor: implement DelegateToAgentTool with discriminated union by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/14769
- feat: reset availabilityService on /auth by @adamfweidman in
  https://github.com/google-gemini/gemini-cli/pull/14911
- chore/release: bump version to 0.21.0-nightly.20251211.8c83e1ea9 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14924
- Fix: Correctly detect MCP tool errors by @kevin-ramdass in
  https://github.com/google-gemini/gemini-cli/pull/14937
- increase labeler timeout by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14922
- tool(cli): tweak the frontend tool to be aware of more core files from the cli
  by @jacob314 in https://github.com/google-gemini/gemini-cli/pull/14962
- feat(cli): polish cached token stats and simplify stats display when quota is
  present. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14961
- feat(settings-validation): add validation for settings schema by @lifefloating
  in https://github.com/google-gemini/gemini-cli/pull/12929
- fix(ide): Update IDE extension to write auth token in env var by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14999
- Revert "chore(deps): bump express from 5.1.0 to 5.2.0" by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/14998
- feat(a2a): Introduce /init command for a2a server by @cocosheng-g in
  https://github.com/google-gemini/gemini-cli/pull/13419
- feat: support multi-file drag and drop of images by @jackwotherspoon in
  https://github.com/google-gemini/gemini-cli/pull/14832
- fix(policy): allow codebase_investigator by default in read-only policy by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/15000
- refactor(ide ext): Update port file name + switch to 1-based index for
  characters + remove truncation text by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/10501
- fix(vscode-ide-companion): correct license generation for workspace
  dependencies by @skeshive in
  https://github.com/google-gemini/gemini-cli/pull/15004
- fix: temp fix for subagent invocation until subagent delegation is merged to
  stable by @abhipatel12 in
  https://github.com/google-gemini/gemini-cli/pull/15007
- test: update ide detection tests to make them more robust when run in an ide
  by @kevin-ramdass in https://github.com/google-gemini/gemini-cli/pull/15008
- Remove flex from stats display. See snapshots for diffs. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/14983
- Add license field into package.json by @jb-perez in
  https://github.com/google-gemini/gemini-cli/pull/14473
- feat: Persistent "Always Allow" policies with granular shell & MCP support by
  @allenhutchison in https://github.com/google-gemini/gemini-cli/pull/14737
- chore/release: bump version to 0.21.0-nightly.20251212.54de67536 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/14969
- fix(core): commandPrefix word boundary and compound command safety by
  @allenhutchison in https://github.com/google-gemini/gemini-cli/pull/15006
- chore(docs): add 'Maintainers only' label info to CONTRIBUTING.md by @jacob314
  in https://github.com/google-gemini/gemini-cli/pull/14914
- Refresh hooks when refreshing extensions. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/14918
- Add clarity to error messages by @gsehgal in
  https://github.com/google-gemini/gemini-cli/pull/14879
- chore : remove a redundant tip by @JayadityaGit in
  https://github.com/google-gemini/gemini-cli/pull/14947
- chore/release: bump version to 0.21.0-nightly.20251213.977248e09 by
  @gemini-cli-robot in https://github.com/google-gemini/gemini-cli/pull/15029
- Disallow redundant typecasts. by @gundermanc in
  https://github.com/google-gemini/gemini-cli/pull/15030
- fix(auth): prioritize GEMINI_API_KEY env var and skip unnecessary key… by
  @galz10 in https://github.com/google-gemini/gemini-cli/pull/14745
- fix: use zod for safety check result validation by @allenhutchison in
  https://github.com/google-gemini/gemini-cli/pull/15026
- update(telemetry): add hashed_extension_name to field to extension events by
  @kiranani in https://github.com/google-gemini/gemini-cli/pull/15025
- fix: similar to policy-engine, throw error in case of requiring tool execution
  confirmation for non-interactive mode by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/14702
- Clean up processes in integration tests by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15102
- docs: update policy engine getting started and defaults by @NTaylorMullen in
  https://github.com/google-gemini/gemini-cli/pull/15105
- Fix tool output fragmentation by encapsulating content in functionResponse by
  @abhipatel12 in https://github.com/google-gemini/gemini-cli/pull/13082
- Simplify method signature. by @scidomino in
  https://github.com/google-gemini/gemini-cli/pull/15114
- Show raw input token counts in json output. by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15021
- fix: Mark A2A requests as interactive by @MayV in
  https://github.com/google-gemini/gemini-cli/pull/15108
- use previewFeatures to determine which pro model to use for A2A by @sehoon38
  in https://github.com/google-gemini/gemini-cli/pull/15131
- refactor(cli): fix settings merging so that settings using the new json format
  take priority over ones using the old format by @jacob314 in
  https://github.com/google-gemini/gemini-cli/pull/15116

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.21.0-preview.6...v0.22.0-preview.0
