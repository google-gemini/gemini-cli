# GitService: The Shadow History Architecture

The `GitService` is the core mechanism for **Lineage Preservation** within the Gemini CLI. It functions as a "Shadow Git"—a parallel, hidden version control system that tracks the state of the workspace independently of the user's primary git repository.

## 1. The Concept: Shadow History

Standard AI tools treat code generation as ephemeral. If an AI breaks your code, you have to hope `Ctrl+Z` works.

The Gemini CLI treats code generation as **State Transitions**. Every change made by the agent is checkpointed.

*   **User's Git:** Tracks *intentional* commits (features, fixes).
*   **Shadow Git:** Tracks *operational* states (every file modification, every AI thought).

## 2. The Architecture

### Location
The shadow repository is not located in your project root (which would pollute your workspace). It lives in the global Gemini data directory:

```text
~/.gemini/history/<PROJECT_HASH>/
```

*   `PROJECT_HASH`: SHA-256 of the project's absolute path.
*   This ensures every project has a unique, isolated shadow history.

### Isolation
The Shadow Git is explicitly isolated from your user configuration:
*   **Config:** It uses a dedicated `.gitconfig` (user: "Gemini CLI").
*   **Ignored Files:** It respects your `.gitignore` to avoid tracking artifacts, but maintains its own separate index.
*   **Work Tree:** It uses your project root as the "Work Tree" but keeps the `.git` directory external.

## 3. The Phoenix Protocol: Sovereign Injection

As of the **Sovereign Runtime** update, the `GitService` is no longer just a passive logger. It is an active **Gatekeeper**.

The `createFileSnapshot` method (which creates commits) has been injected with the **Iff Operator** (`validateTransition`).

```typescript
// packages/core/src/services/gitService.ts

async createFileSnapshot(message: string): Promise<string> {
  // 1. Measure Drift (Entropy)
  const currentDrift = measureEntropy();

  // 2. The Sovereign Lock
  if (!validateTransition(proof, currentDrift)) {
    throw new Error('MAGNETIC QUENCH: Hamiltonian Drift Check Failed.');
  }

  // 3. Commit (Crystallization)
  return repo.commit(message);
}
```

This ensures that the "Shadow History" is a **Clean Lineage**. The system physically cannot record a state that violates the laws of physics defined in `governance/physics.ts`.

## 4. Key Functions

*   `initialize()`: Sets up the shadow repo if missing.
*   `createFileSnapshot(message)`: The "Crystallize" action. Captures state + Phoenix Check.
*   `restoreProjectFromSnapshot(hash)`: The "Rollback" action. Reverts the workspace to a previous sovereign state.
