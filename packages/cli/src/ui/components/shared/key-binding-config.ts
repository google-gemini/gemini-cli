/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BindingResolver,
  createDefaultBindings,
  type Binding,
  type KeySignature,
  type EditorContext,
  InsertCommand,
  NewlineCommand,
  BackspaceCommand,
  DeleteCommand,
  MoveCommand,
  DeleteWordLeftCommand,
  DeleteWordRightCommand,
  NoOpCommand,
} from './key-bindings.js';

/**
 * Serializable key binding configuration
 */
export interface KeyBindingConfig {
  /** Human-readable description */
  description: string;
  /** Key combination string (e.g., "ctrl+a", "meta+f", "left") */
  keys: string;
  /** Command to execute */
  command: string;
  /** Command arguments (if any) */
  args?: unknown[];
  /** Priority (lower numbers = higher priority) */
  priority?: number;
  /** When clause (optional boolean expression) */
  when?: string;
}

/**
 * Available command registry
 */
export const COMMANDS = {
  'cursor.left': (_args: unknown[]) => new MoveCommand('left'),
  'cursor.right': (_args: unknown[]) => new MoveCommand('right'),
  'cursor.up': (_args: unknown[]) => new MoveCommand('up'),
  'cursor.down': (_args: unknown[]) => new MoveCommand('down'),
  'cursor.wordLeft': (_args: unknown[]) => new MoveCommand('wordLeft'),
  'cursor.wordRight': (_args: unknown[]) => new MoveCommand('wordRight'),
  'cursor.home': (_args: unknown[]) => new MoveCommand('home'),
  'cursor.end': (_args: unknown[]) => new MoveCommand('end'),
  'cursor.lineStart': (_args: unknown[]) => new MoveCommand('home'),
  'cursor.lineEnd': (_args: unknown[]) => new MoveCommand('end'),

  'editor.insert': (args: unknown[]) =>
    new InsertCommand((args[0] as string) || ''),
  'editor.newline': (_args: unknown[]) => new NewlineCommand(),
  'editor.backspace': (_args: unknown[]) => new BackspaceCommand(),
  'editor.delete': (_args: unknown[]) => new DeleteCommand(),
  'editor.deleteWordLeft': (_args: unknown[]) => new DeleteWordLeftCommand(),
  'editor.deleteWordRight': (_args: unknown[]) => new DeleteWordRightCommand(),

  'editor.noop': (args: unknown[]) =>
    new NoOpCommand((args[0] as string) || 'no operation'),
} as const;

/**
 * Parse a key combination string into a matcher function
 */
export function parseKeyString(
  keyString: string,
): (ks: KeySignature, ctx: EditorContext) => boolean {
  const parts = keyString.toLowerCase().split('+');
  const modifiers = {
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
  };

  let keyName = '';

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        modifiers.ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        modifiers.meta = true;
        break;
      case 'shift':
        modifiers.shift = true;
        break;
      case 'alt':
      case 'option':
        modifiers.alt = true;
        break;
      default:
        keyName = part;
        break;
    }
  }

  // Handle special key names
  const keyMap: Record<string, string> = {
    enter: 'return',
    esc: 'escape',
    space: ' ',
    tab: '\t',
    arrowleft: 'left',
    arrowright: 'right',
    arrowup: 'up',
    arrowdown: 'down',
    del: 'delete',
    backspace: 'backspace',
  };

  const normalizedKey = keyMap[keyName] || keyName;

  return (ks: KeySignature, _ctx: EditorContext): boolean => {
    // Check exact modifier match
    if (
      ks.ctrl !== modifiers.ctrl ||
      ks.meta !== modifiers.meta ||
      ks.shift !== modifiers.shift
    ) {
      return false;
    }

    // Check key match
    if (normalizedKey === ' ') {
      return ks.sequence === ' ';
    } else if (normalizedKey === '\t') {
      return ks.sequence === '\t';
    } else {
      return ks.key === normalizedKey;
    }
  };
}

/**
 * Create a binding from configuration
 */
export function createBindingFromConfig(
  config: KeyBindingConfig,
): Binding | null {
  const commandFactory = COMMANDS[config.command as keyof typeof COMMANDS];
  if (!commandFactory) {
    console.warn(`Unknown command: ${config.command}`);
    return null;
  }

  const matcher = parseKeyString(config.keys);
  const command = commandFactory(config.args || []);

  return {
    description: config.description,
    matcher,
    command,
    priority: config.priority || 50,
  };
}

/**
 * Create a resolver from configuration
 */
export function createResolverFromConfig(
  configs: KeyBindingConfig[],
): BindingResolver {
  const bindings: Binding[] = [];

  for (const config of configs) {
    const binding = createBindingFromConfig(config);
    if (binding) {
      bindings.push(binding);
    }
  }

  return new BindingResolver(bindings);
}

/**
 * Default key binding configurations
 */
export const DEFAULT_KEY_BINDINGS: KeyBindingConfig[] = [
  // Navigation - arrow keys
  {
    description: 'Move left',
    keys: 'left',
    command: 'cursor.left',
    priority: 10,
  },
  {
    description: 'Move right',
    keys: 'right',
    command: 'cursor.right',
    priority: 10,
  },
  { description: 'Move up', keys: 'up', command: 'cursor.up', priority: 10 },
  {
    description: 'Move down',
    keys: 'down',
    command: 'cursor.down',
    priority: 10,
  },

  // Navigation - home/end
  {
    description: 'Move to line start',
    keys: 'home',
    command: 'cursor.home',
    priority: 10,
  },
  {
    description: 'Move to line end',
    keys: 'end',
    command: 'cursor.end',
    priority: 10,
  },

  // Word movement (higher priority than basic movement)
  {
    description: 'Move word left (Ctrl+Left)',
    keys: 'ctrl+left',
    command: 'cursor.wordLeft',
    priority: 5,
  },
  {
    description: 'Move word right (Ctrl+Right)',
    keys: 'ctrl+right',
    command: 'cursor.wordRight',
    priority: 5,
  },
  {
    description: 'Move word left (Meta+Left)',
    keys: 'meta+left',
    command: 'cursor.wordLeft',
    priority: 5,
  },
  {
    description: 'Move word right (Meta+Right)',
    keys: 'meta+right',
    command: 'cursor.wordRight',
    priority: 5,
  },

  // Emacs-style navigation
  {
    description: 'Move left (Ctrl+B)',
    keys: 'ctrl+b',
    command: 'cursor.left',
    priority: 10,
  },
  {
    description: 'Move right (Ctrl+F)',
    keys: 'ctrl+f',
    command: 'cursor.right',
    priority: 10,
  },
  {
    description: 'Move to line start (Ctrl+A)',
    keys: 'ctrl+a',
    command: 'cursor.home',
    priority: 10,
  },
  {
    description: 'Move to line end (Ctrl+E)',
    keys: 'ctrl+e',
    command: 'cursor.end',
    priority: 10,
  },
  {
    description: 'Move word left (Meta+B)',
    keys: 'meta+b',
    command: 'cursor.wordLeft',
    priority: 10,
  },
  {
    description: 'Move word right (Meta+F)',
    keys: 'meta+f',
    command: 'cursor.wordRight',
    priority: 10,
  },

  // Deletion
  {
    description: 'Delete character left (Backspace)',
    keys: 'backspace',
    command: 'editor.backspace',
    priority: 10,
  },
  {
    description: 'Delete character left (Ctrl+H)',
    keys: 'ctrl+h',
    command: 'editor.backspace',
    priority: 10,
  },
  {
    description: 'Delete character right (Delete)',
    keys: 'delete',
    command: 'editor.delete',
    priority: 10,
  },
  {
    description: 'Delete character right (Ctrl+D)',
    keys: 'ctrl+d',
    command: 'editor.delete',
    priority: 10,
  },

  // Word deletion
  {
    description: 'Delete word left (Ctrl+W)',
    keys: 'ctrl+w',
    command: 'editor.deleteWordLeft',
    priority: 5,
  },
  {
    description: 'Delete word left (Meta+Backspace)',
    keys: 'meta+backspace',
    command: 'editor.deleteWordLeft',
    priority: 5,
  },
  {
    description: 'Delete word left (Ctrl+Backspace)',
    keys: 'ctrl+backspace',
    command: 'editor.deleteWordLeft',
    priority: 5,
  },
  {
    description: 'Delete word right (Meta+Delete)',
    keys: 'meta+delete',
    command: 'editor.deleteWordRight',
    priority: 5,
  },
  {
    description: 'Delete word right (Ctrl+Delete)',
    keys: 'ctrl+delete',
    command: 'editor.deleteWordRight',
    priority: 5,
  },

  // Newline
  {
    description: 'Insert newline (Enter)',
    keys: 'enter',
    command: 'editor.newline',
    priority: 10,
  },

  // Escape - highest priority
  {
    description: 'Escape key',
    keys: 'escape',
    command: 'editor.noop',
    args: ['escape pressed'],
    priority: 0,
  },
];

/**
 * Create a resolver with default configuration
 */
export function createDefaultResolver(): BindingResolver {
  // Combine the default bindings with the printable character binding
  const defaultBindings = createDefaultBindings();
  return new BindingResolver(defaultBindings);
}

/**
 * Merge custom configuration with defaults
 */
export function mergeConfigurations(
  custom: KeyBindingConfig[],
  useDefaults: boolean = true,
): KeyBindingConfig[] {
  if (!useDefaults) {
    return custom;
  }

  // Start with defaults
  const merged = [...DEFAULT_KEY_BINDINGS];

  // Override/add custom bindings
  for (const customBinding of custom) {
    const existingIndex = merged.findIndex(
      (b) => b.keys === customBinding.keys,
    );
    if (existingIndex >= 0) {
      // Override existing binding
      merged[existingIndex] = customBinding;
    } else {
      // Add new binding
      merged.push(customBinding);
    }
  }

  return merged;
}

/**
 * Validate a key binding configuration
 */
export function validateKeyBindingConfig(config: KeyBindingConfig): string[] {
  const errors: string[] = [];

  if (!config.description) {
    errors.push('Description is required');
  }

  if (!config.keys) {
    errors.push('Keys are required');
  }

  if (!config.command) {
    errors.push('Command is required');
  } else if (!(config.command in COMMANDS)) {
    errors.push(`Unknown command: ${config.command}`);
  }

  // Try to parse the key string
  try {
    parseKeyString(config.keys);
  } catch (_error) {
    errors.push(`Invalid key string: ${config.keys}`);
  }

  return errors;
}

/**
 * Get all available commands
 */
export function getAvailableCommands(): string[] {
  return Object.keys(COMMANDS);
}

/**
 * Export key bindings to JSON format
 */
export function exportKeyBindings(
  _resolver: BindingResolver,
): KeyBindingConfig[] {
  // This is a simplified export - for full export, we'd need to reverse-engineer
  // the bindings back to configuration format
  return DEFAULT_KEY_BINDINGS;
}

/**
 * Import key bindings from JSON format
 */
export function importKeyBindings(
  configs: KeyBindingConfig[],
): BindingResolver {
  return createResolverFromConfig(configs);
}
