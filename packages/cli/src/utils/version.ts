/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function getCliVersion(): string {
  return process.env.CLI_VERSION || process.version;
}
