# 🚀 Welcome to the UX Team "Global Toolbox"

You have successfully installed the Gemini CLI UX power-ups!

These tools are designed to help us sprint toward the **Gemini 1.0 Milestone**
without fighting the CLI. They are "opinionated" and built specifically for the
UX "Vibe Coding" workflow.

## 🛠️ Your New Superpowers

You now have four new commands available in your Gemini CLI session. Because
they are synced globally, **you can use them on any branch.**

- `/_ux_git-worktree` : Ditch nested branches! Use this to manage your tasks in
  parallel sibling folders (Base Folder Strategy). It auto-runs `npm install`
  for you!
- `/_ux_finish-pr` : Your co-author assistant. It runs tests, updates snapshots,
  fixes CI linting, and squashes your messy trial-and-error commits before
  force-pushing.
- `/_ux_designer` : Run this against your new React/Ink components to guarantee
  they adhere to the v1.0 strict standards (Signal over Noise, Coherent State,
  Density).
- `/string-reviewer` : Audits UI text for strict adherence to the project
  terminology.

## 🧠 Why are we doing this?

We are intentionally keeping these tools in a "floating" Draft PR branch rather
than merging them to `main`. This isolation lets the UX team iterate at
lightning speed on our tooling without polluting the main codebase for backend
engineers.

_(Note: We plan to migrate this entire toolbox into a formal **Gemini CLI
Extension** in the near future!)_

## 🏁 Get Started

1. Open your terminal.
2. Ensure you have run `/skills reload`.
3. Try typing `/_ux_` to see your new tools in action!
