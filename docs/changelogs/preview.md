# Preview release: v0.52.0-preview.0

Released: July 16, 2026

Our preview release includes the latest, new, and experimental features. This
release may not be as stable as our [latest weekly release](latest.md).

To install the preview release:

```
npm install -g @google/gemini-cli@preview
```

## Highlights

- **Caretaker Triage & Egress Services**: Added triage worker core foundational
  modules, implemented the main worker execution loop, and created an egress
  action publisher. Additionally, implemented the Octokit GitHub Action handler
  for the egress service to support automated caretaker operations.
- **Improved Error and Privacy Feedback**: Added a clear message when the active
  user account lacks a Code Assist tier, and enriched shared project quota limit
  errors with setup instructions.
- **Core Tool and Path Handling**: Simplified Plan Mode's write policy to
  support relative paths, bypassed LLM correction for JSON and IPYNB files in
  `write_file` and `replace` tools, and excluded transient CI configuration
  files from the workspace context.
- **Server and Dependency Updates**: Ensured task cancellation successfully
  aborts the execution loop in the Agent-to-Agent server, and upgraded the
  `google-auth-library` dependency to version 10.9.0.

## What's Changed

- Refactor: exclude transient CI configuration files from workspace context by
  @DavidAPierce in
  [#28216](https://github.com/google-gemini/gemini-cli/pull/28216)
- feat(caretaker-triage): add triage worker core foundational modules by
  @chadd28 in [#28163](https://github.com/google-gemini/gemini-cli/pull/28163)
- feat(caretaker-egress): implement octokit github action handler for egress
  service by @chadd28 in
  [#28303](https://github.com/google-gemini/gemini-cli/pull/28303)
- chore(release): bump version to 0.52.0-nightly.20260707.g27a3da3e8 by
  @gemini-cli-robot in
  [#28323](https://github.com/google-gemini/gemini-cli/pull/28323)
- Changelog for v0.51.0-preview.0 by @gemini-cli-robot in
  [#28320](https://github.com/google-gemini/gemini-cli/pull/28320)
- Changelog for v0.50.0 by @gemini-cli-robot in
  [#28322](https://github.com/google-gemini/gemini-cli/pull/28322)
- fix(core-tools): bypass LLM correction for JSON and IPYNB files in write_file
  and replace by @amelidev in
  [#28223](https://github.com/google-gemini/gemini-cli/pull/28223)
- fix(core): use unambiguous previous intent label in fallback summary by
  @amelidev in [#28343](https://github.com/google-gemini/gemini-cli/pull/28343)
- feat(caretaker-triage): implement main worker execution loop and egress action
  publisher by @chadd28 in
  [#28306](https://github.com/google-gemini/gemini-cli/pull/28306)
- fix(privacy): show a clear message when the account has no Code Assist tier by
  @ompatel-aiml in
  [#28304](https://github.com/google-gemini/gemini-cli/pull/28304)
- fix(core): enrich shared project quota limit errors with setup hint by
  @amelidev in [#28391](https://github.com/google-gemini/gemini-cli/pull/28391)
- fix(a2a-server): ensure task cancellation aborts execution loop by
  @luisfelipe-alt in
  [#28316](https://github.com/google-gemini/gemini-cli/pull/28316)
- fix(core): simplify plan mode write policy to support relative paths by
  @DavidAPierce in
  [#28398](https://github.com/google-gemini/gemini-cli/pull/28398)
- feat(core): Bump node google-auth-library version to 10.9.0 by @jerrylin3321
  in [#28385](https://github.com/google-gemini/gemini-cli/pull/28385)
- chore/release: bump version to 0.52.0-nightly.20260715.gfa975395b by
  @gemini-cli-robot in
  [#28402](https://github.com/google-gemini/gemini-cli/pull/28402)

**Full Changelog**:
https://github.com/google-gemini/gemini-cli/compare/v0.51.0-preview.0...v0.52.0-preview.0
