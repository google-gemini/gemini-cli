# Release confidence strategy

This document outlines the strategy for gaining confidence in every release of
the Gemini CLI. It serves as a checklist and quality gate for release manager to
ensure we are shipping a high-quality product.

## The goal

To answer the question, "Is this release _truly_ ready for our users?" with a
high degree of confidence, based on a holistic evaluation of automated signals,
manual verification, and data.

## Level 1: Automated gates (must pass)

These are the baseline requirements. If any of these fail, the release is a
no-go.

### 1. CI/CD health

All workflows in `.github/workflows/ci.yml` must pass on the `main` branch (for
nightly) or the release branch (for preview/stable).

- **Platforms:** Tests must pass on **Linux and macOS**.
  - _Note:_ Windows tests currently run with `continue-on-error: true`. While a
    failure here doesn't block the release technically, it should be
    investigated.
- **Checks:**
  - **Linting:** No linting errors (ESLint, Prettier, etc.).
  - **Typechecking:** No TypeScript errors.
  - **Unit Tests:** All unit tests in `packages/core` and `packages/cli` must
    pass.
  - **Build:** The project must build and bundle successfully.

### 2. End-to-end (E2E) tests

All workflows in `.github/workflows/chained_e2e.yml` must pass.

- **Platforms:** **Linux, macOS and Windows**.
- **Sandboxing:** Tests must pass with both `sandbox:none` and `sandbox:docker`
  on Linux.

### 3. Post-deployment smoke tests

After a release is published to npm, the `smoke-test.yml` workflow runs. This
must pass to confirm the package is installable and the binary is executable.

- **Command:** `npx -y @google/gemini-cli@<tag> --version` must return the
  correct version without error.
- **Platform:** Currently runs on `ubuntu-latest`.

## Level 2: Manual verification and dogfooding

Automated tests cannot catch everything, especially UX issues.

### 1. Dogfooding via `preview` tag

The weekly release cadence promotes code from `main` -> `nightly` -> `preview`
-> `stable`.

- **Requirement:** The `preview` release must be used by maintainers for at
  least **one week** before being promoted to `stable`.
- **Action:** Maintainers should install the preview version locally:
  ```bash
  npm install -g @google/gemini-cli@preview
  ```
- **Goal:** To catch regressions and UX issues in day-to-day usage before they
  reach the broad user base.

### 2. Critical user journey (CUJ) checklist

Before promoting a `preview` release to `stable`, a release manager must
manually run through this checklist.

- **Setup:**
  - [ ] Uninstall any existing global version:
        `npm uninstall -g @google/gemini-cli`
  - [ ] Clear npx cache (optional but recommended): `npm cache clean --force`
  - [ ] Install the preview version: `npm install -g @google/gemini-cli@preview`
  - [ ] Verify version: `gemini --version`

- **Authentication:**
  - [ ] In interactive mode run `/auth` and verify all login flows work:
    - [ ] Login With Google
    - [ ] API Key
    - [ ] Vertex AI

- **Basic prompting:**
  - [ ] Run `gemini "Tell me a joke"` and verify a sensible response.
  - [ ] Run in interactive mode: `gemini`. Ask a follow-up question to test
        context.

- **Piped input:**
  - [ ] Run `echo "Summarize this" | gemini` and verify it processes stdin.

- **Context management:**
  - [ ] In interactive mode, use `@file` to add a local file to context. Ask a
        question about it.

- **Settings:**
  - [ ] In interactive mode run `/settings` and make modifications
  - [ ] Validate that setting is changed

- **Function calling:**
  - [ ] In interactive mode, ask gemini to "create a file named hello.md with
        the content 'hello world'" and verify the file is created correctly.

If any of these CUJs fail, the release is a no-go until a patch is applied to
the `preview` channel.

### 3. Pre-Launch bug bash (tier 1 and 2 launches)

For high-impact releases, an organized bug bash is required to ensure a higher
level of quality and to catch issues across a wider range of environments and
use cases.

**Definition of tiers:**

- **Tier 1:** Industry-Moving News 🚀
- **Tier 2:** Important News for Our Users 📣
- **Tier 3:** Relevant, but Not Life-Changing 💡
- **Tier 4:** Bug Fixes ⚒️

**Requirement:**

A bug bash must be scheduled at least **72 hours in advance** of any Tier 1 or
Tier 2 launch.

**Rule of thumb:**

A bug bash should be considered for any release that involves:

- A blog post
- Coordinated social media announcements
- Media relations or press outreach
- A "Turbo" launch event

## Level 3: Telemetry and data review

### Dashboard health

- [ ] Go to `go/gemini-cli-dash`.
- [ ] Navigate to the "Tool Call" tab.
- [ ] Validate that there are no spikes in errors for the release you would like
      to promote.

### Model evaluation

- [ ] Navigate to `go/gemini-cli-offline-evals-dash`.
- [ ] Make sure that the release you want to promote's recurring run is within
      average eval runs.

## The "go/no-go" decision

Before triggering the `Release: Promote` workflow to move `preview` to `stable`:

1.  [ ] **Level 1:** CI and E2E workflows are green for the commit corresponding
        to the current `preview` tag.
2.  [ ] **Level 2:** The `preview` version has been out for one week, and the
        CUJ checklist has been completed successfully by a release manager. No
        blocking issues have been reported.
3.  [ ] **Level 3:** Dashboard Health and Model Evaluation checks have been
        completed and show no regressions.

If all checks pass, proceed with the promotion.
