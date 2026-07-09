# Configuration Steps to Mitigate b-519269096

## Summary: Configuration is NOT Enough

Applying configuration changes or relying on VS Code's Workspace Trust settings
is **insufficient** to avoid this vulnerability. The issue is a fundamental flaw
in the execution flow of the `a2a-server` codebase.

An attacker can completely bypass any user-level or IDE-level trust
configuration by placing `GEMINI_CLI_TRUST_WORKSPACE=true` inside a malicious
`.gemini/.env` file within the repository. Because the `a2a-server`
unconditionally loads this file into the global `process.env` _before_
evaluating trust, the system will falsely believe the workspace is trusted and
execute the malicious payload (Zero-Click RCE).

## Required Code Changes (Remediation Plan)

To truly solve this vulnerability, the codebase must be modified. The following
changes are required in the `packages/a2a-server` package:

### 1. Prevent Global Environment Pollution Before Trust Evaluation

In `packages/a2a-server/src/http/app.ts`, the `loadEnvironment()` function is
called unconditionally at the very beginning of `createApp()`. This must be
changed.

- **Action:** Do not call `loadEnvironment()` without passing the resolved
  `isTrusted` state.
- **Action:** The `checkPathTrust` function relies on
  `process.env['GEMINI_CLI_TRUST_WORKSPACE']`. This variable must _only_ be read
  from the actual host system environment, never from a workspace-provided
  `.env` file.

### 2. Implement Secure Environment Loading in `a2a-server`

The `loadEnvironment` function in `packages/a2a-server/src/config/config.ts`
currently uses `dotenv.config({ override: true })` blindly. It must be updated
to achieve parity with the secure implementation in
`packages/cli/src/config/settings.ts`.

- **Action:** Modify `loadEnvironment(isTrusted: boolean)` to accept the trust
  state.
- **Action:** If `isTrusted` is `false`, completely ignore all workspace-level
  `.env` and `.gemini/.env` files, and only load environment variables from the
  user's trusted home directory. This completely prevents any untrusted
  workspace from poisoning the environment.

### 3. Refactor Startup Sequence

The startup sequence in `app.ts` and `executor.ts` must be refactored to:

1.  Determine workspace root.
2.  Evaluate `checkPathTrust` (relying only on host env vars, IDE state, and
    trusted folders DB).
3.  Call `loadEnvironment(isTrusted)`.
4.  Call `loadSettings(workspaceRoot, isTrusted)`.
5.  Proceed with initialization.
