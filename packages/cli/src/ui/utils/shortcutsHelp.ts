/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, type KeyMatchers } from '../keyMatchers.js';
import type { Key } from '../hooks/useKeypress.js';

export function shouldDismissShortcutsHelpOnHotkey(
  key: Key,
  matchers: KeyMatchers,
): boolean {
  return Object.values(Command).some((command) => matchers[command](key));
}
