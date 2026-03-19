# Mission: GCE Container-First Refactor 🚀

## Current State
- **Architecture**: Persistent GCE VM (`gcli-workspace-mattkorwel`) with Fast-Path SSH (`gcli-worker`).
- **Logic**: Decoupled scripts in `~/.workspace/scripts`, using Git Worktrees for concurrency.
- **Auth**: Scoped GitHub PATs mirrored via setup.

## The Goal (Container-OS Transition)
Shift from a "Manual VM" to an "Invisible VM" (Container-Optimized OS) that runs our Sandbox Docker image directly.

## Planned Changes
1. **Multi-Stage Dockerfile**: ✅ VERIFIED
   - Optimize `.gcp/Dockerfile.maintainer` to include `tsx`, `vitest`, `gh`, and system dependencies (`libsecret`, `build-essential`).
   - *Verified locally: Node v20, GH CLI, Git, TSX, and Vitest are functional with required headers.*
2. **Dedicated Pipeline**:
   - Use `.gcp/maintainer-worker.yml` for isolated builds.
   - **Tagging Strategy**: 
     - `latest`: Automatically updated on every merge to `main`.
     - `branch-name`: Created on-demand for PRs via `/gcbrun` comment.
3. **Setup Script (`setup.ts`)**:
   - Refactor `provision` to use `gcloud compute instances create-with-container`.
   - Point to the new `maintainer` image in Artifact Registry.
4. **Orchestrator (`orchestrator.ts`)**:
   - Update SSH logic to include the `--container` flag.

## GCP Console Setup (Two Triggers)

### Trigger 1: Production Maintainer Image (Automatic)
1. **Event**: Push to branch.
2. **Branch**: `^main$`.
3. **Configuration**: Point to `.gcp/maintainer-worker.yml`.
4. **Purpose**: Keeps the stable "Golden Image" up to date for daily use.

### Trigger 2: On-Demand Testing (Comment-Gated)
1. **Event**: Pull request.
2. **Base Branch**: `^main$`.
3. **Comment Control**: Set to **"Required"** (e.g. `/gcbrun`).
4. **Configuration**: Point to `.gcp/maintainer-worker.yml`.
5. **Purpose**: Allows developers to test infrastructure changes before merging.

## Phase 2: Refactoring setup.ts for Container-OS
This phase is currently **ARCHIVED** in favor of the Persistent Workstation model. 

### Implementation Logic (Snapshot)
The orchestrator should launch isolated containers using this pattern:
```bash
docker run --rm -it \
  --name workspace-job-id \
  -v ~/dev/worktrees/job-id:/home/node/dev/worktree:rw \
  -v ~/dev/main:/home/node/dev/main:ro \
  -v ~/.gemini:/home/node/.gemini:ro \
  -w /home/node/dev/worktree \
  maintainer-image:latest \
  sh -c "tsx ~/.workspace/scripts/entrypoint.ts ..."
```

## How to Resume
1. Review the archived container-launch logic above.
2. Update `setup.ts` to use `gcloud compute instances create-with-container`.
3. Update `orchestrator.ts` to use `docker run` instead of standard `ssh`.
