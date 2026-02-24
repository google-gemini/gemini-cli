# Trajectory Teleportation: Antigravity to Gemini CLI

This document explains how the Gemini CLI discovers, reads, and converts
Antigravity (Jetski) trajectories to enable session resumption.

## Overview

The teleportation feature allows you to pick up a conversation in the Gemini CLI
that was started in the Antigravity (Jetski) IDE.

## 1. Discovery

The CLI identifies Antigravity sessions by scanning the local filesystem.

- **Storage Location**: `~/.antigravity/conversations`
- **File Format**: Binary Protobuf files with the `.pb` extension.
- **Session IDs**: The filenames (e.g., `f81d4fae-7dec.pb`) serve as the unique
  identifiers for resumption.

## 2. Decryption & Parsing

Since Antigravity stores data in a specialized binary format, the CLI uses a
dedicated teleporter bundle:

- **Logic**: `trajectory_teleporter.min.js` (bundled in
  `@google/gemini-cli-core`).
- **Process**: The binary `.pb` file is read into a Buffer and passed to the
  teleporter's `trajectoryToJson` function, which outputs a standard JavaScript
  object.

## 3. Workspace Identification

To filter sessions by the user's active workspace, the CLI attempts to read the
target workspace from the trajectory.

1. **Primary**: It reads `metadata.workspaces[0].workspaceFolderAbsoluteUri`
   from the top-level trajectory metadata. This is the authoritative data
   populated by the Jetski Go backend.
2. **Fallback**: For older trajectories without top-level metadata, it attempts
   to extract `workspaceUri` from the first user input's
   `activeUserState.activeDocument` context.

## 4. Conversion Logic

The conversion layer
([converter.ts](file:///Users/sshon/developments/gemini-cli/packages/core/src/teleportation/converter.ts))
translates the technical "Steps" of an Antigravity trajectory into the CLI's
`ConversationRecord` format:

- **User Input**: Maps `CORTEX_STEP_TYPE_USER_INPUT` (type 14) to `user`
  messages.
- **Model Responses**: Maps `CORTEX_STEP_TYPE_PLANNER_RESPONSE` (type 15) to
  `gemini` messages.
- **Thoughts & Reasoning**: Extracts reasoning content from the Antigravity step
  and populates the `thoughts` array in the CLI record, preserving the model's
  logic.
- **Tool Calls**: Maps Antigravity tool execution steps to CLI `ToolCallRecord`
  objects. The integration handles these in three main categories:

| Tool Capability      | Gemini CLI Tool                        | Jetski Protobuf Step                            | Teleportation Status     |
| :------------------- | :------------------------------------- | :---------------------------------------------- | :----------------------- |
| **Read File**        | `read_file`                            | `CORTEX_STEP_TYPE_VIEW_FILE`                    | ✅ Native Mapping        |
| **List Directory**   | `ls`                                   | `CORTEX_STEP_TYPE_LIST_DIRECTORY`               | ✅ Native Mapping        |
| **Search Code**      | `grep_search`                          | `CORTEX_STEP_TYPE_GREP_SEARCH`                  | ✅ Native Mapping        |
| **Edit File**        | `replace`                              | `CORTEX_STEP_TYPE_FILE_CHANGE`                  | ✅ Native Mapping        |
| **Search Web**       | `google_web_search`                    | `CORTEX_STEP_TYPE_SEARCH_WEB`                   | ✅ Native Mapping        |
| **Execute Shell**    | `run_shell_command`                    | `CORTEX_STEP_TYPE_RUN_COMMAND`                  | ✅ Native Mapping        |
| **Browser Agent**    | _N/A_ \*                               | `CORTEX_STEP_TYPE_BROWSER_SUBAGENT`             | ❌ Dropped               |
| **User Input**       | `ask_user`                             | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **Read URL Content** | `web_fetch`                            | `CORTEX_STEP_TYPE_READ_URL_CONTENT`             | ❌ Dropped               |
| **Find Files**       | `glob`                                 | `CORTEX_STEP_TYPE_FIND`                         | ❌ Dropped               |
| **Write File**       | `write_file`                           | `CORTEX_STEP_TYPE_WRITE_TO_FILE`                | ❌ Dropped               |
| **Read Many Files**  | `read_many_files`                      | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **Write Todos**      | `write_todos`                          | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **Save Memory**      | `save_memory`                          | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **Docs/Skills**      | `get_internal_docs` & `activate_skill` | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **Plan Mode**        | `enter_plan_mode` & `exit_plan_mode`   | `CORTEX_STEP_TYPE_GENERIC`                      | ⚠️ Generic / MCP         |
| **IDE Actions**      | _N/A_                                  | `VIEW_CODE_ITEM`, `LINT_DIFF`, `ADD_ANNOTATION` | 🚫 Jetski Only (Dropped) |

**1. Native Mappings** Antigravity has specific protobuf message types for
common tool calls, which map directly to the CLI's native tools:

- `CORTEX_STEP_TYPE_VIEW_FILE` -> `read_file`
- `CORTEX_STEP_TYPE_LIST_DIRECTORY` -> `ls`
- `CORTEX_STEP_TYPE_GREP_SEARCH` -> `grep_search`
- `CORTEX_STEP_TYPE_RUN_COMMAND` -> `run_shell_command`
- `CORTEX_STEP_TYPE_FILE_CHANGE` -> `replace`
- `CORTEX_STEP_TYPE_BROWSER_SUBAGENT` -> (Dropped)

**2. Generic & MCP Integrations** Jetski uses `CORTEX_STEP_TYPE_GENERIC` to
handle dynamic or MCP (Model Context Protocol) tool calls that are not hardcoded
into the native protobuf schema.

- The CLI reads the `toolName` and `argsJson` directly from the generic step
  payload and executes them as-is (e.g. `ask_user`, `mcp_*` tools).

**3. Unsupported Tools** Many isolated actions, sub-agent tools, and
IDE-specific UI interactions are dropped by the teleporter to maintain strict
CLI compatibility and preserve valid context-window state.

<details>
<summary><b>Click to view exhaustive list of all 75+ dropped Jetski steps</b></summary>

Any step mapped in `cortex.proto` that isn't functionally replicated by the CLI
is skipped. This includes:

- **Browser UI & Automation**: `CORTEX_STEP_TYPE_BROWSER_CLICK_ELEMENT`,
  `CORTEX_STEP_TYPE_BROWSER_MOVE_MOUSE`, `CORTEX_STEP_TYPE_BROWSER_SUBAGENT`,
  `CORTEX_STEP_TYPE_EXECUTE_BROWSER_JAVASCRIPT`,
  `CORTEX_STEP_TYPE_CAPTURE_BROWSER_SCREENSHOT`,
  `CORTEX_STEP_TYPE_READ_BROWSER_PAGE`, `CORTEX_STEP_TYPE_BROWSER_GET_DOM`,
  `CORTEX_STEP_TYPE_BROWSER_LIST_NETWORK_REQUESTS`,
  `CORTEX_STEP_TYPE_BROWSER_SCROLL_UP`, `CORTEX_STEP_TYPE_OPEN_BROWSER_URL`, and
  15+ other browser controls.
- **IDE & UI Actions**: `CORTEX_STEP_TYPE_VIEW_CODE_ITEM`,
  `CORTEX_STEP_TYPE_LINT_DIFF`, `CORTEX_STEP_TYPE_ADD_ANNOTATION`,
  `CORTEX_STEP_TYPE_VIEW_FILE_OUTLINE`, `CORTEX_STEP_TYPE_CODE_SEARCH`,
  `CORTEX_STEP_TYPE_FIND_ALL_REFERENCES`, `CORTEX_STEP_TYPE_CODE_ACTION`.
- **Agent Framework**: `CORTEX_STEP_TYPE_TASK_BOUNDARY`,
  `CORTEX_STEP_TYPE_NOTIFY_USER`, `CORTEX_STEP_TYPE_INVOKE_SUBAGENT`,
  `CORTEX_STEP_TYPE_CHECKPOINT`, `CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE`,
  `CORTEX_STEP_TYPE_COMMAND_STATUS`, `CORTEX_STEP_TYPE_SEND_COMMAND_INPUT`.
- **Knowledge & Workspace**: `CORTEX_STEP_TYPE_KNOWLEDGE_GENERATION`,
  `CORTEX_STEP_TYPE_KI_INSERTION`, `CORTEX_STEP_TYPE_TRAJECTORY_SEARCH`,
  `CORTEX_STEP_TYPE_MQUERY`, `CORTEX_STEP_TYPE_INTERNAL_SEARCH`,
  `CORTEX_STEP_TYPE_LIST_RESOURCES`, `CORTEX_STEP_TYPE_WORKSPACE_API`.
- **Misc Commands**: `CORTEX_STEP_TYPE_GIT_COMMIT`,
  `CORTEX_STEP_TYPE_GENERATE_IMAGE`, `CORTEX_STEP_TYPE_COMPILE`,
  `CORTEX_STEP_TYPE_CLIPBOARD`, `CORTEX_STEP_TYPE_ERROR_MESSAGE`, etc.

</details>

## 5. Session Resumption

Once converted:

1. The record is injected into the CLI's `ChatRecordingService`.
2. Users can continue the conversation seamlessly via the `/chat resume`
   command.

## Maintenance & Updates

You are correct that if Antigravity's Protobuf definitions change, the
`trajectory_teleporter.min.js` bundle will need to be updated to maintain
compatibility.

### When to Update

- If new step types are added to Antigravity that the CLI should support in
  `converter.ts`.
- If the binary format of the `.pb` files changes.
- If the encryption key or algorithm is rotated.

### How to Regenerate the Bundle

To keep the CLI up to date, you can run the automated build script:

```bash
npm run build:teleporter
```

This runs `packages/core/scripts/build-teleporter.sh`, which automatically:

1. Navigates to the neighboring `Exafunction` directory.
2. Generates the latest Protobuf JS schemas (`pnpm --dir exa/proto_ts build`).
3. Uses `esbuild` to re-bundle the CLI's teleporter script
   (`trajectory_teleporter.ts`) against the fresh schemas.
4. Outputs the new `trajectory_teleporter.min.js` directly into the `gemini-cli`
   source tree.

> [!TIP] In the long term, this logic could be moved to a shared NPM package
> published from the Antigravity repository, allowing the Gemini CLI to stay
> updated via a simple `npm update`.

## Productionization Roadmap

To safely and seamlessly bring the Jetski trajectory teleportation feature to a
fully production-ready state in the Gemini CLI, several key areas need to be
addressed:

### 1. Security & Key Management

- **Dynamic Key Exchange:** Instead of a hardcoded key in the CLI source code,
  the CLI should retrieve the encryption key securely (e.g., from the OS
  Keychain, a local Jetski config file, or by querying the local Jetski daemon).
- **Permission Scoping:** Ensure the CLI enforces the same file-access
  permission rules (`file_permission_request`) that Jetski enforces so the AI
  doesn't suddenly gain destructive permissions when transitioning to the
  terminal.

### 2. Architecture & Build Process Decoupling

- **Shared NPM Package:** Publish the compiled Protobufs and parsing logic as a
  private internal package (e.g., `@google/cortex-teleporter`). The Gemini CLI
  should simply `npm install` this, rather than generating `.min.js` blobs
  manually.
- **Schema Versioning:** Add version checks. If the CLI encounters a trajectory
  from a newer version of Jetski with breaking protobuf changes, it should
  gracefully prompt the user to update the CLI.

### 3. User Experience (UX)

- **Clear UI Indicators:** In the CLI's `/chat resume` menu, Jetski sessions
  should be visually distinct from native CLI sessions (e.g., using a 🛸 icon
  and a "Jetski" tag next to the session name).
- **Missing Context Warnings:** Because we intentionally drop 75+ step types
  (browser actions, IDE UI clicks, etc.), the CLI conversation history might
  look like it has "gaps." The UI should render a small placeholder like:
  `[ ⚠️ Jetski browser action dropped for CLI compatibility ]` so the user
  understands the model did something in the IDE that isn't shown in the
  terminal.
- **Seamless Handoff Prompt:** If the user has a currently active (running)
  Jetski session, the CLI could intelligently prompt them on startup: _"You have
  an active session in Jetski. Type `/resume` to bring it into the terminal."_

### 4. Data Fidelity & Error Handling

- **Graceful Degradation:** If the CLI fails to parse a specific `generic` step
  or misses a tool argument, it shouldn't crash the entire resume process. It
  should skip the broken step and append a system message warning the model.
- **File State Synchronization:** If a user made uncommitted file edits in
  Jetski (e.g., `fileChange` steps that haven't been saved to disk), the CLI
  needs to ensure it doesn't accidentally overwrite or hallucinate disk state.
  It might be worth requiring a file save before teleporting.

### 5. Performance

- **Lazy Loading / Streaming:** When populating the list of sessions for
  `/chat resume`, the CLI shouldn’t decrypt and parse the _entire_ history of
  every file. It should only read the `metadata` headers to render the UI
  picker, and only parse the full multi-megabyte `ConversationRecord` when a
  specific session is selected.
- **Memory Limits:** Set an upper limit on how many historical tool turns the
  CLI loads into memory when teleporting to avoid OOM (Out of Memory) crashes in
  Node.js.
