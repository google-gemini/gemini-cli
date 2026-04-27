# Global Configuration Serialization and Reliability Hardening

This PR addresses a P1 issue where CLI settings modified via `/settings` were
not persisted to `~/.gemini/settings.json`, particularly on Windows systems.

## Changes

### 1. Resilient JSON Writing (`commentJson.ts`)

- Modified `updateSettingsFilePreservingFormat` to handle empty or
  whitespace-only files. Previously, an empty file would cause `comment-json` to
  throw a `SyntaxError`, which was caught and resulted in a silent early return.
- Added a fallback to initialize `parsed` as an empty object if `parse()`
  returns `null` or an empty string.
- Added defensive error handling around `fs.writeFileSync` to emit user-visible
  feedback via `coreEvents` if a write fails.

### 2. Batched Settings persistence (`settings.ts`)

- Added support for "batching" setting updates by introducing a `skipSave`
  option to `setValue` and a public `save()` method to `LoadedSettings`.
- Refactored `migrateDeprecatedSettings` to use this batching mechanism. Instead
  of performing a synchronous read-modify-write cycle for every single migrated
  field (which caused `EACCES` race conditions on Windows), it now collects all
  modified scopes and performs a single save per scope at the end.
- Improved the startup performance of `loadSettings` by consolidating all
  migrations into one disk operation.

## Verification

### Automated Tests

- Verified with a dedicated script that empty, whitespace-only, and malformed
  (containing `null`) settings files are now correctly initialized and updated
  without error.
- Verified that multiple rapid updates (migrations) result in the expected final
  file state with consolidated disk writes.

### Manual Verification

- Confirmed that changes made in the `/settings` UI now reliably persist to disk
  on Windows.
- Confirmed that startup migrations (e.g., `disableAutoUpdate` ->
  `enableAutoUpdate`) work correctly and persist on the first run.
