/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from '../hooks/useKeypress.js';
import type { KeyBindingConfig } from './keyBindings.js';
import {
  Command,
  defaultKeyBindingConfig,
  loadCustomKeybindings,
} from './keyBindings.js';

/**
 * Checks if a key matches any of the bindings for a command
 */
function matchCommand(
  command: Command,
  key: Key,
  config: KeyBindingConfig = defaultKeyBindingConfig,
): boolean {
  const bindings = config.get(command);
  if (!bindings) return false;
  return bindings.some((binding) => binding.matches(key));
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
  config: KeyBindingConfig = defaultKeyBindingConfig,
): KeyMatchers {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const matchers = {} as { [C in Command]: KeyMatcher };

  for (const command of Object.values(Command)) {
    matchers[command] = (key: Key) => matchCommand(command, key, config);
  }

  return matchers as KeyMatchers;
}

/**
 * Default key binding matchers using the default configuration
 */
export const defaultKeyMatchers: KeyMatchers = createKeyMatchers(
  defaultKeyBindingConfig,
);

// Re-export Command for convenience
export { Command };

/**
 * Loads and creates key matchers including user customizations.
 */
export async function loadKeyMatchers(): Promise<{
  matchers: KeyMatchers;
  errors: string[];
}> {
  const { config, errors } = await loadCustomKeybindings();
  return {
    matchers: createKeyMatchers(config),
    errors,
  };
}
