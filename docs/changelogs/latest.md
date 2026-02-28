# Latest stable release: v0.31.0

Released: February 27, 2026

For most users, our latest stable release is the recommended release. Install
the latest stable version with:

```
npm install -g @google/gemini-cli
```

## Highlights

- **Gemini 3.1 Pro Preview**: Support for the new Gemini 3.1 Pro Preview models
  with improved reasoning and context handling.
- **Experimental Browser Agent**: Introduced a new experimental agent that can
  interact directly with web pages to perform complex tasks.
- **Project-Level Policy**: Support for project-level policy enforcement,
  allowing for more granular control over tools and security.
- **Direct Web Fetch**: Implementation of a direct web fetch tool with built-in
  rate limiting to prevent abuse and ensure stability.
- **Plan Mode Enhancements**: Support for automatic model switching, custom
  storage directory configuration, and post-execution work summaries.

## What's Changed

- feat(models): support Gemini 3.1 Pro Preview and fixes by @sehoon38 in
  [#19676](https://github.com/google-gemini/gemini-cli/pull/19676)
- feat(browser): implement experimental browser agent by @gsquared94 in
  [#19284](https://github.com/google-gemini/gemini-cli/pull/19284)
- feat(policy): implement project-level policy support by @Abhijit-2592 in
  [#18682](https://github.com/google-gemini/gemini-cli/pull/18682)
- feat(core): implement experimental direct web fetch by @mbleigh in
  [#19557](https://github.com/google-gemini/gemini-cli/pull/19557)
- fix(security): rate limit web_fetch tool to mitigate DDoS via prompt injection
  by @mattKorwel in
  [#19567](https://github.com/google-gemini/gemini-cli/pull/19567)
- feat(plan): support automatic model switching for Plan Mode by @jerop in
  [#20240](https://github.com/google-gemini/gemini-cli/pull/20240)
- feat(plan): summarize work after executing a plan by @jerop in
  [#19432](https://github.com/google-gemini/gemini-cli/pull/19432)
- feat(plan): support configuring custom plans storage directory by @jerop in
  [#19577](https://github.com/google-gemini/gemini-cli/pull/19577)
- feat(policy): Support MCP Server Wildcards in Policy Engine by @jerop in
  [#20024](https://github.com/google-gemini/gemini-cli/pull/20024)
- feat(policy): Implement Tool Annotation Matching in Policy Engine by @jerop in
  [#20029](https://github.com/google-gemini/gemini-cli/pull/20029)
- feat(cli): add gemini --resume hint on exit by @Mag1ck in
  [#16285](https://github.com/google-gemini/gemini-cli/pull/16285)
- feat(cli): add macOS run-event notifications (interactive only) by
  @LyalinDotCom in
  [#19056](https://github.com/google-gemini/gemini-cli/pull/19056)
- feat(cli): enhance folder trust with configuration discovery and security
  warnings by @galz10 in
  [#19492](https://github.com/google-gemini/gemini-cli/pull/19492)
- security: implement deceptive URL detection and disclosure in tool
  confirmations by @ehedlund in
  [#19288](https://github.com/google-gemini/gemini-cli/pull/19288)
- security: strip deceptive Unicode characters from terminal output by @ehedlund
  in [#19026](https://github.com/google-gemini/gemini-cli/pull/19026)
- fix(patch): cherry-pick 32e777f for v0.31.0-preview.3 release by
  @gemini-cli-robot in
  [#20621](https://github.com/google-gemini/gemini-cli/pull/20621)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.30.1...v0.31.0
