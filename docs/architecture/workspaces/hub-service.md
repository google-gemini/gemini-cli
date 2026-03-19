# Detailed Design: Workspace Hub Service

## 1. Introduction
The Workspace Hub is a serverless application (deployed on Cloud Run) that manages the fleet of remote execution environments. It is designed as a deployable, self-service feature for developers and teams.

## 2. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/workspaces` | List all workspaces for the authenticated user. |
| `POST` | `/workspaces` | Request creation of a new GCE-backed workspace. |
| `DELETE` | `/workspaces/:id` | Destroy the VM and clean up Firestore state. |
| `POST` | `/workspaces/:id/stop` | Suspend the GCE instance (cost-saving). |
| `POST` | `/workspaces/:id/start` | Resume a suspended instance. |
| `GET` | `/workspaces/:id/status` | Get real-time status from GCE and Firestore. |

## 3. Firestore State Store
The Hub maintains a centralized state to enable multi-device synchronization.

- **Collection:** `workspaces`
  - `id`: Unique identifier (UUID).
  - `owner_id`: Google User ID (from OAuth).
  - `instance_name`: GCE VM name.
  - `zone`: GCE Zone (e.g., `us-west1-a`).
  - `image_tag`: Docker image tag currently in use.
  - `machine_type`: GCE Machine type (e.g., `e2-standard-4`).
  - `status`: One of `PROVISIONING`, `READY`, `SUSPENDED`, `ERROR`.
  - `last_connected_at`: Timestamp for auto-cleanup logic.
  - `metadata`: `{ repo: string, branch: string, device_id: string }`.

## 4. GCE Lifecycle Management
The Hub uses the GCP Compute Engine Node.js SDK to interact with VMs.

### Provisioning
1.  Verify the user has quota and permissions.
2.  Call `instances.insert` with "Container-on-VM" configuration.
3.  Inject cloud-init or metadata scripts to:
    -   Setup SSH (via IAP).
    -   Configure the memory-only mount for secrets.
    -   Notify the Hub when the container is ready.

### Auto-Cleanup (TTL)
-   A periodic Cloud Scheduler job triggers a `/cleanup` endpoint on the Hub.
-   Idle workspaces (based on `last_connected_at`) are automatically stopped or deleted to prevent unnecessary GCP costs.

## 5. Multi-Tenancy Implementation
-   **Team Mode:** The Hub's service account must have "Compute Admin" roles on the shared project.
-   **Access Control:** Every API request is checked against the `owner_id` in Firestore. Only the owner (or an admin in team mode) can modify or delete a workspace.
-   **Resource Isolation:** Each workspace is an independent VM. There is no sharing of CPU/Memory between workspaces.

## 6. Deployment
The Hub is provided as a Terraform module (`/terraform/workspace-hub/`) for automated setup of:
-   Cloud Run service.
-   Firestore database.
-   Artifact Registry (for Workspace Images).
-   IAM roles and permissions.
