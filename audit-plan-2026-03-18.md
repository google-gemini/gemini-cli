# Documentation Audit Plan - 2026-03-18

This audit plan identifies areas for improvement in the Gemini CLI documentation
set to ensure 100% coverage, technical accuracy, and adherence to the
information architecture and style standards.

## Audit Matrix

| Page                                           | Status | Violations                                                                                                                               |
| :--------------------------------------------- | :----- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/index.md`                                | PASS   |                                                                                                                                          |
| `docs/get-started/index.md`                    | PASS   |                                                                                                                                          |
| `docs/get-started/installation.md`             | PASS   |                                                                                                                                          |
| `docs/get-started/authentication.md`           | PASS   |                                                                                                                                          |
| `docs/get-started/examples.md`                 | PASS   |                                                                                                                                          |
| `docs/cli/cli-reference.md`                    | FAIL   | Case Error: "CLI Options"                                                                                                                |
| `docs/get-started/gemini-3.md`                 | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/file-management.md`        | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/skills-getting-started.md` | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/memory-management.md`      | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/shell-commands.md`         | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/session-management.md`     | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/task-planning.md`          | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/web-tools.md`              | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/mcp-setup.md`              | PASS   |                                                                                                                                          |
| `docs/cli/tutorials/automation.md`             | PASS   |                                                                                                                                          |
| `docs/extensions/index.md`                     | PASS   |                                                                                                                                          |
| `docs/cli/skills.md`                           | FAIL   | Case Error: "Key Benefits", "Skill Discovery Tiers", "Managing Skills", "In an Interactive Session", "From the Terminal", "How it Works" |
| `docs/cli/checkpointing.md`                    | PASS   |                                                                                                                                          |
| `docs/cli/headless.md`                         | PASS   |                                                                                                                                          |
| `docs/hooks/index.md`                          | PASS   |                                                                                                                                          |
| `docs/hooks/reference.md`                      | PASS   |                                                                                                                                          |
| `docs/ide-integration/index.md`                | PASS   |                                                                                                                                          |
| `docs/tools/mcp-server.md`                     | PASS   |                                                                                                                                          |
| `docs/cli/model-routing.md`                    | PASS   |                                                                                                                                          |
| `docs/cli/model.md`                            | PASS   |                                                                                                                                          |
| `docs/cli/model-steering.md`                   | PASS   |                                                                                                                                          |
| `docs/cli/notifications.md`                    | PASS   |                                                                                                                                          |
| `docs/cli/plan-mode.md`                        | FAIL   | Missing mandatory experimental note; Case Error: "Tool Restrictions", "Automatic Model Routing", "Research Subagents"                    |
| `docs/core/subagents.md`                       | FAIL   | Case Error in multiple headings; Missing/Inconsistent experimental note                                                                  |
| `docs/core/remote-agents.md`                   | FAIL   | Case Error: "Remote Subagents", "Managing Subagents"                                                                                     |
| `docs/cli/rewind.md`                           | PASS   |                                                                                                                                          |
| `docs/cli/sandbox.md`                          | PASS   |                                                                                                                                          |
| `docs/cli/settings.md`                         | FAIL   | Case Error: "HooksConfig" -> "Hooks config"                                                                                              |
| `docs/cli/telemetry.md`                        | PASS   |                                                                                                                                          |
| `docs/cli/token-caching.md`                    | PASS   |                                                                                                                                          |
| `docs/cli/custom-commands.md`                  | PASS   |                                                                                                                                          |
| `docs/cli/enterprise.md`                       | PASS   |                                                                                                                                          |
| `docs/cli/gemini-ignore.md`                    | PASS   |                                                                                                                                          |
| `docs/cli/generation-settings.md`              | PASS   |                                                                                                                                          |
| `docs/cli/gemini-md.md`                        | PASS   |                                                                                                                                          |
| `docs/cli/system-prompt.md`                    | FAIL   | Case Error: "Variable Substitution"                                                                                                      |
| `docs/cli/themes.md`                           | PASS   |                                                                                                                                          |
| `docs/cli/trusted-folders.md`                  | PASS   |                                                                                                                                          |
| `docs/contributing.md`                         | PASS   |                                                                                                                                          |
| `docs/integration-tests.md`                    | PASS   |                                                                                                                                          |
| `docs/issue-and-pr-automation.md`              | PASS   |                                                                                                                                          |
| `docs/local-development.md`                    | PASS   |                                                                                                                                          |
| `docs/npm.md`                                  | PASS   |                                                                                                                                          |
| `docs/reference/keyboard-shortcuts.md`         | FAIL   | Case Error in almost all subheadings (Title Case instead of Sentence case)                                                               |
| `docs/reference/memport.md`                    | FAIL   | Case Error: "Best Practices"                                                                                                             |
| `docs/reference/policy-engine.md`              | FAIL   | Case Error: "Standard Locations", "Supplemental Admin Policies", "Security Requirements"                                                 |
| `docs/reference/tools.md`                      | FAIL   | Missing tracker tools; Possible outdated parameters                                                                                      |

## Net-new content

- **Task Tracker:** Document `experimental.taskTracker` and associated tools
  (`tracker_create_task`, `tracker_update_task`, `tracker_get_task`,
  `tracker_list_tasks`, `tracker_add_dependency`, `tracker_visualize`).
- **Gemma Model Router:** Document `experimental.gemmaModelRouter`.
- **Tool Output Masking:** Document `experimental.toolOutputMasking`.
- **New Commands:** Document `/corgi`, `/agents`.

## Strategy for updates

1.  **Surgical Fixes:** Apply sentence case and missing experimental notes to
    all FAILED pages.
2.  **Feature Documentation:** Create a new page `docs/cli/task-tracker.md` and
    link it from `tools.md` and `index.md`.
3.  **Tool Reference Update:** Add the missing tools to
    `docs/reference/tools.md`.
4.  **Settings Sync:** Ensure `docs/cli/settings.md` includes the new
    experimental settings found in `settingsSchema.ts`.

## Handover

Strategist phase complete. Transitioning to Engineer/Writer role to apply
changes.
