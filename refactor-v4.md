## **Refactoring Plan: A Dynamic, Nested Command Architecture**

**Version: 4.1**
**Status: In Progress**

### 1. Overview

This document outlines the definitive strategy for re-architecting the slash command system within the AI coding agent CLI. This plan synthesizes previous refactoring efforts with critical architectural feedback to create a system that is clean, scalable, and highly extensible.

The core of this refactor is twofold:

1.  **Adopt a Nested Command Structure:** We will move from a flat list of commands to a recursive tree structure (`/command subcommand ...args`). This allows for logical grouping of related functionality, enhances discoverability, and drastically cleans up the implementation of commands with sub-options (e.g., `/memory`, `/chat`).
2.  **Implement a Dynamic `CommandService`:** We will create a central service responsible for discovering command definitions from multiple sources—our internal codebase and user-defined configuration files—and constructing the unified command tree.

This plan establishes the foundation for a best-in-class user-defined command feature, a key strategic goal for driving deep user engagement and workflow automation.

### 2. Problem Statement & Strategic Goal

The original `slashCommandProcessor` hook was monolithic and difficult to maintain. While initial refactoring efforts began decoupling commands, they did not address two fundamental issues:

- **Structural Complexity:** Commands with sub-options (like `/memory show|add|refresh`) were implemented with brittle `switch` statements, violating the Single Responsibility Principle.
- **Lack of Extensibility:** The system had no capacity for loading commands defined by the user, a critical feature for long-term product value and a standard in the competitive landscape.

The goal of this refactor is to deliver a command system that is **structurally sound, dynamically extensible, and provides a superior user experience.**

### 3. Architectural Solution

The new architecture is composed of three primary components that work in concert.

**A. The Nested `SlashCommand` Interface:**
This recursive data structure, adopted from leadership feedback, is the canonical model for all commands.

```typescript
// The standardized contract for any command in the system.
export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;

  // The action to run. Optional for parent commands that only group sub-commands.
  action?: (
    context: CommandContext,
    args: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;

  // Provides argument completion (e.g., completing a tag for `/chat resume <tag>`).
  completion?: (
    context: CommandContext,
    partialArg: string,
  ) => Promise<string[]>;

  // The key to the nested structure, allowing commands to have children.
  subCommands?: SlashCommand[];
}
```

**B. The `CommandService`:**
This service is the heart of the dynamic system. It is the single source of truth for the command tree.

- **Responsibilities:**
  - **Discover:** Scan all sources for command definitions:
    1.  **Built-in:** Load `SlashCommand` objects exported from our internal TypeScript modules.
    2.  **File-System:** Discover and parse user-defined `.gemini.yml` files from project and user directories.
  - **Build Tree:** Recursively parse all definitions and assemble the final, unified `SlashCommand[]` tree.
  - **Provide:** Expose the complete command tree to the UI hooks via a `getCommandTree()` method.

**C. Custom Command Definition (`.gemini.yml`):**
A structured YAML format will allow users to define their own nested commands. The interaction model will support inline arguments and flags, deferring interactive prompting for a future iteration.

_Example `.gemini/commands/git.gemini.yml`:_

```yaml
# A top-level namespace for git commands
name: git
description: Commands for interacting with the git repository.

subCommands:
  - name: summary
    description: 'Generates a summary of the most recent git commits.'
    prompt: |
      Analyze the output of `git log -n 15 --oneline` and provide a concise summary of the recent changes.

  - name: commit
    description: 'Creates a conventional commit message for staged changes.'
    args:
      - name: type
        description: 'Commit type (e.g., feat, fix, chore).'
        required: true
    prompt: |
      Generate a conventional commit message of type '{{type}}' for the currently staged changes.
```

_Invocation Example:_ `/git commit --type feat`

### 4. Implementation Strategy & Progress

This plan requires us to revisit some completed steps to align with the new, superior architecture.

---

#### **Phase 1: Revise Foundation & Implement Nested Structure (✅ Complete)**

This phase re-established the foundation based on the nested command model.

**Tasks:**

1.  **Revise Core Interfaces:**
    - **Status:** ✅ **DONE**
    - **Action:** Updated the core command interface in `types.ts` to the new recursive `SlashCommand` structure.
    - **Action:** Ensured the `action` and `completion` function signatures retain the `CommandContext` for dependency injection.

2.  **Refactor `CommandService`:**
    - **Status:** ✅ **DONE**
    - **Action:** Modified the service's internal state to hold a `SlashCommand[]` tree.
    - **Action:** Implemented discovery logic to load built-in command modules (`memoryCommand.ts`, `helpCommand.ts`, etc.).

3.  **Refactor Built-in Commands as a Tree:**
    - **Status:** ✅ **DONE**
    - **Action:** Created `packages/cli/src/ui/commands/memoryCommand.ts` and defined a nested `SlashCommand` object for `/memory`. Migrated `/help` and `/clear` to the new system.
    - **Action:** Confirmed the `CommandService` successfully loads these modules.

4.  **Implement Tree-Aware UI Logic:**
    - **Status:** ✅ **DONE**
    - **Action:** Refactored the `handleSlashCommand` function in the `useSlashCommandProcessor` hook inside of `slashCommandProcessor.ts` to use a tree-traversal algorithm for execution.
    - **Action:** Implemented the "parent command help" feature, which displays subcommand descriptions.
    - **Action:** Refactored the `useCompletion` hook and `<Help/>` component to be context-aware and correctly handle nested structures.

---

#### **Progress & Key Decisions (as of v4.1)**

The Proof of Concept for Phase 1 was a success, validating the core architecture.

- **Architectural Validation:** The `CommandService` → `SlashCommand` tree → UI Hook data flow is confirmed to be effective and scalable. The nested `SlashCommand` interface is robust.
- **Legacy Coexistence Strategy:** A key decision was made on how to handle the transition from the old command system. An **adapter pattern** was implemented within `useSlashCommandProcessor` to temporarily map remaining `LegacySlashCommand` objects to the new `SlashCommand` interface. This allows for a gradual, per-command migration without breaking existing functionality and keeps UI components like `<Help/>` clean.
  - _Snippet: `handleSlashCommand` Fallback_

    ```typescript
    // In handleSlashCommand:
    // ... (New tree traversal logic runs first) ...
    if (commandToExecute) {
      // ... (Execute new command) ...
    }

    // --- Legacy Fallback Logic ---
    // If no command was found in the new system, check the legacy list.
    for (const cmd of legacyCommands) {
      if (mainCommand === cmd.name || mainCommand === cmd.altName) {
        // ... (Execute legacy command) ...
      }
    }
    ```

- **Dependency Injection:** The `CommandContext` object has been successfully established as the standard dependency injection mechanism for all new commands. This is critical for testability and separation of concerns.

**Outcome of Phase 1:** The system is fully based on the new nested architecture. The `/memory`, `/help`, and `/clear` commands are served by the new system, demonstrating nested execution, completion, and help generation. The foundation for custom commands is correctly in place.

---

#### **Phase 2: Full Migration & Custom Command Implementation (🚀 In Progress)**

With the correct foundation now built, we will complete the migration and enable user extensibility.

**Tasks:**

1.  **Complete Internal Command Migration (NEXT UP):**
    - **Action:** Methodically migrate all remaining commands from the `legacyCommands` array (`/chat`, `/stats`, `/docs`, etc.) into the new nested `SlashCommand` structure, creating a separate `[commandName]Command.ts` file for each.
2.  **Implement YAML Parser & Generic Action:**
    - **Action:** Enhance the `CommandService` to discover and recursively parse the nested `.gemini.yml` files from user (`~/.config/gemini/commands/`) and project (`<project>/.gemini/commands/`) directories.
    - **Action:** Create the generic `action` function for file-based commands. This action will be responsible for parsing inline arguments (`args` string), substituting them into the `prompt` template, and returning the final prompt to be sent to the AI.
3.  **Harden Custom Command Features:**
    - **Action:** Implement robust inline argument parsing (handling flags, quotes).
    - **Action:** Add validation for required arguments defined in the YAML.
    - **Action:** Provide clear error messages for malformed definitions or incorrect usage.
4.  **Implement Scaffolding Tool:**
    - **Action:** Create `/command new` to guide users in creating custom command files.

---

#### **Phase 3: Finalization & UX Polish**

This final phase focuses on cleanup and delivering a polished user experience.

**Tasks:**

1.  **Remove Legacy Code:** Once all commands are migrated, delete the `legacyCommands` array and any remaining adapter code from `slashCommandProcessor.ts`.
2.  **Implement Command Palette:** Implement a Ctrl+K-style Command Palette for a superior command discovery experience, which is essential for a large and dynamic command set.
3.  **Final Review:** Conduct a final architectural review of the hook, service, and command definitions.

### 5. Future Evolution

This architecture positions us for powerful future enhancements with minimal friction:

- **Tool Orchestration:** The YAML format can be extended with a `steps` array, allowing commands to chain AI prompts and `tool_calls`.
- **Remote Discovery (MCP):** The `CommandService` can be taught to fetch and integrate prompts from MCP endpoints into the command tree.
- **Extension Ecosystem:** This service-oriented architecture is the first step toward a potential SDK for third-party extensions.
