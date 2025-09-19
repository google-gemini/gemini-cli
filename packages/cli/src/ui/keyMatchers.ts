/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from './hooks/useKeypress.js';
import type { KeyBinding, KeyBindingConfig } from '../config/keyBindings.js';
import { Command, defaultKeyBindings } from '../config/keyBindings.js';

/**
 * Matches a KeyBinding against an actual Key press
 * Pure data-driven matching logic
 */
function matchKeyBinding(keyBinding: KeyBinding, key: Key): boolean {
  // Either key name or sequence must match (but not both should be defined)
  let keyMatches = false;

  if (keyBinding.key !== undefined) {
    keyMatches = keyBinding.key === key.name;
  } else if (keyBinding.sequence !== undefined) {
    keyMatches = keyBinding.sequence === key.sequence;
  } else {
    // Neither key nor sequence defined - invalid binding
    return false;
  }

  if (!keyMatches) {
    return false;
  }

  // Check modifiers - follow original logic:
  // undefined = ignore this modifier (original behavior)
  // true = modifier must be pressed
  // false = modifier must NOT be pressed

  if (keyBinding.ctrl !== undefined && key.ctrl !== keyBinding.ctrl) {
    return false;
  }

  if (keyBinding.shift !== undefined && key.shift !== keyBinding.shift) {
    return false;
  }

  if (keyBinding.command !== undefined && key.meta !== keyBinding.command) {
    return false;
  }

  if (keyBinding.paste !== undefined && key.paste !== keyBinding.paste) {
    return false;
  }

  return true;
}

/**
 * Checks if a key matches any of the bindings for a command
 */
function matchCommand(
  command: Command,
  key: Key,
  config: KeyBindingConfig = defaultKeyBindings,
): boolean {
  const bindings = config[command];
  return bindings.some((binding) => matchKeyBinding(binding, key));
}

/**
 * Key matcher function type
 */
type KeyMatcher = (key: Key) => boolean;

/**
 * Type for key matchers mapped to Command enum
 */
export type KeyMatchers = {
  readonly [C in Command]: KeyMatcher;
};

/**
 * Creates key matchers from a key binding configuration
 */
export function createKeyMatchers(
  config: KeyBindingConfig = defaultKeyBindings,
): KeyMatchers {
  const matchers = {} as { [C in Command]: KeyMatcher };

  for (const command of Object.values(Command)) {
    matchers[command] = (key: Key) => matchCommand(command, key, config);
  }

  return matchers as KeyMatchers;
}

/**
 * Default key binding matchers using the default configuration
 */
export const keyMatchers: KeyMatchers = createKeyMatchers(defaultKeyBindings);

// Re-export Command for convenience
export { Command };
