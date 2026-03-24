# Gemini CLI Git Worktrees Discussion Transcript

## Overview

This document captures a discussion regarding the new experimental native Git
Worktree support in the Gemini CLI and whether it makes the custom
`_ux_git-worktree` skill obsolete for the UX team.

### Skill Information

**Path:** `packages/extensions/ux-extension/skills/_ux_git-worktree/SKILL.md`

**High-Level Description:** The `_ux_git-worktree` skill manages a specific
"Base Folder Strategy" for the engineering team. Rather than nesting worktrees
inside a hidden `.gemini` folder, it enforces that all functional work occurs in
sibling sub-directories (e.g., `main/`, `feature-name/`). It automates creating
new task branches, checking out GitHub PRs into semantically named folders
(e.g., `pr-123-fix-core-bug`), and automatically running `npm install` to ensure
the isolated environment is immediately ready for development. It also handles
macOS sandbox pathing requirements.

---

## Discussion Transcript

**User:** Take a look at this new feature of Gemini CLI, and let me know if you
think it makes our git-worktree skill obsolete.
https://geminicli.com/docs/cli/git-worktrees/

**Gemini CLI:** Based on the documentation for the new native Git Worktree
feature and the specific rules defined in your `_ux_git-worktree` skill, **no,
it does not make your custom skill obsolete.**

While the new native feature is great for general-purpose isolation, your
`_ux_git-worktree` skill enforces highly specific, project-tailored workflows
that the native feature doesn't cover out-of-the-box:

1. **Directory Structure (The "Base Folder" Strategy):** The native CLI creates
   worktrees hidden away in `.gemini/worktrees/`. Your skill strictly enforces
   that worktrees must be **sibling directories** to `main/` (e.g.,
   `../feature-name/`).
2. **Semantic PR Checkouts:** Your skill uses a custom `worktree-manager.sh`
   script to automatically fetch PR titles and create human-readable, semantic
   directory names (like `pr-123-fix-core-bug`). The native CLI does not
   integrate with GitHub PRs in this way.
3. **Mandatory Environment Setup:** Your skill enforces a mandatory
   `npm install` immediately after a worktree is created to ensure the
   environment is ready for development.
4. **macOS Sandbox Management:** Because your worktrees live outside the
   immediate repository container as sibling folders, your skill includes
   specific logic to ensure the primary `../main/.git` path is added to the
   trusted environment to bypass macOS sandbox restrictions.

**Recommendation:** The native `--worktree` flag is an excellent feature for
standard use cases, but for the rigorous, standardized workflows required by the
UX Extension in this repository, you should continue using your custom
`_ux_git-worktree` skill to maintain compliance with the "Base Folder"
architecture.

**User:** Let's back up a step. My goal is for the UX team that uses this
extension to be able to use git worktrees following the standard team convention
(i.e. the whole eng team will use this worktrees feature). We don't want to
duplicate or recreate the feature with our skill, nor do we want to diverge from
standard team practice. The exception is that I'd like the UX team (and end
users potentially) to be able to create and use worktrees with natural language.

Let's take a user-journey approach to designing the experience. Start by
creating a list of the use-cases/journeys that users will want to do with
worktrees. My current behavior is:

1. I want to create a new worktree to work on a new feature. I have a name in
   mind, and I want to start from main. Its nice that I can use gemini cli
   interactive mode and say 'new worktree called blahblah' and i dont have to
   remember a specific syntax, but also the startup time maybe means I should
   just learn the syntax. It seems simple. Its convenient that it runs npm
   install to save me a step, but not critical.
2. I want to create a new worktree by cloning someone's branch/PR to my local
   machine. Its easy for me to run gemini cli interactive mode and say 'create a
   new worktree from http://PRURL and call it blahblah. Again, the npm install
   is convenient. In this case Im not sure how to do this in noninteractive
   mode.
3. I want to see all the worktrees ive created locally, and its handy i can look
   at my folders, becuase it basically represents a list of my projects/features
   im working on. Im not sure how this could be done in noninteractive mode, so
   I would worry about losing my work in progress. its kind of confusing if my
   worktrees are in gemini's hidden folder. It would be great if there was a way
   to see my worktrees within gemini cli interactive and non interactive mode.

So as a worktree novice, and someone who has not tested this experimental
feature still, I may be misunderstanding things. Would you please create a list
of use-cases that includes mine, as well as any key ones im missing? Under each
use-case, identify whether its supported by the experimental feature in both
interactive and noninteractive modes.

**Gemini CLI:** This is a great approach. Stepping back to look at the user
journey is the best way to determine if a feature genuinely serves the team's
workflow or just adds unnecessary complexity.

Based on your current workflow, the documentation for the new experimental
feature, and standard Git worktree lifecycles, here is a breakdown of the key
user journeys.

### 1. Create a new worktree for a new feature (from `main`)

**User Goal:** Spin up an isolated environment to start fresh work, optionally
with a specific name, without messing up the primary `main` branch.

- **Experimental Native Feature (Non-Interactive):** **Supported.** You launch
  Gemini with `gemini --worktree <name>`. It automatically creates a new branch
  and a linked directory in `.gemini/worktrees/<name>`. _(Note: It does not
  automatically run `npm install` like your current skill does)._
- **Experimental Native Feature (Interactive):** **Partially Supported.** You
  cannot start a standard `gemini` session and then type a native slash command
  (like `/worktree new`) to instantly pivot the current session into a worktree.
  You must use the `--worktree` flag _when launching_ the CLI. However, once
  inside any interactive session, you can always just ask the agent in natural
  language to run standard `git worktree add` commands for you.

### 2. Create a worktree from a remote branch or PR

**User Goal:** Review a teammate's PR or continue work on a remote branch
without stashing current local changes.

- **Experimental Native Feature (Non-Interactive):** **Not Supported Natively.**
  The `--worktree` flag only creates _new_ branches from your current HEAD. It
  does not accept a PR URL or remote branch name. You would have to manually
  fetch the remote branch and use standard `git worktree add` commands before
  launching Gemini.
- **Experimental Native Feature (Interactive):** **Not Supported Natively.**
  Again, the native feature lacks a "PR-to-worktree" pipeline. To do this with
  natural language, you still rely on the AI agent running shell commands (which
  is exactly what your `_ux_git-worktree` skill automates so reliably).

### 3. Discoverability: View existing local worktrees

**User Goal:** See a list of all active projects/features currently in progress.

- **Experimental Native Feature (Non-Interactive):** **Supported (but hidden).**
  The native feature stores worktrees inside `.gemini/worktrees/`. Because this
  is a hidden directory, you won't see your projects when doing a standard `ls`
  in your file explorer. You have to explicitly check that hidden path or run
  standard `git worktree list`.
- **Experimental Native Feature (Interactive):** **Supported.** You can ask the
  agent, "What worktrees do I have open?" and it will run `git worktree list` to
  tell you.

### 4. Resume work on an existing worktree _(Missing Use-Case)_

**User Goal:** Switch context back to a feature you started yesterday.

- **Experimental Native Feature (Non-Interactive):** **Supported.** You have to
  manually `cd` into the hidden `.gemini/worktrees/<name>` directory and run
  `gemini` again.
- **Experimental Native Feature (Interactive):** **Supported.** If you want to
  resume the exact AI conversation you were having in that worktree, you
  navigate to the hidden folder and launch with `gemini --resume <session_id>`.

### 5. Clean up / Delete a finished worktree _(Missing Use-Case)_

**User Goal:** After a PR is merged, delete the local branch and the isolated
folder to free up space.

- **Experimental Native Feature (Non-Interactive):** **Not Supported.** The
  documentation explicitly states Gemini does not automatically clean up
  worktrees. You must manually run `git worktree remove <path> --force` and
  `git branch -D <branch>`.
- **Experimental Native Feature (Interactive):** **Not Supported Natively.** You
  can ask the AI agent to run the cleanup commands for you, but there is no
  native garbage collection.

---

### The Verdict for Your Team

You are not misunderstanding things; your concerns are spot on.

The new native `--worktree` feature is designed primarily for **AI
isolation**—giving the agent a safe sandbox so it doesn't break the user's main
repository while generating code. Because it hides these folders in
`.gemini/worktrees/`, it treats them as ephemeral AI scratchpads rather than
primary developer workspaces.

Your team's **"Base Folder Strategy"** (creating sibling folders like
`../feature-name/`) is designed for **Developer ergonomics**. It keeps projects
visible, integrates directly with PR workflows, and handles environment setup
(`npm install`).

**Conclusion:** The native feature does _not_ replace your skill. If you adopt
the native feature, your team will lose the PR checkout automation, the
automatic dependency installation, and the visibility of having worktrees as
top-level sibling folders. You should keep your `_ux_git-worktree` skill to
maintain your team's specific, natural-language-driven engineering standards.
