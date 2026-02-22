/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, keyMatchers } from '../keyMatchers.js';
import type { Key } from '../hooks/useKeypress.js';

export function shouldDismissShortcutsHelpOnHotkey(key: Key): boolean {
  return Object.values(Command).some((command) => keyMatchers[command](key));
}
