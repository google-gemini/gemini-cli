/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Command,
  type KeyBinding,
  type KeyBindingConfig,
  defaultKeyBindings,
} from '../../config/keyBindings.js';

/**
 * Maps internal key names to user-friendly display names.
 */
const KEY_NAME_MAP: Record<string, string> = {
  return: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End',
  tab: 'Tab',
  space: 'Space',
};

/**
 * Formats a single KeyBinding into a human-readable string (e.g., "Ctrl+C").
 */
export function formatKeyBinding(binding: KeyBinding): string {
  const parts: string[] = [];

  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.cmd) parts.push('Cmd');

  const keyName = KEY_NAME_MAP[binding.key] || binding.key.toUpperCase();
  parts.push(keyName);

  return parts.join('+');
}

/**
 * Formats the primary keybinding for a command.
 */
export function formatCommand(
  command: Command,
  config: KeyBindingConfig = defaultKeyBindings,
): string {
  const bindings = config[command];
  if (!bindings || bindings.length === 0) {
    return '';
  }

  // Use the first binding as the primary one for display
  return formatKeyBinding(bindings[0]);
}
