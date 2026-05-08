# Auto Memory

Auto Memory is an experimental feature that mines your past Gemini CLI sessions
in the background and proposes durable memory updates and reusable
[Agent Skills](./skills.md). You review each candidate before it becomes
available to future sessions: apply memory updates, promote skills, or discard
anything you do not want.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

## Overview

Every session you run with Gemini CLI is recorded locally as a transcript. Auto
Memory scans those transcripts for durable facts, preferences, workflow
constraints, and procedural patterns that recur across sessions. It can draft
memory updates as unified diff `.patch` files and draft reusable procedures as
`SKILL.md` files. All candidates are held in a project-local inbox until you
approve or discard them.

You'll use Auto Memory when you want to:

- **Capture team workflows** that you find yourself walking the agent through
  more than once.
- **Preserve durable project context** such as repeated verification commands,
  local constraints, or personal project notes.
- **Codify hard-won fixes** for project-specific landmines so future sessions
  avoid them.
- **Bootstrap a skills library** without writing every `SKILL.md` by hand.

Auto Memory complements—but does not replace—the
[`save_memory` tool](../tools/memory.md), which captures single facts into
`GEMINI.md` when the agent explicitly calls it. Auto Memory infers candidates
from past sessions, writes reviewable patches or skill drafts, and never applies
them without your approval.

## Prerequisites

- Gemini CLI installed and authenticated.
- At least one idle project session with 10 or more user messages. Auto Memory
  ignores active, trivial, and sub-agent sessions.

## How to enable Auto Memory

Auto Memory is off by default. Enable it in your settings file:

1.  Open your global settings file at `~/.gemini/settings.json`. If you only
    want Auto Memory in one project, edit `.gemini/settings.json` in that
    project instead.

2.  Add the experimental flag:

    ```json
    {
      "experimental": {
        "autoMemory": true
      }
    }
    ```

3.  Restart Gemini CLI. The flag requires a restart because the extraction
    service starts during session boot.

## How Auto Memory works

Auto Memory runs as a background task on session startup. It does not block the
UI, consume your interactive turns, or surface tool prompts.

1.  **Eligibility scan.** The service indexes recent sessions from
    `~/.gemini/tmp/<project>/chats/`. Sessions are eligible only if they have
    been idle for at least three hours and contain at least 10 user messages.
2.  **Lock acquisition.** A lock file in the project's memory directory
    coordinates across multiple CLI instances so extraction runs at most once at
    a time. A state file records processed session versions, and extraction is
    throttled so short back-to-back CLI launches do not repeatedly scan history.
3.  **Candidate extraction.** A background extraction agent reviews the session
    index, reads any sessions that look like they contain durable memory or
    repeated procedural workflows, and drafts candidates. It defaults to
    creating no artifacts unless the evidence is strong, so many runs produce no
    inbox items.
4.  **Safety boundaries.** Auto Memory writes candidates to a review inbox. It
    cannot directly edit active memory files, settings, credentials, or project
    `GEMINI.md` files.
5.  **Patch validation.** Skill update patches are parsed and dry-run before
    they are surfaced. Memory patches are parsed, target-allowlisted, and
    applied atomically only when you approve them from the inbox.
6.  **Notification.** When a run produces new candidates, Gemini CLI surfaces an
    inline message telling you how many items are waiting.

## How to review extracted items

Use the `/memory inbox` slash command to open the inbox dialog at any time:

**Command:** `/memory inbox`

The dialog groups pending items into new skills, skill updates, and memory
updates. From there you can:

- **Read** the full `SKILL.md` body before deciding.
- **Promote** a skill to your user (`~/.gemini/skills/`) or workspace
  (`.gemini/skills/`) directory.
- **Discard** a skill you do not want.
- **Apply** or reject a `.patch` proposal against an existing skill.
- **Review** memory diffs before they touch active files.
- **Apply** or dismiss private and global memory patches. Private patches target
  the project memory directory; global patches target only your personal
  `~/.gemini/GEMINI.md` file.

Promoted skills become discoverable in the next session and follow the standard
[skill discovery precedence](./skills.md#skill-discovery-tiers). Applied memory
patches update the underlying memory files and reload memory for the current
session.

## How to disable Auto Memory

To turn off background extraction, set the flag back to `false` in your settings
file and restart Gemini CLI:

```json
{
  "experimental": {
    "autoMemory": false
  }
}
```

Disabling the flag stops the background service immediately on the next session
start. Existing inbox items remain on disk; you can either drain them with
`/memory inbox` first or remove the project memory directory manually.

## Data and privacy

- Auto Memory only reads session files that already exist locally on your
  machine.
- Auto Memory uses model calls to analyze selected local transcript content
  during extraction. No candidates are applied automatically, but transcript
  excerpts may be sent to the configured model as part of those calls.
- The extraction agent is instructed to redact secrets, tokens, and credentials
  it encounters and to never copy large tool outputs verbatim.
- Drafted skills and memory patches live in your project's memory directory
  until you promote, apply, dismiss, or discard them. They are not automatically
  loaded into any session.

## Limitations

- The extraction agent runs on a preview Gemini Flash model. Extraction quality
  depends on the model's ability to recognize durable patterns versus one-off
  incidents.
- Auto Memory does not extract memory or skills from the current session. It
  only considers sessions that have been idle for three hours or more.
- Project or workspace shared instructions in project `GEMINI.md` files are not
  auto-extractable. Auto Memory can propose private project memory, global
  personal memory, and skills.
- Inbox items are stored per project. Skills extracted in one workspace are not
  visible from another until you promote them to the user-scope skills
  directory.

## Next steps

- Learn how skills are discovered and activated in [Agent Skills](./skills.md).
- Explore the [memory management tutorial](./tutorials/memory-management.md) for
  the complementary explicit-memory and `GEMINI.md` workflows.
- Review the experimental settings catalog in
  [Settings](./settings.md#experimental).
