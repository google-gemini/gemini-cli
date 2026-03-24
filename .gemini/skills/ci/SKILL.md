---
name: ci
description:
  A specialized skill for Gemini CLI that provides high-performance, fail-fast
  monitoring of GitHub Actions workflows and automated local verification of CI
  failures.
---

# CI Status & Replicate

This skill enables the agent to efficiently monitor GitHub Actions, triage
failures, and bridge remote CI errors to local development.

## Core Capabilities

- **Real-time Monitoring**: Aggregated status line for all concurrent workflows
  on the current branch.
- **Fail-Fast Triage**: Immediately stops on the first job failure to provide a
  structured report.
- **Automated Verification**: Extracts failing tests and lint/build errors to
  generate and run local verification commands.

## Workflow

### 1. Monitoring CI (`status`)
Use this when you have pushed changes and need to wait for CI results before
proceeding.
- **Tool**: `node .gemini/skills/ci/scripts/ci.mjs [branch] [run_id]`
- **Behavior**: It will poll every 15 seconds. If it detects a failure, it will
  exit with a structured report of failing files and categories.

### 2. Automated Triage (`replicate`)
Use this to "hand off" a CI failure to the agent.
- **Strategy**: 
    1. Run `node .gemini/skills/ci/scripts/ci.mjs`.
    2. Extract suggested `npm test` or `npm run lint` commands from the output
       (marked with 🚀).
    3. Execute those commands locally to reproduce the failure.
    4. Once reproduced, use the failure output to apply a fix.

## Failure Categories & Actions

- **Test Failures**: Agent should run the specific `npm test -w <pkg> -- <path>`
  command suggested.
- **Lint Errors**: Agent should run `npm run lint:all` or the specific package
  lint command.
- **Build Errors**: Agent should check `tsc` output or build logs to resolve
  compilation issues.
- **Job Errors**: Investigate `gh run view --job <job_id> --log` for
  infrastructure or setup failures.

## Noise Filtering
The underlying scripts automatically filter noise (Git logs, NPM warnings, stack
trace overhead). The agent should focus on the "Structured Failure Report"
provided by the tool.
