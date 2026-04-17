# Documentation Audit Results - 2026-04-13

## Summary

Audit initiated to ensure documentation correctness and style consistency. All
69 documentation files identified in `sidebar.json` were considered.

## Phase 1: Editor Audit Findings

| File Path                             | Violation Description                                                                | Recommendation                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `docs/index.md`                       | Link Quality: Uses absolute path `/docs/contributing`.                               | Change to relative path `./contributing.md`.                                  |
| `docs/get-started/index.md`           | Voice and Tone: Repetitive use of "Gemini CLI" in a single sentence.                 | Rephrase to be more concise.                                                  |
| `docs/get-started/index.md`           | Voice and Tone: Uses "Gemini" instead of "Gemini CLI" in prompt examples.            | Replace "Gemini" with "Gemini CLI".                                           |
| `docs/get-started/index.md`           | Poor Vocabulary: Uses "You wish to" instead of "You want to".                        | Replace "wish to" with "want to".                                             |
| `docs/cli/cli-reference.md`           | Punctuation: Missing comma after "for example".                                      | Add comma: "(for example, --resume 5)".                                       |
| `docs/releases.md`                    | Casing: "Github-hosted" should be "GitHub-hosted".                                   | Correct casing.                                                               |
| `docs/releases.md`                    | Link Quality: Uses absolute path `(npm.md)`.                                         | Change to relative path `(./npm.md)`.                                         |
| `docs/releases.md`                    | Passive Voice: "smoke testing should be performed".                                  | Change to "Perform smoke testing".                                            |
| `docs/releases.md`                    | Passive Voice: "Smoke testing ... is recommended".                                   | Change to "We recommend performing smoke testing" -> "Perform smoke testing". |
| `docs/cli/plan-mode.md`               | Formatting: Mode names (Default, Auto-Edit, Plan) are not bolded.                    | Bold mode names as UI elements.                                               |
| `docs/local-development.md`           | Lack of Conciseness: Uses "allows you to".                                           | Replace with "lets you".                                                      |
| `docs/resources/quota-and-pricing.md` | Terminology: Uses "limit on your quota" redundantly.                                 | Streamline phrasing.                                                          |
| `docs/resources/quota-and-pricing.md` | Punctuation: Uses curly apostrophe in "It’s".                                        | Replace with straight apostrophe.                                             |
| `docs/resources/quota-and-pricing.md` | Passive Voice: "Requests are limited", "usage is governed", "requests will be made". | Rephrase to active voice.                                                     |
| `docs/contributing.md`                | Missing Overview: Document lacks a brief overview paragraph.                         | Add a brief overview.                                                         |

## Phase 2: Software Engineer Audit Findings

| Feature/Setting               | Description                                   | Documentation Status  | Recommendation                                           |
| ----------------------------- | --------------------------------------------- | --------------------- | -------------------------------------------------------- |
| `general.enableNotifications` | Run-event notifications for prompts/sessions. | Undocumented.         | Add to `docs/cli/notifications.md`.                      |
| `ui.escapePastedAtSymbols`    | Prevents unintended @path expansion on paste. | Undocumented.         | Add to `docs/cli/settings.md`.                           |
| `ui.compactToolOutput`        | Structured display for tool outputs.          | Undocumented.         | Add to `docs/cli/settings.md`.                           |
| `security.enableConseca`      | Context-Aware Security Checker (LLM-based).   | Undocumented.         | Create `docs/cli/conseca.md` or add to `security.md`.    |
| `experimental.worktrees`      | Automated Git worktree management.            | Partially documented. | Update `docs/cli/git-worktrees.md` with setting details. |
| `update_topic` Tool           | Topic & status reporting for agents.          | Partially documented. | Add to `docs/reference/tools.md` with links.             |
| `tracker_*` Tools             | Task dependency and progress tracking.        | Partially documented. | Add to `docs/reference/tools.md` with links.             |
| `jitContext` Setting          | Just-In-Time context loading.                 | Undocumented.         | Add to `docs/cli/settings.md`.                           |

## Overall Recommendation

The docset requires a general pass to convert "the Gemini CLI" to "Gemini CLI",
replace "we/they/the user" with "you", and fix passive voice. Automated settings
regeneration should be run after manual edits.
