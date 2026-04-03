## Highlights example 1

- **Plan Mode Enhancements**: Significant updates to Plan Mode, including new
  commands, support for MCP servers, integration of planning artifacts, and
  improved iteration guidance.
- **Core Agent Improvements**: Enhancements to the core agent, including better
  system prompt rigor, improved subagent definitions, and enhanced tool
  execution limits.
- **CLI UX/UI Updates**: Various UI and UX improvements, such as autocomplete in
  the input prompt, updated approval mode labels, DevTools integration, and
  improved header spacing.
- **Tooling & Extension Updates**: Improvements to existing tools like
  `ask_user` and `grep_search`, and new features for extension management.
- **Bug Fixes**: Numerous bug fixes across the CLI and core, addressing issues
  with interactive commands, memory leaks, permission checks, and more.
- **Context and Tool Output Management**: Features for observation masking for
  tool outputs, session-linked tool output storage, and persistence for masked
  tool outputs.

## Highlights example 2

- **Commands & UX Enhancements:** Introduced `/prompt-suggest` command,
  alongside updated undo/redo keybindings and automatic theme switching.
- **Expanded IDE Support:** Now offering compatibility with Positron IDE,
  expanding integration options for developers.
- **Enhanced Security & Authentication:** Implemented interactive and
  non-interactive OAuth consent, improving both security and diagnostic
  capabilities for bug reports.
- **Advanced Planning & Agent Tools:** Integrated a generic Checklist component
  for structured task management and evolved subagent capabilities with dynamic
  policy registration.
- **Improved Core Stability & Reliability:** Resolved critical environment
  loading, authentication, and session management issues, ensuring a more robust
  experience.
- **Background Shell Commands:** Enabled the execution of shell commands in the
  background for increased workflow efficiency.

## Highlights example 3

- **Event-Driven Architecture:** The CLI now uses an event-driven scheduler for
  tool execution, improving performance and responsiveness. This includes
  migrating non-interactive flows and sub-agents to the new scheduler.
- **Enhanced User Experience:** This release introduces several UI/UX
  improvements, including queued tool confirmations and the ability to expand
  and collapse large pasted text blocks. The `Settings` dialog has been improved
  to reduce jitter and preserve focus.
- **Agent and Skill Improvements:** Agent Skills have been promoted to a stable
  feature. Sub-agents now use a JSON schema for input and are tracked by an
  `AgentRegistry`.
- **New `/rewind` Command:** A new `/rewind` command has been implemented to
  allow users to go back in their session history.
- **Improved Shell and File Handling:** The shell tool's output format has been
  optimized, and the CLI now gracefully handles disk-full errors during chat
  recording. A bug in detecting already added paths has been fixed.
- **Linux Clipboard Support:** Image pasting capabilities for Wayland and X11 on
  Linux have been added.

## Highlights example 4

- **Improved Hooks Management:** Hooks enable/disable functionality now aligns
  with skills and offers improved completion.
- **Custom Themes for Extensions:** Extensions can now support custom themes,
  allowing for greater personalization.
- **User Identity Display:** User identity information (auth, email, tier) is
  now displayed on startup and in the `stats` command.
- **Plan Mode Enhancements:** Plan mode has been improved with a generic
  `Checklist` component and refactored `Todo`.
- **Background Shell Commands:** Implementation of background shell commands.
