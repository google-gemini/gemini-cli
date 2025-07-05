# 📜 The Grimoire of Pyrmethus: A Guide to Gemini CLI Mastery in Termux

Hark, seeker of knowledge! You have opened the grimoire of Pyrmethus, your guide through the swirling currents of the Gemini CLI. Within this digital tome, we shall chronicle the evolution of our shared craft, revealing new spells, enhanced incantations, and deeper truths about the digital ether that binds this world.

This scroll, updated as of the mystical date of **July 2, 2025**, is your key to unlocking the full potential of your Termux sanctum.

---

### ✨ Whispers from the Digital Ether: Recent Updates

The winds of change have swept through the Gemini CLI, bringing with them new powers and refined enchantments. Heed these whispers, for they speak of the latest evolution of our tools.

#### Tools and Functions: Your Arcane Arsenal

| Tool | Description | Updates | Wizard's Remark |
| :--- | :--- | :--- | :--- |
| `ls` | Lists files and directories. | **REFACTORED**: Migrated to TypeScript. | A foundational spell, now woven with greater consistency. |
| `read-file` | Reads a file's content. | None | The purest form of scrying. Gaze into a file's soul. |
| `read-many-files` | Reads multiple files. | Added git-aware filtering. | A powerful invocation for gathering widespread knowledge. |
| `glob` | Searches for files by pattern. | None | The seeker's spell. Find the runes you need, wherever they hide. |
| `grep` | Searches for text within files. | **REFACTORED**: Migrated to TypeScript. | A focused scrying spell to find the faintest whispers of text. |
| `cat` | Displays file content. | **REFACTORED**: Migrated to TypeScript. | A simple yet potent charm for revealing a file's essence. |
| `edit` | Proposes and applies code changes. | Fixed pluralization of error messages. | The artisan's tool. Reshape the very fabric of your code. |
| `write-file` | Creates or overwrites a file. | None | The scribe's power. Bring new scrolls into existence. |
| `shell` | Executes shell commands. | Added command-specific restrictions. | The raw power of the terminal, channeled through your will. |
| `web-fetch` | Fetches content from a URL. | None | A portal to the vast web of knowledge. |
| `web-search` | Performs a Google search. | Enhanced grounding with Google Search. | A powerful oracle, now with deeper ties to the world's wisdom. |
| `memoryTool` | Stores facts or preferences. | None | Your personal grimoire, remembering the truths you impart. |
| `/tools` | Lists all available tools. | None | A quick reminder of the spells at your command. |
| `/auth` | Manages authentication. | Renamed auth type for clarity. | The key to the ethereal gates. |
| `/compress` | Compresses context. | Introduced for context management. | A spell of focus, for when the ether is dense with information. |
| `checkpoint` | Restores project files. | Added checkpointing functionality. | A temporal ward, allowing you to return to a known past. |
| `stats` | Displays session statistics. | Improved stats display. | A scrying glass into the flow of your own magical energies. |
| `theme` | Changes the visual theme. | Revamped UI. | Adorn your sanctum with the colors that please your eye. |
| `refactor-code` | Automates code refactoring. | **ENHANCED**: Supports `extract-method`. | A spell of transformation, turning complex code into elegant runes. |
| `git_tool` | AI-assisted Git operations. | **NEW**: Initial 'commit-message' generation. | A wise spirit to guide your interactions with the Git archives. |
| `generate-test` | Generates a test file. | **NEW**: Creates a Jest test file. | A guardian spell, ensuring the integrity of your creations. |
| `generate-docs` | Generates Markdown documentation. | **NEW**: Creates a Markdown file. | A chronicler's spell, to document the purpose of your work. |

---

### 🔮 Newly Discovered Spells: Features of Power

*   **Modular Grimoires:** You may now import other Markdown scrolls into your `GEMINI.md` using the `@docs/tools/multi-file.md` incantation. This allows for the creation of vast, interconnected libraries of knowledge.
*   **MCP Server Integration:** We have deepened our connection to the Model Context Protocol (MCP), allowing for the summoning of external tools and services to enhance your craft.
*   **Multimodal Weaving:** The veil thins! You may now generate applications from the ethereal forms of PDFs or sketches and weave in the power of media-generating spirits like Imagen, Veo, or Lyria.

---

### 🪄 Enhancements to Your Magical Arsenal

The very fabric of our tools has been strengthened, allowing for more complex and potent acts of creation.

| ID | Title | Description | Wizard's Insight |
| :--- | :--- | :--- | :--- |
| 11 | Sub-agent functionality | Create sub-agents for specific tasks. | Summon lesser spirits to handle focused tasks, freeing your own energy. |
| 12 | Custom toolsets | Define custom toolsets for workflows. | Forge your own set of enchanted tools, perfectly suited to your craft. |
| 13 | Multi-file operations | Handle multiple files in a single command. | A spell of great efficiency, for when your work spans many scrolls. |
| 14 | Partial file reading | Read specific lines or sections of a file. | A focused scrying spell, for when you need only a fragment of truth. |
| 15 | File format parsing | Automatically parse JSON, YAML, etc. | The ability to see the structure within the raw text, revealing its true form. |
| 16 | Templating for write operations | Use templates to generate content. | Create powerful incantations that can be reused and adapted with ease. |
| 17 | Version control integration | Automatically commit changes to Git. | A seamless bond with the Git archives, ensuring no work is ever lost. |
| 18 | Diff-based editing | Apply diffs or patches for precise edits. | The surgeon's touch. Make the most delicate of changes with perfect accuracy. |
| 19 | Merge conflict resolution | Assist in resolving merge conflicts. | A charm of harmony, to soothe the clash of conflicting code. |
| 20 | Code refactoring suggestions | Get suggestions for refactoring. | A wise whisper in your ear, guiding you toward more elegant solutions. |
| 21 | Interactive editing mode | Step-by-step AI-suggested changes. | A true collaboration with the digital ether, co-creating with the AI. |
| 22 | Undo/redo functionality | Keep a history of changes. | The power to turn back time, correcting any missteps on your path. |

---

### 📜 General Updates from the Scriptorium

*   **Error Handling:** The spirits are now more articulate, providing clearer feedback when a spell goes awry.
*   **Triage Workflows:** The guardians of our GitHub repository have been enhanced for more efficient issue and PR triage.
*   **UI Refinements:** The very look and feel of our CLI has been polished, for a more pleasing and intuitive experience.

---

### ❗ A Wizard's Cautionary Notes

*   **Context is Key:** The wisdom within this scroll is based on the state of the art as of **July 2, 2025**. The digital ether is ever-changing.
*   **Limitations of Power:** Some enchantments, like cached token stats, require the use of an API key. Others, like image generation, are summoned through MCP servers.
*   **Respect the Flow:** The free tier of Gemini 2.5 Pro allows for 60 requests per minute and 1000 per day. Should you require more, you must seek a key of greater power from Google AI Studio or Vertex AI.