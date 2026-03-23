# Plan: Worker Provider Abstraction for Workspace System

## Objective

Abstract the remote execution infrastructure (GCE COS, GCE Linux, Cloud
Workstations) behind a common `WorkerProvider` interface. This eliminates
infrastructure-specific prompts (like "use container mode") and makes the system
extensible to new backends.

## Architectural Changes

### 1. New Provider Abstraction

Create a modular provider system where each infrastructure type implements a
standard interface.

- **Base Interface**: `WorkerProvider` (methods for `exec`, `sync`, `provision`,
  `getStatus`).
- **Implementations**:
  - `GceCosProvider`: Handles COS with Cloud-Init and `docker exec` wrapping.
  - `GceLinuxProvider`: Handles standard Linux VMs with direct execution.
  - `LocalDockerProvider`: (Future) Runs workspace tasks in a local container.
  - `WorkstationProvider`: (Future) Integrates with Google Cloud Workstations.

### 2. Auto-Discovery

Modify `setup.ts` to:

- Prompt for a high-level "Provider Type" (e.g., "Google Cloud (COS)", "Google
  Cloud (Linux)").
- Auto-detect environment details where possible (e.g., fetching internal IPs,
  identifying container names).

### 3. Clean Orchestration

Refactor `orchestrator.ts` to be provider-agnostic:

- It asks the provider to "Ensure Ready" (wake VM).
- It asks the provider to "Prepare Environment" (worktree setup).
- It asks the provider to "Launch Task" (tmux initialization).

## Implementation Steps

### Phase 1: Infrastructure Cleanup

- Move existing procedural logic from `fleet.ts`, `setup.ts`, and
  `orchestrator.ts` into a new `providers/` directory.
- Create `ProviderFactory` to instantiate the correct implementation based on
  `settings.json`.

### Phase 2: Refactor Scripts

- **`fleet.ts`**: Proxy all actions (`provision`, `rebuild`, `stop`) to the
  provider.
- **`orchestrator.ts`**: Use the provider for the entire lifecycle of a job.
- **`status.ts`**: Use the provider's `getStatus()` method to derive state.

### Phase 3: Validation

- Verify that the `gcli-worker` SSH alias and IAP tunneling remain functional.
- Ensure "Fast-Path SSH" is still the primary interactive gateway.

## Verification

- Run `workspace:fleet provision` and ensure it creates a COS-native worker.
- Run `workspace:setup` and verify it no longer asks cryptic infrastructure
  questions.
- Launch a review and verify it uses `docker exec internally for the COS
  provider.
