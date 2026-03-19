# Gemini Workspaces: Maintainer Onboarding

Gemini Workspaces allow you to offload heavy tasks (PR reviews, agentic fixes, full builds) to a high-performance GCP worker. It uses a **Unified Data Disk** architecture to ensure your work persists even if the VM is deleted or recreated.

## 1. Local Prerequisites
Before starting, ensure you have:
*   **GCloud CLI**: Authenticated (`gcloud auth login`).
*   **GitHub CLI**: Authenticated (`gh auth login`).
*   **Project Access**: A GCP Project ID where you have `Editor` or `Compute Admin` roles.

## 2. Initialization
Run the setup script using `npx tsx` to ensure all dependencies are available:

```bash
npx tsx .gemini/skills/workspaces/scripts/setup.ts
```

**What happens during setup:**
1.  **Auth Discovery**: It will detect your `GEMINI_API_KEY` (from `~/.env`) and `GH_TOKEN`.
2.  **Project Choice**: You will be prompted for your GCP Project and Zone.
3.  **Infrastructure Check**: It verifies if your worker (`gcli-workspace-<user>`) exists.
4.  **SSH Magic**: It generates a local `.gemini/workspaces/ssh_config` for seamless access.

## 3. Provisioning
If the setup informs you that the worker was not found, provision it:

```bash
npx tsx .gemini/skills/workspaces/scripts/fleet.ts provision
```
*This creates a VM with a 10GB Boot Disk and a 200GB Data Disk. Initialization takes ~1 minute.*

## 4. Finalizing Remote Setup
Run the setup script one last time to clone the repo and sync credentials:

```bash
npx tsx .gemini/skills/workspaces/scripts/setup.ts
```
*When you see "ALL SYSTEMS GO!", your workspace is ready.*

## 5. Daily Usage
Once initialized, you can launch tasks directly through `npm`:

*   **Review a PR**: `npm run workspace <PR_NUMBER> review`
*   **Fix a PR**: `npm run workspace <PR_NUMBER> fix`
*   **Check Status**: `npx tsx .gemini/skills/workspaces/scripts/status.ts`
*   **Stop Worker**: `npx tsx .gemini/skills/workspaces/scripts/fleet.ts stop` (Recommended when finished to save cost).

## Troubleshooting
*   **Permission Denied (Docker)**: The orchestrator handles this by using `sudo docker` internally.
*   **Dubious Ownership**: The system automatically adds `/mnt/disks/data/main` to Git's safe directory list.
*   **Missing tsx**: Always prefer `npx tsx` when running scripts manually.
