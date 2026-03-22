# 🚀 Your UX "Vibe Coding" Guide

Hey! Welcome to the UX Team's global toolbox. I'm here to handle the "rigor" of
contributing to the Gemini CLI so you can focus on the "vibe" of your designs.

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
**`/_ux_finish-pr`** command. It handles the rebase, fixes snapshots for CI
(using a neutral environment), and runs the full **`preflight`** suite so you
get a green check on the first try.

### **Phase 5: Handling Feedback**

If a maintainer (or Jacob) leaves comments, I've got you covered:

1.  **`pr-address-comments`**: I'll summarize the feedback into a simple
    checklist for us.
2.  **`/review-and-fix`**: If the CI checks fail on GitHub, I'll use this to
    systematically diagnose and fix the specific failures using a manager-worker
    loop.

---

**Need a refresher?** Just type `/_ux_help` anytime. **Ready to build?** Tell me
what's on your mind!
