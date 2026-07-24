# Preview release: v0.53.0-preview.0

Released: July 22, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Caretaker LLM Triage Orchestrator**: Implemented the LLM triage orchestrator
  and container build configuration to support caretaker triage workflows.
- **Enhanced Workspace Trust & Sandbox Hardening**: Aligned macOS permissive
  Seatbelt profiles with the deny-default model and enforced workspace trust and
  task isolation in the Agent-to-Agent (A2A) server to prevent remote code
  execution (RCE).
- **Core Robustness & API Protections**: Mitigated infinite ReAct and prompt
  injection loops, and prevented 400 Bad Request errors by grouping cancelled
  tool responses and coalescing consecutive roles.
- **Robust Credentials & Fallbacks**: Restored the
  `GOOGLE_APPLICATION_CREDENTIALS` environment variable fallback and
  sequentially verified cached credentials.
- **Evaluation Coverage Reporting**: Added a new command to generate
  comprehensive eval coverage reports.

## What's Changed

- fix(core,a2a): group cancelled tool responses and coalesce consecutive roles
  to prevent 400 Bad Request by @luisfelipe-alt in
  [#28407](https://github.com/google-gemini/gemini-cli/pull/28407)
- feat(caretaker-triage): implement LLM triage orchestrator and container build
  by @chadd28 in
  [#28345](https://github.com/google-gemini/gemini-cli/pull/28345)
- refactor(cli): align macOS permissive Seatbelt profiles with deny-default
  model by @ompatel-aiml in
  [#28424](https://github.com/google-gemini/gemini-cli/pull/28424)
- fix(core): mitigate infinite ReAct loops and prompt injection loops by
  @amelidev in [#28429](https://github.com/google-gemini/gemini-cli/pull/28429)
- fix(a2a-server): enforce workspace trust and task isolation to prevent RCE by
  @luisfelipe-alt in
  [#28470](https://github.com/google-gemini/gemini-cli/pull/28470)
- fix(core): sequentially verify cached credentials and restore
  GOOGLE_APPLICATION_CREDENTIALS fallback by @luisfelipe-alt in
  [#28472](https://github.com/google-gemini/gemini-cli/pull/28472)
- feat(evals): add eval coverage report command by @ved015 in
  [#28169](https://github.com/google-gemini/gemini-cli/pull/28169)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.52.0-preview.0...v0.53.0-preview.0
