# Phase 1 Sub-plan: The Workspace Core

## 1. Objective

Establish the foundational execution environment (Container Image) and the
initial management service (Hub API).

## 2. Tasks

### Task 1.1: Define and Build Workspace Image

Create a Dockerfile that provides a complete, persistent development environment
for `gemini-cli`.

- [x] Create `packages/workspace-manager/docker/Dockerfile`.
- [x] Include: `node:20-slim`, `git`, `gh`, `rsync`, `tmux`, `shpool`.
- [x] Add the pre-built `gemini-cli` binary.
- [x] Define `entrypoint.sh` with secret injection and `shpool` daemon startup.
- [x] Verify image build locally: `docker build -t gemini-workspace:v1 .`.

### Task 1.2: Workspace Hub API (v1)

Implement the core API to manage GCE-based workspaces.

- [x] Initialize `packages/workspace-manager/`.
- [x] Implement Express server for `/workspaces` (List, Create, Delete).
- [x] Integrate Firestore to track workspace state (owner, instance_id, status).
- [ ] Integrate `@google-cloud/compute` for GCE instance lifecycle.
- [ ] Provision a VM with `Container-on-VM` settings pointing to the
      `gemini-workspace` image.

### Task 1.3: Cloud Run Deployment (v1)

Prepare the Hub for self-service deployment.

- [ ] Create `packages/workspace-manager/terraform/` for basic Hub provisioning.
- [ ] Setup IAP/OAuth authentication on the Cloud Run endpoint.

## 3. Verification & Success Criteria

- **Image:** A container started from the image must have `gemini --version` and
  `gh --version` available.
- **API:** A `POST /workspaces` call must result in a new VM appearing in the
  specified GCP project with the correct container image.
- **State:** Firestore must correctly reflect the VM's `PROVISIONING` and
  `READY` status.

## 4. Next Steps

- Implement Task 1.2: Integrate `@google-cloud/compute` for GCE instance
  lifecycle.
