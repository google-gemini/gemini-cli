# TermViz Branch Demo Guide

This branch demonstrates terminal-native visualization integrated into the Gemini
CLI codebase (not a standalone app).

Branch: `feature/termviz-integration`

## Demo Option A: Clone This Branch Directly

```bash
git clone --single-branch --branch feature/termviz-integration https://github.com/Aaxhirrr/gemini-cli.git
cd gemini-cli
npm install
npm run build
npm run start
```

## Demo Option B: Checkout Draft PR

Using GitHub CLI:

```bash
gh pr checkout <PR_NUMBER>
npm install
npm run build
npm run start
```

Without GitHub CLI:

```bash
git fetch origin pull/<PR_NUMBER>/head:demo-pr
git checkout demo-pr
npm install
npm run build
npm run start
```

## Prerequisites

1. Node.js 20+.
2. Gemini authentication configured (`/auth` in CLI or API key env setup).
3. For graphics path validation: iTerm2 or Kitty.
4. For fallback validation: a basic terminal without graphics support.

## Quick Verification Matrix

1. Existing Gemini CLI integration:
Use slash commands inside this repo instance, not a standalone app.
2. Mermaid render path:
`/visualize demos/mermaid/nn-train-loop.mmd`
3. Natural language -> diagram generation:
`/visualize "A flowchart of a neural network training loop"`
4. Git graph rendering:
`/graph git`
5. Explain with visual:
`/explain --visualize "How does React reconciliation work?"`
6. HTML preview rendering:
`/preview demos/html/login-card.html`
7. Cache behavior:
Run the same visualize command twice and observe cache metadata.
8. Basic terminal fallback:
Run the same commands in a non-graphics terminal and confirm ASCII output.

## Full Demo Runbook

Run these in order after the CLI starts:

1. `/visualize demos/mermaid/nn-train-loop.mmd`
Expected:
Graphic render in iTerm2/Kitty, ASCII fallback in basic terminals.

2. `/visualize demos/mermaid/jwt-auth-sequence.mmd`
Expected:
Sequence diagram renders, including participant/arrow labels.

3. `/graph git`
Expected:
Repository history graph appears (graphics or ASCII fallback).

4. `/explain --visualize "How does React reconciliation work?"`
Expected:
Text explanation plus Mermaid-derived diagram output.

5. `/preview demos/html/login-card.html`
Expected:
HTML preview image in graphics terminals, readable fallback otherwise.

6. Repeat step 1:
`/visualize demos/mermaid/nn-train-loop.mmd`
Expected:
Cache hit in render metadata.

## Known Limits

1. Graphics positioning depends on terminal protocol behavior (iTerm2/Kitty
escape semantics).
2. Prompt-generated Mermaid can occasionally require auto-repair due to model
syntax variance.
3. ASCII fallback prioritizes readability over visual fidelity.

## Useful Links to Share

1. Branch tree:
`https://github.com/Aaxhirrr/gemini-cli/tree/feature/termviz-integration`
2. This demo doc on branch:
`https://github.com/Aaxhirrr/gemini-cli/blob/feature/termviz-integration/DEMO.md`
3. Compare view:
`https://github.com/google-gemini/gemini-cli/compare/main...Aaxhirrr:feature/termviz-integration`
4. Draft PR:
`https://github.com/google-gemini/gemini-cli/pull/<PR_NUMBER>`
