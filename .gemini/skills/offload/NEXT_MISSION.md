# Mission: GCE Container-First Refactor 🚀

## Current State
- **Architecture**: Persistent GCE VM (`gcli-offload-mattkorwel`) with Fast-Path SSH (`gcli-worker`).
- **Logic**: Decoupled scripts in `~/.offload/scripts`, using Git Worktrees for concurrency.
- **Auth**: Scoped GitHub PATs mirrored via setup.

## The Goal (Container-OS Transition)
Shift from a "Manual VM" to an "Invisible VM" (Container-Optimized OS) that runs our Sandbox Docker image directly.

## Planned Changes
1. **Multi-Stage Dockerfile**: 
   - Optimize `.gcp/Dockerfile.maintainer` to include `tsx`, `vitest`, `gh`, and system dependencies (`libsecret`, `build-essential`).
2. **Dedicated Pipeline**:
   - Use `.gcp/maintainer-worker.yml` for isolated PR builds.
   - **Tagging Strategy**: Dual-tag images with `${SHORT_SHA}` (immutable) and `${CLEAN_BRANCH}` (latest-on-branch).
3. **Setup Script (`setup.ts`)**:
   - Refactor `provision` to use `gcloud compute instances create-with-container`.
   - Point to the new `maintainer` image in Artifact Registry.
4. **Orchestrator (`orchestrator.ts`)**:
   - Update SSH logic to include the `--container` flag.

## GCP Console Setup (Manual Action)
To enable the automatic maintainer image builds on PRs:
1. **Create Trigger**: Go to **Cloud Build > Triggers** and create a new trigger.
2. **Event**: Set to **Pull Request**.
3. **Source**: Select the `google-gemini/gemini-cli` repository.
4. **Configuration**: Point to `.gcp/maintainer-worker.yml` in the repo.
5. **Filters**: Set the base branch to `^main$`.
6. **Service Account**: Ensure it has `Artifact Registry Writer` permissions.

## How to Resume
1. Load the checkpoint: `/checkpoint save offload-container-refactor` (if available).
2. Tell Gemini: *"Read .gemini/skills/offload/NEXT_MISSION.md and start Phase 3: Refactoring setup.ts for Container-OS."*
