# Mission: GCE Container-First Refactor 🚀

## Current State
- **Architecture**: Persistent GCE VM (`gcli-offload-mattkorwel`) with Fast-Path SSH (`gcli-worker`).
- **Logic**: Decoupled scripts in `~/.offload/scripts`, using Git Worktrees for concurrency.
- **Auth**: Scoped GitHub PATs mirrored via setup.

## The Goal (Container-OS Transition)
Shift from a "Manual VM" to an "Invisible VM" (Container-Optimized OS) that runs our Sandbox Docker image directly.

## Planned Changes
1. **Multi-Stage Dockerfile**: 
   - Optimize `Dockerfile.gemini-maintainer` to include `tsx`, `vitest`, `gh`, and a pre-warmed repository.
   - Base it on the existing `google-gemini-cli-sandbox`.
2. **Setup Script (`setup.ts`)**:
   - Refactor `provision` to use `gcloud compute instances create-with-container`.
   - Configure the VM to launch the container as the primary entrypoint.
3. **Orchestrator (`orchestrator.ts`)**:
   - Update SSH logic to include the `--container` flag.
   - Ensure `rsync` still maps to the persistent home directory that is mounted into the container.

## How to Resume
1. Load the checkpoint: `/checkpoint load offload-container-refactor` (if available).
2. Tell Gemini: *"Read .gemini/skills/offload/NEXT_MISSION.md and start Phase 1: The Multi-Stage Dockerfile."*
