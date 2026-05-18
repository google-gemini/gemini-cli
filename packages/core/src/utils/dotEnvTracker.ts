/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tracks environment variable keys that were loaded from the project's .env
 * file so they can be excluded from child process environments, preventing
 * project-level .env values from overriding subprocess configurations (e.g.
 * phpunit.xml test database settings being overridden by a Laravel .env).
 *
 * Process-scoped singleton: the CLI runs as a single process with one active
 * workspace directory at a time, so per-session scoping is not required here.
 * The set is bounded by the number of keys in a single .env file (typically
 * tens of entries), so unbounded growth is not a concern.
 */

const dotEnvKeys: Set<string> = new Set();

export function recordDotEnvKeys(keys: Iterable<string>): void {
  for (const key of keys) {
    dotEnvKeys.add(key);
  }
}

export function getDotEnvKeys(): ReadonlySet<string> {
  return dotEnvKeys;
}

export function clearDotEnvKeys(): void {
  dotEnvKeys.clear();
}
