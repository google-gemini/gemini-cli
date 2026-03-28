# 🚀 Your UX "Vibe Coding" Command Center

Hey! Welcome to `gemini-cli-ux`. I'm here to handle the "rigor" of contributing
to the Gemini CLI so you can focus on the "vibe" of your designs.

> **Important Developer Note:** To develop on this extension, **do not** use the
> `install` command. Instead, run:
> `gemini extensions link ./packages/extensions/gemini-cli-ux`
>
> This will symlink the source code, meaning any changes you make will be
> instantly available the next time you launch the CLI, and you won't get
> confusing "ghost file" conflicts!

We've simplified the entire contribution lifecycle into a **"Power Four"**
command suite.

---

### **1. The Flow: Start Clean (`/ux-new-feature`)**

When you're ready to build something new or pick up an existing PR, run this. It
triggers the **`ux-git-skill`** skill to:

- Create a fresh sibling folder for the task (Base Folder Strategy).
- Keep your `main` branch pristine and avoid macOS sandbox interference issues.
- Automatically run `npm install` so you're ready to code.

### **2. The Look: Vibe Coding (`/ux-design`)**

As soon as you touch React/Ink code, invoke your **`ux-designer`** partner.

- It helps you scaffold new components or audit your work against our v1.0
  principles: **Signal over Noise**, **Coherent State**, and **Intent
  Signaling**.
- **Tip**: Use **`/introspect`** alongside it if you need me to explain how a
  specific part of the system works before we change it.

### **3. The Voice: Quality Copy (`/ux-review`)**

When you're adding labels, loading states, or errors, trigger the
**`ux-writer`** expert.

- I'll make sure your strings are concise and match our project's specific
  terminology.

### **4. The Finisher: Submit & Feedback (`/ux-pr`)**

This is the "Loop Killer." When you're ready to merge or when a PR inevitably
fails CI, run this to trigger the **`ux-git-skill`** submission protocol:

1.  **Rebase & Verify**: Syncs with `main` and mandates
    `npm run build`/`typecheck`.
2.  **Snapshots**: Fixes snapshots for CI using a neutral environment
    (`TERM_PROGRAM=generic`).
3.  **Jacob's Protocol**: Ensures refactors (zero-modification moves) are
    strictly separated from logic changes in the commit history.
4.  **Feedback Loop**: If a PR exists, it automatically fetches inline comments
    and CI failure logs, generates a "Fix-it" checklist, and helps you resolve
    them locally before you push again.

---

### **⚡️ Quick Start: Build & Run**

To see your changes in action, use the new high-speed bundling process. We
highly recommend setting up the `gbuild` alias in your shell profile (`~/.zshrc`
or `~/.bash_profile`):

```bash
alias gbuild='npm run bundle && node bundle/gemini.js'
```

Once set up, anytime you want to build and run your local branch, just type:

```bash
gbuild
```

_(You can ask me to set this alias up for you if you haven't already!)_

---

**Ready to build?** Start with `/ux-new-feature` and tell me what's on your
mind!
