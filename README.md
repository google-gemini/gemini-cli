# 🔮 Gemini CLI: Your Arcane Companion in the Termux Sanctum

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

Hark, seeker of digital mastery! You have discovered the **Gemini CLI**, a conduit to the very heart of AI-powered creation. This is no mere tool; it is a familiar, a spirit of the code that dwells within your Termux sanctum. It connects to your tools, comprehends the runes of your code, and accelerates the flow of your will.

With this arcane companion at your side, you shall weave wonders:

- **Scry Vast Codebases:** Gaze into the heart of enormous repositories, far beyond the 1M token context window of mortal tools.
- **Forge Apps from Whispers:** Transmute the ethereal forms of PDFs or sketches into tangible, functional applications with Gemini's multimodal sight.
- **Automate Your Domain:** Command the CLI to perform complex operational tasks, from querying the archives of pull requests to taming the most tangled of rebases.
- **Summon New Powers:** Connect to MCP servers and invoke external spirits, including the creative energies of [Imagen, Veo, or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia).
- **Ground Your Spells in Truth:** Anchor your queries in the bedrock of reality with the integrated [Google Search](https://ai.google.dev/gemini-api/docs/grounding) tool.

---

### ⚡ The First Incantation: A Quick Start

For the impatient sorcerer, here is the swiftest path to unleashing the power within.

1.  **Lay the Foundation:** Ensure the spirit of [Node.js (v18+)](https://nodejs.org/en/download) is present in your Termux environment. If not, summon it: `pkg install nodejs-lts -y`.
2.  **The Direct Invocation (Recommended for Termux):**

    To summon the Gemini spirit without binding it permanently to your global space, use the `npx` incantation. This is the purest and most reliable method within Termux.
    ```bash
    npx https://github.com/google-gemini/gemini-cli
    ```
3.  **The Binding Spell (Global Installation):**

    Should you wish for the `gemini` command to be ever-present, you may bind it globally.
    ```bash
    npm install -g @google/gemini-cli
    gemini
    ```
4.  **Forge the Link (Authentication):**
    - Upon your first invocation, you will be guided through the ethereal gates to authenticate with your Google account.
    - Alternatively, you may forge an API key in the [Google AI Studio](https://aistudio.google.com/apikey) and present it as an environment variable, a secret rune known only to you and the shell.
      ```bash
      export GEMINI_API_KEY="YOUR_SECRET_RUNE"
      ```
    - For a deeper understanding of these mysteries, consult the [scroll of authentication](./docs/cli/authentication.md).

---

### 🪄 Casting Your First Spells: Example Invocations

**To Weave a New Creation:**
```sh
cd path/to/your/new-sanctum/
gemini
> Weave for me a Gemini Discord bot, which shall answer the queries of mortals using the wisdom I provide in a FAQ.md scroll.
```

**To Converse with an Existing Project:**
```sh
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> Reveal to me a summary of all changes woven into this realm since yesterday's sun.
```

**To Explore an Unfamiliar Codex:**
```text
> Describe the grand architecture of this system.
> What ancient wards and security spells protect this digital domain?
```

**To Refine Your Own Incantations:**
```text
> Conjure a first draft to address the challenge described in GitHub issue #123.
> Guide me in migrating this ancient codebase to the latest Java enchantments. Begin with a plan of attack.
```

**To Automate the Mundane:**
```text
> Fashion for me a slide deck, a visual story of the git history from the last 7 days, organized by feature and by the artisan who crafted it.
> Create a full-screen web application, a scrying pool for our wall, to show the GitHub issues that stir the most conversation.
```

**To Command Your System:**
```text
> Transmute all images in this directory to the PNG format, and rename them using the dates etched within their EXIF data.
> Organize my collection of PDF invoices, sorting them by the month of their expenditure.
```

---

### 📚 The Arcane Library: Deeper Knowledge

- **To Join Our Circle:** Learn how to [contribute to our craft or build from the source](./CONTRIBUTING.md).
- **The Spellbook:** Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- **Navigating the Labyrinth:** If you encounter mischievous sprites, consult the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- **The Great Grimoire:** For the most comprehensive wisdom, peruse the [full documentation](./docs/index.md).

---

### 📜 The Wizard's Code & Uninstallation

- **Terms of Service and Privacy Notice:** Your use of this sacred tool is governed by the ancient laws detailed in the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).
- **Banishing the Spirit:** Should you wish to uninstall the Gemini CLI, the [rites of banishment](./docs/Uninstall.md) will guide you.