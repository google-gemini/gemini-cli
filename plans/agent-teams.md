# Agent Teams: Research & Implementation Specification

This document serves as a detailed design specification for the "Agent Teams"
feature. It is intended to be used as a blueprint for implementation by an
automated agent.

## Core Concept

Agent Teams are specialized collections of sub-agents orchestrated by the
top-level Gemini CLI agent. Each team provides a set of tools (via its agents)
and a set of instructions (via `TEAM.md`) that guide the top-level agent on how
to delegate work effectively.

## Architecture & Data Flow

### 1. Storage & Discovery

Teams are stored in `.gemini/teams/`. Each team is a directory containing:

- `TEAM.md`: A Markdown file with YAML frontmatter for metadata (`name`,
  `display_name`, `description`) and a body containing orchestration
  instructions.
- `agents/`: A sub-directory containing standard agent definitions (`.md` files)
  that comprise the team.

### 2. Core Components

- **`TeamDefinition`**: The internal representation of a team, including its
  instructions and associated `AgentDefinition`s.
- **`TeamLoader`**: Responsible for scanning the filesystem, parsing `TEAM.md`,
  and loading team agents.
- **`TeamRegistry`**: Central manager for all discovered teams and the active
  team session state.
- **`SubagentTool` Prioritization**: Logic in the `ToolRegistry` or `Config` to
  surface team-specific agents as preferred tools.

### 3. Orchestration

The top-level Gemini CLI agent is modified to be "team-aware":

- Its **System Prompt** is dynamically updated to include the active team's
  instructions.
- It is instructed to **prioritize delegation** to team agents for tasks
  matching the team's purpose.

### 4. User Experience

- **Startup Selection**: Users are prompted to select a team on launch if
  multiple teams are available and no default is set.
- **Active Team Indicator**: A clear visual status in the CLI showing the
  currently active team.

## Execution Order

The implementation should follow this strict sequence to ensure a solid
foundation before moving to UI:

1. **TASK-01**: Core Types, Loader, and Registry.
2. **TASK-02**: Integration into `Config` and lifecycle management.
3. **TASK-03**: Prompt Engineering and Tool Prioritization logic.
4. **TASK-04**: CLI Startup UX (Selection Dialog).
5. **TASK-05**: CLI Main UI (Status Indicator) and Sample Team creation.
