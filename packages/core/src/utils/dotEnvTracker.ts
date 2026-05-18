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
