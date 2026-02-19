# Task Tracker Implementation Plan

This document outlines the phased implementation of the Git-backed, graph-based
Task Tracker for Gemini CLI.

## Phase 1: Foundation & Data Model

**Goal:** Establish the storage mechanism and the core task schema.

### Tasks

- [x] **Storage Infrastructure:**
  - Implement a `TrackerService` in `packages/core/src/services/`.
  - Create logic to manage `.tracker/tasks/` directory.
  - Implement 6-character alphanumeric ID generation (hex).
- [x] **Data Model (JSON Schema):**
  - `id`: string (6 chars)
  - `title`: string
  - `description`: string
  - `type`: `epic` | `task` | `bug`
  - `status`: `open` | `in_progress` | `blocked` | `closed`
  - `parentId`: string (optional)
  - `dependencies`: string[] (list of IDs)
  - `subagentSessionId`: string (optional)
  - `metadata`: object (optional)
- [x] **Graph Validation Logic:**
  - Prevent `closed` status if dependencies are not `closed`.
  - Ensure no circular dependencies.

**Success Criteria:** Can manually create and read task files with valid schemas
and basic dependency checks.

---

## Phase 2: CRUD Tools & Visualization

**Goal:** Enable the agent to interact with the tracker via CLI tools.

### Tasks

- [x] **Infrastructure:**
  - [x] Add `trackerEnabled` to `ConfigParams` and `Config` in `packages/core`.
  - [x] Guard tracker tool registration in `Config.createToolRegistry`.
  - [x] Add `experimental.taskTracker` to `SETTINGS_SCHEMA` in `packages/cli`.
  - [x] Pass `taskTracker` setting to `Config` in `loadCliConfig`.
- [x] **Core Tools:**
  - [x] `tracker_init`: Setup `.tracker` in current workspace.
  - [x] `tracker_create_task`: Create a new JSON node.
  - [x] `tracker_update_task`: Modify existing node (handle status transitions).
  - [x] `tracker_get_task`: Retrieve single task details.
  - [x] `tracker_list_tasks`: Filtered list (by status, parent, etc.).
- [x] **Relationship Tools:**
  - [x] `tracker_add_dependency`: Link two existing tasks.
- [x] **CLI Visualization:**
  - [x] `tracker_visualize`: Render ASCII tree with emojis (⭕, 🚧, ✅, 🚫).
- [x] **Testing:**
  - [x] Implement integration tests in `trackerTools.test.ts`.

**Success Criteria:** Tools are registered and usable in the CLI;
`tracker_visualize` shows a clear hierarchy.

---

## Phase 3: System Instruction (SI) & Integration

**Goal:** Shift the agent's behavior to treat the tracker as the Single Source
of Truth (SSOT).

### Tasks

- [ ] **System Instruction Update:**
  - Inject the "TASK MANAGEMENT PROTOCOL" into the core prompt.
  - Mandate use of `tracker_list_tasks` at session start.
- [ ] **Plan Mode Integration:**
  - Implement `tracker_hydrate(planPath)` to turn a plan into tracker nodes.
- [ ] **Session Restoration:**
  - Modify the startup flow to check for existing `.tracker` and prompt the
    agent to resume pending tasks.

**Success Criteria:** Agent stops using markdown checklists and consistently
uses `tracker_create_task` for multi-step goals.

---

## Phase 4: Persistence & Advanced Features

**Goal:** Ensure long-term durability and multi-agent support.

### Tasks

- [ ] **Git Synchronization:**
  - `tracker_sync`: Commit the `.tracker` directory to the current branch.
- [ ] **Git Worktree (V2):**
  - Implement mounting a `tracker-data` orphan branch to `.tracker/` to allow
    cross-branch persistence.
- [ ] **Subagent Coordination:**
  - Update `SubagentService` to automatically update the tracker when a subagent
    is spawned.

**Success Criteria:** Task state persists across branch switches and multiple
agent sessions.
