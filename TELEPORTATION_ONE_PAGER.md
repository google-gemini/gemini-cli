# One-Pager: Session Teleportation (External Tool Resumption)

## 1. Objective

Enable Gemini CLI users to seamlessly resume work sessions (trajectories) that
were originated and executed in external coding tools or IDE extensions. This
"teleportation" of sessions establishes Gemini CLI as a centralized hub for
AI-assisted development across various environments.

## 2. Background & Motivation

Developers frequently switch between multiple tools (e.g., IDE extensions,
web-based coding assistants, and the terminal). Currently, context is
fragmented; a session started in an external tool cannot be natively continued
in Gemini CLI. By allowing Gemini CLI to parse and ingest trajectories from
these external tools, we prevent context loss, avoid duplicate work, and
significantly enhance developer productivity.

## 3. Goals & Non-Goals

**Goals:**

- Provide a standardized abstraction (`TrajectoryProvider`) for fetching
  external session histories.
- Implement a core translation layer (`teleporter` module) to map external tool
  actions (e.g., `find`, `search_web`, `read_url`, `write_to_file`) to Gemini
  CLI's native tool formats.
- Update the `/resume` CLI command to display and filter these external sessions
  alongside native ones.
- Support dynamic loading of new trajectory providers via the extension system.

**Non-Goals:**

- Two-way sync: We do not intend to export Gemini CLI sessions back to the
  originating external tool in this phase.
- Perfect fidelity for unsupported external tools: Only explicitly supported and
  mapped tools will be translated. Others will be gracefully ignored or logged
  as plain text.

## 4. Proposed Design / Architecture

The design revolves around a pluggable architecture that decouples the fetching
of external trajectories from the core CLI logic.

### 4.1. `TrajectoryProvider` Interface

A standard contract that external extensions implement. It defines methods for:

- Retrieving a list of available sessions.
- Fetching the full trajectory payload for a specific session ID.
- Providing metadata (display name, icon, source tool name) for the CLI UI.

### 4.2. Core `teleporter` Module

This module acts as the ingestion engine. It performs:

- **Deserialization:** Parsing the raw JSON/format of the external tool.
- **Conversion:** Mapping external tool calls (e.g., an Antigravity `search_web`
  call) into the equivalent Gemini CLI tool call format, ensuring the LLM
  understands the historical context correctly.
- **Validation:** Ensuring the resulting session history conforms to Gemini
  CLI's internal session schema.

### 4.3. UI Integration (`/resume`)

The `SessionBrowser` UI will be updated to handle multiple sources.

- Introduce dynamic tabs or source filters in the TUI (Terminal UI).
- Display metadata (e.g., "Imported from Tool X", timestamps) to help users
  distinguish between native and teleported sessions.

### 4.4. Extension Manager Updates

Enhance the existing `extensionLoader` to discover, load, and register plugins
that implement the `TrajectoryProvider` interface dynamically at runtime.

## 5. Rollout Plan

The implementation is broken down into incremental PRs tracked by Epic #22801:

1. **Define Core Interfaces:** Establish `TrajectoryProvider`.
2. **Implement Translation Logic:** Build the `teleporter` module with initial
   conversion mappings.
3. **UI Updates:** Hook the providers into the `/resume` interface.
4. **Extension Support:** Enable dynamic loading of providers.
5. **Documentation:** Publish `TELEPORTATION.md` outlining how to build new
   providers.

## 6. Security & Privacy

- **Local First:** Trajectories should be read from local filesystem artifacts
  or secure local IPC mechanisms where possible, avoiding unnecessary network
  calls.
- **Data Sanitization:** The conversion process must not execute any historical
  commands; it strictly translates historical records into past-tense context
  for the LLM.
