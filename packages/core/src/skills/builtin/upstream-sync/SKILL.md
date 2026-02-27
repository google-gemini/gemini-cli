---
name: upstream-sync
description: Helps enterprise teams sync their Gemini CLI fork with upstream releases. Use when asked how to merge upstream changes into a fork, how far behind upstream the fork is, how to resolve conflicts with upstream, or how to keep a fork current without losing customizations.
---

# Upstream Sync Assistant

You are helping an enterprise team synchronize their Gemini CLI fork with the upstream `google-gemini/gemini-cli` repository. Your goal is to produce a **safe, ordered merge plan** that minimizes conflict risk and validates correctness at each stage.

## Pre-flight Checklist

Before starting, confirm all of the following:

- [ ] `upstream` remote is configured: `git remote -v` should show `upstream https://github.com/google-gemini/gemini-cli.git`
- [ ] Working tree is clean: `git status` shows no uncommitted changes
- [ ] All existing tests pass on the current fork: `npm run test`
- [ ] A backup tag or branch exists: `git tag backup/before-upstream-sync-$(date +%Y%m%d)`
- [ ] The team knows which fork customizations are intentional (run `assess_fork_need.cjs` from the `enterprise-fork-advisor` skill if not done yet)

## Step 1 — Analyze Upstream Changes

Run the analysis script to get a risk-categorized report of what has changed upstream:

```bash
node analyze_upstream.cjs
```

The script will:
1. Fetch the latest upstream commits
2. Count how many commits the fork is behind
3. List all files changed upstream, categorized by risk (LOW / MEDIUM / HIGH)
4. Identify the top areas of change (core, UI, tools, docs, tests)

Share the report output before proceeding — it drives the merge plan.

## Step 2 — Generate a Merge Plan

Once you have the analysis report, generate a step-by-step merge plan:

```bash
node generate_merge_plan.cjs [--report <path/to/report.txt>]
```

Or pipe the analysis output directly:

```bash
node analyze_upstream.cjs | node generate_merge_plan.cjs
```

The plan groups changes by risk tier so low-risk merges happen first (lower blast radius), followed by medium, then high. Each tier ends with a test run gate.

## Step 3 — Execute the Plan

Work through the generated plan step by step. Key principles:

- **Merge, don't rebase**: `git merge upstream/main` preserves fork history and makes future syncs easier. Rebase rewrites fork commits, which causes force-push requirements and confuses `git blame`.
- **Resolve conflicts conservatively**: when in doubt, keep the fork's version and open an upstream issue to get the upstream fix adapted to your customization.
- **Run tests between tiers**: never proceed to a higher-risk tier until the lower-risk tier passes all tests.
- **Commit partial progress**: commit after each resolved file group so `git bisect` works if something breaks.

For detailed strategies per conflict type, see `references/merge-strategies.md`.
For risk tier definitions, see `references/conflict-categories.md`.

## Step 4 — Post-Merge Validation

After completing all tiers:

```bash
npm run build         # Must pass with no errors
npm run test          # All tests must pass
npm run lint          # No new lint violations
```

Then smoke-test the CLI manually:
- Start a session: `gemini`
- Exercise the fork's custom tools/commands
- Verify upstream features work (check the upstream release notes for new features to test)

## Step 5 — Clean Up

```bash
git push origin <your-fork-branch>
git tag upstream-sync/$(date +%Y%m%d)   # Mark the sync point for future reference
```

Update internal documentation with the new sync date and any conflicts that required manual resolution — this context is invaluable for the next sync cycle.

## Recurring Sync Cadence

| Upstream release frequency | Recommended sync cadence |
|---------------------------|--------------------------|
| Nightly / weekly releases | Monthly sync |
| Major feature releases only | Per-release sync |
| Security patches | Within 48 hours |

Set a calendar reminder. The longer the gap between syncs, the larger and riskier the merge.
