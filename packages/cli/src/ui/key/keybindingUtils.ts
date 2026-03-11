/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {
  type Command,
  type KeyBinding,
  type KeyBindingConfig,
  defaultKeyBindingConfig,
} from './keyBindings.js';

/**
 * Maps internal key names to user-friendly display names.
 */
const KEY_NAME_MAP: Record<string, string> = {
  enter: 'Enter',
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

interface ModifierMap {
  ctrl: string;
  alt: string;
  shift: string;
  cmd: string;
}

const MODIFIER_MAPS: Record<string, ModifierMap> = {
  darwin: {
    ctrl: 'Ctrl',
    alt: 'Option',
    shift: 'Shift',
    cmd: 'Cmd',
  },
  win32: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    cmd: 'Win',
  },
  linux: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    cmd: 'Super',
  },
  default: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    cmd: 'Cmd/Win',
  },
};

/**
 * Formats a single KeyBinding into a human-readable string (e.g., "Ctrl+C").
 */
export function formatKeyBinding(
  binding: KeyBinding,
  platform?: string,
): string {
  const activePlatform =
    platform ??
    (process.env['FORCE_GENERIC_KEYBINDING_HINTS']
      ? 'default'
      : process.platform);
  const modMap = MODIFIER_MAPS[activePlatform] || MODIFIER_MAPS['default'];
  const parts: string[] = [];

  if (binding.ctrl) parts.push(modMap.ctrl);
  if (binding.alt) parts.push(modMap.alt);
  if (binding.shift) parts.push(modMap.shift);
  if (binding.cmd) parts.push(modMap.cmd);

  const keyName = KEY_NAME_MAP[binding.key] || binding.key.toUpperCase();
  parts.push(keyName);

  return parts.join('+');
}

/**
 * Formats the primary keybinding for a command.
 */
export function formatCommand(
  command: Command,
  config: KeyBindingConfig = defaultKeyBindingConfig,
  platform?: string,
): string {
  const bindings = config.get(command);
  if (!bindings || bindings.length === 0) {
    return '';
  }

  // Use the first binding as the primary one for display
  return formatKeyBinding(bindings[0], platform);
}
