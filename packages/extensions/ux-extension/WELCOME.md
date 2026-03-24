# 🚀 Your UX "Vibe Coding" Guide

Hey! Welcome to the UX Team's global toolbox. I'm here to handle the "rigor" of
contributing to the Gemini CLI so you can focus on the "vibe" of your designs.

> **Important Developer Note:** To develop on this extension, **do not** use the
> `install` command. Instead, run:
> `gemini extensions link ./packages/extensions/ux-extension`
>
> This will symlink the source code, meaning any changes you make will be
> instantly available the next time you launch the CLI, and you won't get
> confusing "ghost file" conflicts!

Here is our end-to-end flow for building and shipping high-quality features:

---

### **Phase 1: Start Clean**

When you're ready to build something new, just tell me. I'll use
**`_ux_git-worktree`** to create a fresh sibling folder for the task. This keeps
your `main` branch pristine and avoids those annoying macOS sandbox interference
issues.

### **Phase 2: Vibe Coding (Prototyping)**

As soon as we touch UI code, I'll offer to load **`/frontend`**. This gives me
the full context of our React component library and the
`Strict Development Rules` (like using our custom `waitFor` and avoiding `any`).

- **Tip**: Use **`/introspect`** if you need me to explain how a specific part
  of the system works before we change it.

### **Phase 3: Quality Audit**

Before we finish, we'll run a few checks:

1.  **`_ux_designer`**: I'll audit your work against our v1.0 principles:
    **Signal over Noise**, **Coherent State**, and **Intent Signaling**.
2.  **`_ux_string-reviewer`**: I'll make sure your labels and tips match our
    project's specific terminology.

### **Phase 4: Crossing the Finish Line**

When you're happy, just say "I'm ready to submit." I'll run the
**`/_ux_finish-pr`** command. It handles:

1.  **Rebase**: Syncs with `main`.
2.  **Verification**: Mandatory `npm run build` or `npm run typecheck` to ensure
    structural integrity.
3.  **Snapshots**: Fixes snapshots for CI using a neutral environment.
4.  **Preflight**: Runs the full `preflight` suite.
5.  **Commit Strategy**: Squashes your main feature and ALL previous review
    fixes into one commit, but keeps only the **very last** round of code review
    comments as separate commits. This keeps the diffs manageable and fast for
    reviewers (30 seconds vs. 10 minutes).

### **Phase 5: Handling Feedback**

If a maintainer (or Jacob) leaves comments, I've got you covered:

1.  **`pr-address-comments`**: I'll fetch every comment (including nested inline
    ones), create a checklist, and help you address them one by one. I'll also
    post direct replies to every addressed comment to keep the reviewer
    informed.
2.  **`/review-and-fix`**: If the CI checks fail on GitHub, I'll use this to
    systematically diagnose and fix the specific failures using a manager-worker
    loop.

---

**Need a refresher?** Just type `/_ux_help` anytime. **Ready to build?** Tell me
what's on your mind!
