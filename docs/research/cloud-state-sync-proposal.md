# Research Proposal: Cloud State Sync

This document explores the architectural shift of moving the global `~/.gemini`
folder to the cloud. The goal is to enable a shared data store for plans,
settings, and configurations across devices, instances, and sessions while
maintaining performance, security, and portability.

## Objective

Transition Gemini CLI from a local-first state management system to a
distributed, synchronized agent. This allows you to start a task on one machine
(e.g., a local laptop) and resume it seamlessly on another (e.g., a remote
workstation or a different office machine).

## Data Categorization

Not all data within `~/.gemini` should be treated equally. We categorize the
contents to determine the most effective synchronization strategy.

- **Static and Configuration:** `settings.json`, `projects.json`, and `policies/`.
  These are small files with low-frequency updates, making them ideal for simple
  cloud synchronization.
- **Sensitive and Identity:** `google_accounts.json` and `installation_id`. These
  contain refresh tokens and unique identifiers that require high-grade,
  client-side encryption before leaving the device.
- **High-Volume and Ephemeral:** `history/`, `tmp/`, and `antigravity/` (browser
  profiles). These are large or frequently updated. Naive synchronization would
  be slow and resource-intensive.
- **Computed and Environment-Specific:** `extension_integrity.json` and
  `trustedFolders.json`. These often contain absolute local paths that may not
  be valid across different machines or operating systems.

## Architectural Approaches

We are evaluating three primary methods for implementing cloud synchronization.

### Virtual Filesystem (VFS) Layer

Implement an abstraction layer for Node.js `fs` calls that transparently
redirects operations to a cloud provider like GCS or S3.

- **Pros:** Requires minimal changes to existing high-level logic.
- **Cons:** Network latency on every file operation could degrade the user
  experience. Requires a robust local LRU (Least Recently Used) cache.

### Git-Ops and Snapshot Syncing

Automatically commit and push state changes to a private, hidden repository.

- **Pros:** Provides built-in versioning, conflict resolution, and portability.
- **Cons:** High overhead for frequent, small writes, such as session history
  updates.

### Centralized State Server (The "Brain")

Communicate with a lightweight service (gRPC or WebSockets) that acts as the
single source of truth for the agent's state.

- **Pros:** Enables real-time synchronization across active sessions.
- **Cons:** Requires a hosted service and a persistent internet connection.

## Technical Considerations

The following table outlines the primary technical challenges and proposed
solutions for a cloud-synced state.

| Dimension | Challenge | Potential Solution |
| :--- | :--- | :--- |
| **Performance** | Shell startup latency is critical. | **Stale-While-Revalidate:** Load local cache instantly; sync in the background. |
| **Security** | Secrets management in the cloud. | **Zero-Knowledge Encryption:** Encrypt secrets client-side with a user passphrase. |
| **Portability** | Inconsistent absolute paths. | **Path Normalization:** Store paths relative to `$HOME` or use UUIDs. |
| **Conflicts** | Simultaneous edits on multiple devices. | **CRDTs:** Use Conflict-free Replicated Data Types for plans and history. |

## Hybrid Strategy Proposal

A tiered synchronization model balances performance with portability.

1.  **Tier 1 (Cloud Native):** Sync settings, plans, and global memories
    immediately via a structured API.
2.  **Tier 2 (Lazy Sync):** Upload session history and logs at the end of a
    session or when explicitly resuming on another device.
3.  **Tier 3 (Local Only):** Keep large caches, browser profiles, and
    environment-specific integrity checks local to the device.

## Next Steps

To move forward with this proposal, we must perform the following actions:

1.  Audit the current `~/.gemini` directory to determine the typical data
    volume, particularly within the `history/` folder.
2.  Identify all files within `~/.gemini` that contain environment-dependent
    absolute paths.
3.  Prototype a synchronization provider using a private Git repository or a
    dedicated cloud storage bucket.
