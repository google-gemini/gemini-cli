/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Direction } from './text-buffer.js';

/**
 * Normalized key signature for platform-agnostic key binding
 */
export interface KeySignature {
  /** The key name (normalized) */
  key: string;
  /** Control modifier */
  ctrl: boolean;
  /** Meta/Cmd modifier */
  meta: boolean;
  /** Shift modifier */
  shift: boolean;
  /** Alt modifier */
  alt: boolean;
  /** Whether this is a repeat event */
  repeat: boolean;
  /** Raw input sequence for special chars */
  sequence: string;
  /** Whether this is a paste operation */
  paste: boolean;
}

/**
 * Context passed to commands for execution
 */
export interface EditorContext {
  /** Insert text at cursor */
  insert: (text: string) => void;
  /** Insert a newline */
  newline: () => void;
  /** Delete character before cursor */
  backspace: () => void;
  /** Delete character after cursor */
  del: () => void;
  /** Delete word before cursor */
  deleteWordLeft: () => void;
  /** Delete word after cursor */
  deleteWordRight: () => void;
  /** Move cursor in specified direction */
  move: (direction: Direction) => void;
  /** Current cursor position */
  cursor: { row: number; col: number };
  /** Current text content */
  text: string;
}

/**
 * A command that can be executed in the editor context
 */
export interface Command {
  /** Execute the command */
  execute(ctx: EditorContext): void;
  /** Description for debugging/testing */
  description: string;
}

/**
 * A key binding entry
 */
export interface Binding {
  /** Human-readable description */
  description: string;
  /** Predicate to match key signatures */
  matcher: (ks: KeySignature, ctx: EditorContext) => boolean;
  /** Command to execute when matched */
  command: Command;
  /** Priority (lower numbers = higher priority) */
  priority?: number;
}

/**
 * Normalizes a raw key event into a standard KeySignature
 */
export function normalizeKey(key: {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  paste: boolean;
}): KeySignature {
  // Handle special sequences
  let normalizedKey = key.name;

  // Handle Enter variations
  if (
    key.sequence === '\r' ||
    key.sequence === '\n' ||
    key.sequence === '\\\r'
  ) {
    normalizedKey = 'return';
  }

  // Handle backspace variations
  if (key.sequence === '\x7f') {
    normalizedKey = 'backspace';
  }

  return {
    key: normalizedKey,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
    alt: false, // Not provided in current interface
    repeat: false, // Not provided in current interface
    sequence: key.sequence,
    paste: key.paste,
  };
}

/**
 * Simple command implementations
 */
export class InsertCommand implements Command {
  constructor(private text: string) {}

  get description() {
    return `Insert text: ${this.text}`;
  }

  execute(ctx: EditorContext): void {
    ctx.insert(this.text);
  }
}

export class NewlineCommand implements Command {
  get description() {
    return 'Insert newline';
  }

  execute(ctx: EditorContext): void {
    ctx.newline();
  }
}

export class BackspaceCommand implements Command {
  get description() {
    return 'Delete character left';
  }

  execute(ctx: EditorContext): void {
    ctx.backspace();
  }
}

export class DeleteCommand implements Command {
  get description() {
    return 'Delete character right';
  }

  execute(ctx: EditorContext): void {
    ctx.del();
  }
}

export class DeleteWordLeftCommand implements Command {
  get description() {
    return 'Delete word left';
  }

  execute(ctx: EditorContext): void {
    ctx.deleteWordLeft();
  }
}

export class DeleteWordRightCommand implements Command {
  get description() {
    return 'Delete word right';
  }

  execute(ctx: EditorContext): void {
    ctx.deleteWordRight();
  }
}

export class MoveCommand implements Command {
  constructor(private direction: Direction) {}

  get description() {
    return `Move cursor ${this.direction}`;
  }

  execute(ctx: EditorContext): void {
    ctx.move(this.direction);
  }
}

export class NoOpCommand implements Command {
  constructor(private reason: string) {}

  get description() {
    return `No operation: ${this.reason}`;
  }

  execute(_ctx: EditorContext): void {
    // Intentionally do nothing
  }
}

/**
 * Helper functions for common matchers
 */
export const matchers = {
  /** Match exact key without modifiers */
  key: (keyName: string) => (ks: KeySignature, _ctx: EditorContext) =>
    ks.key === keyName && !ks.ctrl && !ks.meta && !ks.shift,

  /** Match key with ctrl modifier */
  ctrl: (keyName: string) => (ks: KeySignature, _ctx: EditorContext) =>
    ks.key === keyName && ks.ctrl && !ks.meta && !ks.shift,

  /** Match key with meta modifier */
  meta: (keyName: string) => (ks: KeySignature, _ctx: EditorContext) =>
    ks.key === keyName && !ks.ctrl && ks.meta && !ks.shift,

  /** Match key with ctrl OR meta modifier */
  ctrlOrMeta: (keyName: string) => (ks: KeySignature, _ctx: EditorContext) =>
    ks.key === keyName && (ks.ctrl || ks.meta) && !ks.shift,

  /** Match sequence exactly */
  sequence: (seq: string) => (ks: KeySignature, _ctx: EditorContext) =>
    ks.sequence === seq,

  /** Match printable characters (not ctrl/meta) */
  printable: () => (ks: KeySignature, _ctx: EditorContext) =>
    Boolean(ks.sequence && !ks.ctrl && !ks.meta && ks.sequence.length > 0),
};

/**
 * Default key bindings registry
 */
export function createDefaultBindings(): Binding[] {
  return [
    // Escape - highest priority
    {
      description: 'Escape key',
      matcher: matchers.key('escape'),
      command: new NoOpCommand('escape pressed'),
      priority: 0,
    },

    // Navigation - arrow keys
    {
      description: 'Move left',
      matcher: matchers.key('left'),
      command: new MoveCommand('left'),
      priority: 10,
    },
    {
      description: 'Move right',
      matcher: matchers.key('right'),
      command: new MoveCommand('right'),
      priority: 10,
    },
    {
      description: 'Move up',
      matcher: matchers.key('up'),
      command: new MoveCommand('up'),
      priority: 10,
    },
    {
      description: 'Move down',
      matcher: matchers.key('down'),
      command: new MoveCommand('down'),
      priority: 10,
    },

    // Navigation - home/end
    {
      description: 'Move to line start',
      matcher: matchers.key('home'),
      command: new MoveCommand('home'),
      priority: 10,
    },
    {
      description: 'Move to line end',
      matcher: matchers.key('end'),
      command: new MoveCommand('end'),
      priority: 10,
    },

    // Word movement
    {
      description: 'Move word left (Ctrl/Meta + Left)',
      matcher: matchers.ctrlOrMeta('left'),
      command: new MoveCommand('wordLeft'),
      priority: 5, // Higher priority than basic left
    },
    {
      description: 'Move word right (Ctrl/Meta + Right)',
      matcher: matchers.ctrlOrMeta('right'),
      command: new MoveCommand('wordRight'),
      priority: 5, // Higher priority than basic right
    },

    // Emacs-style navigation
    {
      description: 'Move left (Ctrl+B)',
      matcher: matchers.ctrl('b'),
      command: new MoveCommand('left'),
      priority: 10,
    },
    {
      description: 'Move right (Ctrl+F)',
      matcher: matchers.ctrl('f'),
      command: new MoveCommand('right'),
      priority: 10,
    },
    {
      description: 'Move to line start (Ctrl+A)',
      matcher: matchers.ctrl('a'),
      command: new MoveCommand('home'),
      priority: 10,
    },
    {
      description: 'Move to line end (Ctrl+E)',
      matcher: matchers.ctrl('e'),
      command: new MoveCommand('end'),
      priority: 10,
    },
    {
      description: 'Move word left (Meta+B)',
      matcher: matchers.meta('b'),
      command: new MoveCommand('wordLeft'),
      priority: 10,
    },
    {
      description: 'Move word right (Meta+F)',
      matcher: matchers.meta('f'),
      command: new MoveCommand('wordRight'),
      priority: 10,
    },

    // Deletion
    {
      description: 'Delete character left (Backspace)',
      matcher: matchers.key('backspace'),
      command: new BackspaceCommand(),
      priority: 10,
    },
    {
      description: 'Delete character left (Ctrl+H)',
      matcher: matchers.ctrl('h'),
      command: new BackspaceCommand(),
      priority: 10,
    },
    {
      description: 'Delete character left (\\x7f sequence)',
      matcher: matchers.sequence('\x7f'),
      command: new BackspaceCommand(),
      priority: 10,
    },
    {
      description: 'Delete character right (Delete)',
      matcher: matchers.key('delete'),
      command: new DeleteCommand(),
      priority: 10,
    },
    {
      description: 'Delete character right (Ctrl+D)',
      matcher: matchers.ctrl('d'),
      command: new DeleteCommand(),
      priority: 10,
    },

    // Word deletion
    {
      description: 'Delete word left (Ctrl+W)',
      matcher: matchers.ctrl('w'),
      command: new DeleteWordLeftCommand(),
      priority: 5,
    },
    {
      description: 'Delete word left (Meta/Ctrl + Backspace)',
      matcher: (ks: KeySignature) =>
        (ks.key === 'backspace' || ks.sequence === '\x7f') &&
        (ks.meta || ks.ctrl),
      command: new DeleteWordLeftCommand(),
      priority: 5,
    },
    {
      description: 'Delete word right (Meta/Ctrl + Delete)',
      matcher: (ks: KeySignature) =>
        ks.key === 'delete' && (ks.meta || ks.ctrl),
      command: new DeleteWordRightCommand(),
      priority: 5,
    },

    // Newline
    {
      description: 'Insert newline (Enter)',
      matcher: matchers.key('return'),
      command: new NewlineCommand(),
      priority: 10,
    },
    {
      description: 'Insert newline (\\r sequence)',
      matcher: matchers.sequence('\r'),
      command: new NewlineCommand(),
      priority: 10,
    },
    {
      description: 'Insert newline (\\n sequence)',
      matcher: matchers.sequence('\n'),
      command: new NewlineCommand(),
      priority: 10,
    },
    {
      description: 'Insert newline (VSCode shift+enter)',
      matcher: matchers.sequence('\\\r'),
      command: new NewlineCommand(),
      priority: 10,
    },

    // Generic text input - lowest priority
    {
      description: 'Insert printable characters',
      matcher: matchers.printable(),
      command: new InsertCommand(''), // Will be replaced dynamically
      priority: 100,
    },
  ];
}

/**
 * Key binding resolver
 */
export class BindingResolver {
  private bindings: Binding[];

  constructor(bindings: Binding[]) {
    // Sort by priority (lower numbers first)
    this.bindings = [...bindings].sort(
      (a, b) => (a.priority || 50) - (b.priority || 50),
    );
  }

  /**
   * Find the first matching binding for a key signature
   */
  resolve(ks: KeySignature, ctx: EditorContext): Command | null {
    for (const binding of this.bindings) {
      if (binding.matcher(ks, ctx)) {
        // Special handling for generic insert command
        if (
          binding.command instanceof InsertCommand &&
          binding.description.includes('printable')
        ) {
          return new InsertCommand(ks.sequence);
        }
        return binding.command;
      }
    }
    return null;
  }

  /**
   * Get all bindings for debugging/documentation
   */
  getAllBindings(): Binding[] {
    return [...this.bindings];
  }

  /**
   * Add or update a binding
   */
  addBinding(binding: Binding): void {
    this.bindings.push(binding);
    this.bindings.sort((a, b) => (a.priority || 50) - (b.priority || 50));
  }

  /**
   * Remove bindings matching a predicate
   */
  removeBindings(predicate: (binding: Binding) => boolean): void {
    this.bindings = this.bindings.filter((b) => !predicate(b));
  }
}

/**
 * Default key binding resolver instance
 */
export const keyBindingResolver = new BindingResolver(createDefaultBindings());
