# Gemini CLI: Tool Sandboxing Implementation Tasks

This document outlines the engineering plan to integrate Codex's OS-level sandboxing (macOS Seatbelt, Linux Bubblewrap/Seccomp, Windows Restricted Tokens/ACLs) into the Gemini CLI execution flow. 

These tasks are structured as Epics (Parent Tasks) and Issues (Sub-tasks) suitable for importing into GitHub or Linear.

---

## Epic 1: Foundation - Sandbox Manager & Configuration

**Description:** Establish the core interfaces, configuration models, and service injection points necessary to support OS-specific sandboxing without breaking the existing execution flow.

### Task 1.1: Update Configuration Schema for Sandboxing
**Assignee:** TBD
**Description:**
We need to extend the Gemini CLI configuration to support sandbox settings.
* **Action:** Update `Config` and `ConfigSchema` in `packages/core/src/config/config.ts`.
* **Details:**
  * Add a `sandbox` block.
  * Fields: `enabled` (boolean, default false for now), `allowedPaths` (array of strings, e.g., workspace roots, `/tmp`), `networkAccess` (boolean or string enum).
* **Acceptance Criteria:** `gemini-cli` can parse and validate a configuration file containing the new `sandbox` block.

### Task 1.2: Implement `SandboxManager` Base Service
**Assignee:** TBD
**Description:**
Create the abstract service responsible for preparing a command to run inside a sandbox.
* **Action:** Create `packages/core/src/services/sandboxManager.ts`.
* **Details:**
  * Define the `SandboxManager` interface with a method like `prepareCommand(req: SandboxRequest): Promise<SandboxedCommand>`.
  * The `SandboxRequest` should include the original command, arguments, `cwd`, environment variables, and the `sandbox` config block.
  * The `SandboxedCommand` should return a possibly mutated `program` and `args` array (e.g., returning `sandbox-exec` as the program and the original command as args).
  * Implement a `StandardSandboxManager` that handles platform-specific logic.
* **Acceptance Criteria:** The interface is defined and available via the dependency injection container.

### Task 1.3: Intercept Execution in `ShellExecutionService`
**Assignee:** TBD
**Description:**
Modify the core execution engine to route commands through the `SandboxManager` before spawning.
* **Action:** Update `packages/core/src/services/shellExecutionService.ts`.
* **Details:**
  * Inject the `SandboxManager` into `ShellExecutionService`.
  * Before calling `node-pty.spawn` or `child_process.spawn`, pass the command payload to `sandboxManager.prepareCommand()`.
  * Use the returned `program` and `args` to perform the actual spawn.
* **Acceptance Criteria:** When sandboxing is disabled, tool execution behaves exactly as it did before.

---

## Epic 2: macOS Seatbelt Integration

**Description:** Implement the Tier 1 Tool Sandboxing for macOS using `/usr/bin/sandbox-exec` and dynamically generated `.sb` profiles.

### Task 2.1: Seatbelt Profile Generation
**Assignee:** TBD
**Description:**
* **Action:** Implement `generateSeatbeltProfile` in `packages/core/src/services/sandboxManager.ts`.
* **Details:**
  * Take `allowedPaths` and dynamically generate a Scheme/Lisp formatted Seatbelt profile.
  * Include essential "Life Support" rules: `mach-lookup` for `logd`, `sysmond`, and `trustd`.
  * Broaden `file-map-executable` to ensure system libraries can load.
  * Explicitly handle Git Worktree detection to allow access to external `.git` metadata directories.
* **Acceptance Criteria:** Standard binaries like `ls`, `cat`, and `git` run successfully without triggering `Signal 6` (SIGABRT).

### Task 2.2: Implement `MacOsSandboxManager` logic
**Assignee:** TBD
**Description:**
Connect the profile generator to the execution pipeline.
* **Details:**
  * In `prepareCommand`, generate the `.sb` string.
  * Write this string to a secure, temporary file (`/tmp/gemini-sandbox-<id>/sandbox.sb`).
  * Return `program: '/usr/bin/sandbox-exec'` and `args: ['-f', '<tmp_profile_path>', ...originalCmd]`.
* **Acceptance Criteria:** Commands executed on macOS with sandboxing enabled correctly invoke `sandbox-exec`.

---

## Epic 3: Linux Bubblewrap & Seccomp Integration

**Description:** Implement Tool Sandboxing for Linux using `bwrap` for namespaces and a Seccomp BPF filter for syscall restriction.

### Task 3.1: Implement Bubblewrap Argument Generation
**Assignee:** TBD
**Description:**
Generate the `bwrap` CLI arguments to isolate the filesystem.
* **Action:** Update `StandardSandboxManager` to handle Linux.
* **Details:**
  * Map `allowedPaths` to `bwrap` binds. E.g., `--ro-bind / / --bind <workspace> <workspace> --dev-bind /dev /dev --unshare-all`.
  * Ensure `/dev/pts` is correctly mounted to allow `node-pty` to function.
* **Acceptance Criteria:** `prepareCommand` correctly outputs `bwrap` as the program with the appropriate isolation flags.

---

## Epic 4: Windows Restricted Tokens & ACLs

**Description:** Implement Tool Sandboxing for Windows using Win32 API security primitives.

### Task 4.1: Develop Windows Sandbox N-API Addon
**Assignee:** TBD
**Description:**
Node.js lacks native APIs for token manipulation. We must build an addon.
* **Action:** Create a Rust `napi-rs` module or C++ `node-addon-api` module.
* **Details:**
  * Implement logic to call `CreateRestrictedToken`.
  * Expose functions to call `SetEntriesInAclW` to dynamically grant "Allow" ACEs for the workspace directory.
* **Acceptance Criteria:** The Node.js application can successfully invoke the addon methods to retrieve a restricted token handle.

---

## Epic 5: Network Proxies & Egress Control

**Description:** Restrict network egress across all platforms, ensuring the agent cannot exfiltrate data.

### Task 5.1: Implement Loopback Proxy & Rules
**Assignee:** TBD
**Description:**
Route allowed network traffic through a managed proxy.
* **Action:** Update all platform sandbox managers.
* **Details:**
  * **macOS:** Add Seatbelt rules explicitly denying network except to specific ports or using `(allow network-outbound)`.
  * **Linux:** Ensure `bwrap --unshare-net` is active if network is disabled.
* **Acceptance Criteria:** Network access is strictly controlled by the sandbox manager based on policy.

---

## Epic 6: Dynamic Sandbox Expansion & `sandboxing.toml`

**Description:** Implement a user-guided workflow that allows the sandbox to evolve based on real-world tool usage. Instead of a static profile, the agent will detect failures and propose atomic permission updates stored in a dedicated configuration file.

### Task 6.1: Implement `sandboxing.toml` Schema & Parser
**Assignee:** TBD
**Description:**
Create a dedicated, human-readable TOML file for local sandbox overrides.
* **Action:** Define the schema and implement a parser.
* **Details:**
  * Support fields like `extraAllowedPaths` (array of strings), `allowNetwork` (boolean or domain list), and `binaryWhitelists`.
  * The loader should look for this file in the project root or `.gemini/sandboxing.toml`.
  * The `SandboxManager` must be updated to merge these rules into the OS-specific profile generation logic.
* **Acceptance Criteria:** Changing a path in `sandboxing.toml` immediately reflects in the next generated sandbox execution.

### Task 6.2: Sandbox Violation Heuristics (Failure Detection)
**Assignee:** TBD
**Description:**
Enable the agent to distinguish between a "tool error" and a "sandbox block."
* **Action:** Update `ShellExecutionService` to analyze exit signals and error codes.
* **Details:**
  * Detect specific signatures: `Signal 6` (SIGABRT on macOS), `Exit 128` (Git repository/worktree errors), and `EPERM` (Permission Denied).
  * When a block is suspected, extract the paths or resources the command was attempting to access.
* **Acceptance Criteria:** The execution engine provides a "Security Hint" in the internal error object when a sandbox violation is detected.

### Task 6.3: Interactive Permission Expansion Workflow
**Assignee:** TBD
**Description:**
Implement the user-facing loop for approving new permissions.
* **Action:** Create a handler in the agent logic to process sandbox failures.
* **Details:**
  * If a command fails due to a sandbox violation, the agent uses `ask_user` to propose an update.
  * *Example Prompt:* "It looks like `nvim` was blocked. Would you like to permanently allow read/write access to `~/.config/nvim` in your `sandboxing.toml`?"
  * On approval, the agent automatically updates the TOML file.
* **Acceptance Criteria:** A user can "fix" a sandbox failure for a new tool in 1-2 interactive turns.

### Task 6.4: OS-Specific Rule Translators for Expansion
**Assignee:** TBD
**Description:**
Ensure that generic paths in `sandboxing.toml` are correctly translated across OS boundaries.
* **Action:** Update the `generateSeatbeltProfile` (macOS) and `bwrap` argument generator (Linux).
* **Details:**
  * Handle tilde expansion (`~/`) and environment variables in the TOML paths.
* **Acceptance Criteria:** A single `sandboxing.toml` entry works correctly across all supported operating systems.

---

## Epic 7: Governance & Secret Protection

**Description:** Prevent the AI from tampering with its own security boundaries or accessing sensitive environment secrets.

### Task 7.1: Implementation of "Write-Protected" Governance Files
**Assignee:** TBD
**Description:**
Ensure that the "Constitution" of the repository cannot be modified by the AI.
* **Details:** Update the `SandboxManager` to explicitly add `deny file-write` rules for `.gitignore` and `.geminiignore`. 
* **Acceptance Criteria:** A shell command like `rm .gitignore` or `sed -i ... .gitignore` fails with "Permission Denied" even when the tool has workspace-wide write access.

### Task 7.2: Secret Visibility Lockdown (`.env`)
**Assignee:** TBD
**Description:**
Protect API keys and credentials stored in environment files.
* **Details:** Add strict "Deny Read/Write" rules for any file named `.env` or matching `.env.*`.
* **Acceptance Criteria:** `cat .env` returns "Permission Denied." The file is effectively invisible to the sandboxed tool.

---

## Epic 8: Cross-Platform Ignore Enforcement

**Description:** Implement a generic, OS-agnostic system to ensure that any file pattern listed in `.gitignore` or `.geminiignore` is strictly inaccessible at the kernel level.

### Task 8.1: Platform-Agnostic Ignore Resolver
**Assignee:** TBD
**Description:**
Create a core service to resolve ignore patterns into absolute paths.
* **Action:** Implement `packages/core/src/services/ignoreResolver.ts`.
* **Details:**
  * Uses standard glob-matching logic.
  * Consolidates rules from `.gitignore` and `.geminiignore`.
  * Outputs a standardized `ForbiddenResource` list.
* **Acceptance Criteria:** The service correctly identifies `node_modules/` or `.env` as forbidden regardless of the OS it's running on.

### Task 8.2: Standardized "Deny" Interface in `SandboxManager`
**Assignee:** TBD
**Description:**
Update the base sandbox interface to handle forbidden resources.
* **Action:** Update the `prepareCommand` signature to accept `forbiddenPaths`.
* **Details:** Pass the list of standardized forbidden resources to the platform-specific implementation.
* **Acceptance Criteria:** Every OS-specific driver receives the same list of paths to block.

### Task 8.3: OS-Specific "Deny" Implementations
**Assignee:** TBD
**Description:**
Implement the actual blocking mechanism for each OS.
* **Details:**
  * **macOS (Seatbelt)**: Generate `(deny file-read* file-write* (subpath "/path"))`.
  * **Linux (Bubblewrap)**: Ensure the forbidden path is **not** mounted into the namespace.
  * **Windows (Restricted Tokens)**: Apply a "Deny" Access Control Entry (ACE) to the specific file/folder for the restricted SID used by the tool.
* **Acceptance Criteria:** A shell command `cat secret.txt` returns a "Permission Denied" error on all platforms if `secret.txt` is ignored.

---

## Team Parallelization Strategy (3 Engineers)

To maximize velocity, implementation is divided by Platform Ownership. Each engineer is responsible for the full security stack on their respective OS, while coordinating on shared core logic.

### Engineer A: macOS Platform Lead
*   **Primary Focus**: Epic 2 (macOS Integration) & Epic 1 (Foundation).
*   **Tasks**: 
    * Implement the macOS `sandbox-exec` driver.
    * **Epic 5 Lead**: Design and implement the shared loopback proxy logic and the macOS network enforcement rules.
    * Implement macOS "translators" for ignore rules and governance files.
*   **Shared Responsibility**: Leads the design of the generic `SandboxManager` interface.

### Engineer B: Linux Platform Lead
*   **Primary Focus**: Epic 3 (Linux Integration) & Epic 8 (Ignore Enforcement).
*   **Tasks**: 
    * Implement `bwrap` integration and the native Seccomp helper.
    * **Epic 8 Lead**: Build the generic "Ignore Resolver" that parses glob patterns for all platforms.
    * **Epic 7 Lead**: Build the shared "Governance" logic to protect `.gitignore` and `.env` files.
    * Implement Linux "translators" for governance and network rules.

### Engineer C: Windows Platform Lead
*   **Primary Focus**: Epic 4 (Windows Integration) & Epic 6 (Dynamic Expansion).
*   **Tasks**: 
    * Develop the Rust/N-API addon and native process spawning for Windows.
    * **Epic 6 Lead**: Build the shared interactive "Permission Expansion" loop and `sandboxing.toml` orchestration.
    * Implement Windows "translators" for ignore rules, network, and governance.

### Milestone Map
1.  **Week 1 (Interface Alignment)**: Engineer A/B/C agree on the `prepareCommand` signature and the standardized `ForbiddenResource` list.
2.  **Week 2-3 (Parallel Implementation)**: Each engineer implements the drivers for their specific OS. Engineer B and C also build the "Shared Core" modules (Ignore Resolver and Expansion Loop) in parallel.
3.  **Week 4 (Cross-Platform Validation)**: Unified testing to ensure a single `sandboxing.toml` file works correctly on all three systems.

hello world
