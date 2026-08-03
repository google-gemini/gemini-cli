# Latest stable release: v0.53.0

Released: July 28, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Caretaker Triage Orchestrator:** Implemented an LLM triage orchestrator and
  container build setup to manage automated caretakers.
- **Eval Coverage Reporting:** Introduced a new command for generating
  evaluation coverage reports to track agent decision logic and testing.
- **Security and Sandboxing:** Aligned macOS permissive Seatbelt profiles with
  the deny-default model, and enforced workspace trust with task isolation in
  the A2A server.
- **Robust Conversation Loops:** Coalesced consecutive message roles and grouped
  cancelled tool responses to avoid Bad Request errors, and mitigated infinite
  ReAct loops and prompt injection vulnerabilities.

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
https://github.com/google-gemini/gemini-cli/compare/v0.52.0...v0.53.0
