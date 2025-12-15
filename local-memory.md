# Implementation Plan: Project-Level Memory Integration

## Objective

Enable `save_memory` tool to save memories to a project-specific `GEMINI.md`
file when operating within a project context, rather than defaulting to the
global user-level memory file. This prevents context pollution across different
projects.

## Analysis

- **Current Behavior**: `MemoryTool` saves all memories to `~/.gemini/GEMINI.md`
  (or configured global file).
- **Desired Behavior**:
  - If the user is in a project context, memories should default to the
    project's `GEMINI.md`.
  - Support a mechanism (e.g., `scope` parameter) to explicitly choose between
    'project' and 'global' memory.
- **Key Components**:
  - `packages/core/src/tools/memoryTool.ts`: Core logic for memory saving.
  - `packages/core/src/config/config.ts`: Instantiation of `MemoryTool`.
  - `packages/core/src/tools/tools.ts`: Tool definitions.

## Design

### 1. Update `MemoryTool` Class (`packages/core/src/tools/memoryTool.ts`)

- **Constructor Injection**: Update constructor to accept a `Config` object.
  This allows access to the current project's root directory (`targetDir` or
  `cwd`).
- **Schema Update**:
  - Add an optional `scope` parameter to the `save_memory` tool schema.
  - Type: `string` (enum: `['project', 'global']`).
  - Description: "The scope of the memory. 'project' saves to the current
    project's context, 'global' saves to the user's shared context. Defaults to
    'project' if inside a project."
- **Path Resolution Logic**:
  - Modify `getMemoryFilePath(scope?: 'project' | 'global')` (refactor
    `getGlobalMemoryFilePath`).
  - If `scope` is 'global', return the global path (existing logic).
  - If `scope` is 'project':
    - Determine the project root from the injected `Config`.
    - Construct path: `path.join(projectRoot, getCurrentGeminiMdFilename())`.
  - If `scope` is undefined:
    - Default to 'project' if a project root is detected/configured.
    - Fallback to 'global' if no project context is found.

### 2. Update Tool Registration (`packages/core/src/config/config.ts`)

- In `createToolRegistry`, pass the `Config` instance (`this`) when
  instantiating `MemoryTool`.

### 3. Verification & Testing

- **Unit Tests (`packages/core/src/tools/memoryTool.test.ts`)**:
  - Mock `Config`.
  - Test saving with `scope='global'` (verifies legacy behavior).
  - Test saving with `scope='project'` (verifies new behavior).
  - Test default behavior when `Config` has a valid project root.
  - Test default behavior when `Config` has NO project root (should fallback to
    global).
- **Manual Verification**:
  - Initialize a dummy project.
  - Use `/sys` or prompt to trigger `save_memory`.
  - Verify the memory appears in the project's `GEMINI.md` and not the global
    one.

## Step-by-Step Plan

1.  **Refactor `MemoryTool`**:
    - Modify `packages/core/src/tools/memoryTool.ts` to import `Config`.
    - Update `MemoryTool` class to store `config` instance.
    - Update `memoryToolSchemaData` to include `scope`.
    - Implement `determineMemoryFilePath(scope)` logic.
    - Update `execute` method to use the determined path.

2.  **Update Config Integration**:
    - Edit `packages/core/src/config/config.ts` to pass `this` to
      `new MemoryTool(...)`.

3.  **Update Tests**:
    - Fix existing tests in `packages/core/src/tools/memoryTool.test.ts` to
      accommodate the new constructor signature.
    - Add new test cases for project-scoped memory.

4.  **Review**:
    - Ensure backwards compatibility (global memory still accessible).
    - Check for edge cases (e.g., project `GEMINI.md` doesn't exist - should it
      be created? Yes, per existing logic for global).
