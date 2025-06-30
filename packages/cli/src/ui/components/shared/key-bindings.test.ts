/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeKey,
  BindingResolver,
  createDefaultBindings,
  matchers,
  InsertCommand,
  NewlineCommand,
  BackspaceCommand,
  DeleteCommand,
  MoveCommand,
  DeleteWordLeftCommand,
  DeleteWordRightCommand,
  NoOpCommand,
  type EditorContext,
  type KeySignature,
} from './key-bindings.js';

describe('Key Bindings System', () => {
  let mockContext: EditorContext;

  beforeEach(() => {
    mockContext = {
      insert: vi.fn(),
      newline: vi.fn(),
      backspace: vi.fn(),
      del: vi.fn(),
      deleteWordLeft: vi.fn(),
      deleteWordRight: vi.fn(),
      move: vi.fn(),
      cursor: { row: 0, col: 0 },
      text: '',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeKey', () => {
    it('should normalize basic key events', () => {
      const result = normalizeKey({
        name: 'left',
        ctrl: false,
        meta: false,
        shift: false,
        sequence: '',
        paste: false,
      });

      expect(result).toEqual({
        key: 'left',
        ctrl: false,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      });
    });

    it('should normalize Enter variations', () => {
      expect(
        normalizeKey({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\r',
          paste: false,
        }),
      ).toMatchObject({ key: 'return' });

      expect(
        normalizeKey({
          name: 'enter',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\n',
          paste: false,
        }),
      ).toMatchObject({ key: 'return' });

      expect(
        normalizeKey({
          name: 'unknown',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\\\r',
          paste: false,
        }),
      ).toMatchObject({ key: 'return' });
    });

    it('should normalize backspace variations', () => {
      expect(
        normalizeKey({
          name: 'backspace',
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x7f',
          paste: false,
        }),
      ).toMatchObject({ key: 'backspace' });
    });
  });

  describe('matchers', () => {
    it('should match exact keys without modifiers', () => {
      const matcher = matchers.key('left');

      expect(
        matcher(
          {
            key: 'left',
            ctrl: false,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          {
            key: 'left',
            ctrl: true,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
      expect(
        matcher(
          {
            key: 'right',
            ctrl: false,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
    });

    it('should match ctrl combinations', () => {
      const matcher = matchers.ctrl('a');

      expect(
        matcher(
          {
            key: 'a',
            ctrl: true,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          {
            key: 'a',
            ctrl: false,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
      expect(
        matcher(
          {
            key: 'a',
            ctrl: true,
            meta: true,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
    });

    it('should match meta combinations', () => {
      const matcher = matchers.meta('f');

      expect(
        matcher(
          {
            key: 'f',
            ctrl: false,
            meta: true,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          {
            key: 'f',
            ctrl: false,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
      expect(
        matcher(
          {
            key: 'f',
            ctrl: true,
            meta: true,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
    });

    it('should match ctrl OR meta combinations', () => {
      const matcher = matchers.ctrlOrMeta('left');

      expect(
        matcher(
          {
            key: 'left',
            ctrl: true,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          {
            key: 'left',
            ctrl: false,
            meta: true,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          {
            key: 'left',
            ctrl: false,
            meta: false,
            shift: false,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
      expect(
        matcher(
          {
            key: 'left',
            ctrl: true,
            meta: false,
            shift: true,
          } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
    });

    it('should match sequences', () => {
      const matcher = matchers.sequence('\r');

      expect(matcher({ sequence: '\r' } as KeySignature, mockContext)).toBe(
        true,
      );
      expect(matcher({ sequence: '\n' } as KeySignature, mockContext)).toBe(
        false,
      );
    });

    it('should match printable characters', () => {
      const matcher = matchers.printable();

      expect(
        matcher(
          { sequence: 'a', ctrl: false, meta: false } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          { sequence: '1', ctrl: false, meta: false } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          { sequence: ' ', ctrl: false, meta: false } as KeySignature,
          mockContext,
        ),
      ).toBe(true);
      expect(
        matcher(
          { sequence: 'a', ctrl: true, meta: false } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
      expect(
        matcher(
          { sequence: '', ctrl: false, meta: false } as KeySignature,
          mockContext,
        ),
      ).toBe(false);
    });
  });

  describe('Commands', () => {
    it('should execute InsertCommand', () => {
      const command = new InsertCommand('hello');
      command.execute(mockContext);

      expect(mockContext.insert).toHaveBeenCalledWith('hello');
      expect(command.description).toBe('Insert text: hello');
    });

    it('should execute NewlineCommand', () => {
      const command = new NewlineCommand();
      command.execute(mockContext);

      expect(mockContext.newline).toHaveBeenCalled();
      expect(command.description).toBe('Insert newline');
    });

    it('should execute BackspaceCommand', () => {
      const command = new BackspaceCommand();
      command.execute(mockContext);

      expect(mockContext.backspace).toHaveBeenCalled();
      expect(command.description).toBe('Delete character left');
    });

    it('should execute DeleteCommand', () => {
      const command = new DeleteCommand();
      command.execute(mockContext);

      expect(mockContext.del).toHaveBeenCalled();
      expect(command.description).toBe('Delete character right');
    });

    it('should execute MoveCommand', () => {
      const command = new MoveCommand('left');
      command.execute(mockContext);

      expect(mockContext.move).toHaveBeenCalledWith('left');
      expect(command.description).toBe('Move cursor left');
    });

    it('should execute DeleteWordLeftCommand', () => {
      const command = new DeleteWordLeftCommand();
      command.execute(mockContext);

      expect(mockContext.deleteWordLeft).toHaveBeenCalled();
      expect(command.description).toBe('Delete word left');
    });

    it('should execute DeleteWordRightCommand', () => {
      const command = new DeleteWordRightCommand();
      command.execute(mockContext);

      expect(mockContext.deleteWordRight).toHaveBeenCalled();
      expect(command.description).toBe('Delete word right');
    });

    it('should execute NoOpCommand', () => {
      const command = new NoOpCommand('test reason');
      command.execute(mockContext);

      // Should not call any methods
      expect(mockContext.insert).not.toHaveBeenCalled();
      expect(mockContext.newline).not.toHaveBeenCalled();
      expect(command.description).toBe('No operation: test reason');
    });
  });

  describe('BindingResolver', () => {
    let resolver: BindingResolver;

    beforeEach(() => {
      resolver = new BindingResolver(createDefaultBindings());
    });

    it('should resolve escape key', () => {
      const keySignature: KeySignature = {
        key: 'escape',
        ctrl: false,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      const command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(NoOpCommand);
      expect(command?.description).toContain('escape');
    });

    it('should resolve arrow key navigation', () => {
      const testCases = [
        { key: 'left', expectedDirection: 'left' },
        { key: 'right', expectedDirection: 'right' },
        { key: 'up', expectedDirection: 'up' },
        { key: 'down', expectedDirection: 'down' },
      ];

      testCases.forEach(({ key, expectedDirection }) => {
        const keySignature: KeySignature = {
          key,
          ctrl: false,
          meta: false,
          shift: false,
          alt: false,
          repeat: false,
          sequence: '',
          paste: false,
        };

        const command = resolver.resolve(keySignature, mockContext);
        expect(command).toBeInstanceOf(MoveCommand);
        command?.execute(mockContext);
        expect(mockContext.move).toHaveBeenCalledWith(expectedDirection);
      });
    });

    it('should resolve word movement with modifiers', () => {
      // Ctrl+Left
      let keySignature: KeySignature = {
        key: 'left',
        ctrl: true,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      let command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(MoveCommand);
      command?.execute(mockContext);
      expect(mockContext.move).toHaveBeenCalledWith('wordLeft');

      vi.clearAllMocks();

      // Meta+Right
      keySignature = {
        key: 'right',
        ctrl: false,
        meta: true,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(MoveCommand);
      command?.execute(mockContext);
      expect(mockContext.move).toHaveBeenCalledWith('wordRight');
    });

    it('should resolve Emacs-style navigation', () => {
      const testCases = [
        { key: 'b', expectedDirection: 'left' },
        { key: 'f', expectedDirection: 'right' },
        { key: 'a', expectedDirection: 'home' },
        { key: 'e', expectedDirection: 'end' },
      ];

      testCases.forEach(({ key, expectedDirection }) => {
        const keySignature: KeySignature = {
          key,
          ctrl: true,
          meta: false,
          shift: false,
          alt: false,
          repeat: false,
          sequence: '',
          paste: false,
        };

        const command = resolver.resolve(keySignature, mockContext);
        expect(command).toBeInstanceOf(MoveCommand);
        command?.execute(mockContext);
        expect(mockContext.move).toHaveBeenCalledWith(expectedDirection);
        vi.clearAllMocks();
      });
    });

    it('should resolve deletion commands', () => {
      // Backspace
      let keySignature: KeySignature = {
        key: 'backspace',
        ctrl: false,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      let command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(BackspaceCommand);

      // Delete
      keySignature.key = 'delete';
      command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(DeleteCommand);

      // Ctrl+W (delete word left)
      keySignature = {
        key: 'w',
        ctrl: true,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(DeleteWordLeftCommand);
    });

    it('should resolve newline commands', () => {
      const testCases = [
        { key: 'return', sequence: '' },
        { key: 'unknown', sequence: '\r' },
        { key: 'unknown', sequence: '\n' },
        { key: 'unknown', sequence: '\\\r' },
      ];

      testCases.forEach(({ key, sequence }) => {
        const keySignature: KeySignature = {
          key,
          ctrl: false,
          meta: false,
          shift: false,
          alt: false,
          repeat: false,
          sequence,
          paste: false,
        };

        const command = resolver.resolve(keySignature, mockContext);
        expect(command).toBeInstanceOf(NewlineCommand);
      });
    });

    it('should resolve printable characters as insert commands', () => {
      const keySignature: KeySignature = {
        key: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: 'a',
        paste: false,
      };

      const command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(InsertCommand);
      command?.execute(mockContext);
      expect(mockContext.insert).toHaveBeenCalledWith('a');
    });

    it('should handle priority correctly', () => {
      // Ctrl+Left should match word movement (priority 5) before basic left (priority 10)
      const keySignature: KeySignature = {
        key: 'left',
        ctrl: true,
        meta: false,
        shift: false,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      const command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeInstanceOf(MoveCommand);
      command?.execute(mockContext);
      expect(mockContext.move).toHaveBeenCalledWith('wordLeft'); // Not 'left'
    });

    it('should return null for unmatched keys', () => {
      const keySignature: KeySignature = {
        key: 'unknown',
        ctrl: true,
        meta: true,
        shift: true,
        alt: false,
        repeat: false,
        sequence: '',
        paste: false,
      };

      const command = resolver.resolve(keySignature, mockContext);
      expect(command).toBeNull();
    });
  });

  describe('BindingResolver management', () => {
    it('should add new bindings', () => {
      const resolver = new BindingResolver([]);
      const binding = {
        description: 'Test binding',
        matcher: () => true,
        command: new NoOpCommand('test'),
        priority: 1,
      };

      resolver.addBinding(binding);
      expect(resolver.getAllBindings()).toContain(binding);
    });

    it('should remove bindings by predicate', () => {
      const resolver = new BindingResolver(createDefaultBindings());
      const initialCount = resolver.getAllBindings().length;

      resolver.removeBindings((binding) =>
        binding.description.includes('Escape'),
      );
      expect(resolver.getAllBindings().length).toBeLessThan(initialCount);
      expect(
        resolver.getAllBindings().some((b) => b.description.includes('Escape')),
      ).toBe(false);
    });

    it('should maintain priority order when adding bindings', () => {
      const resolver = new BindingResolver([]);

      resolver.addBinding({
        description: 'Low priority',
        matcher: () => true,
        command: new NoOpCommand('low'),
        priority: 100,
      });

      resolver.addBinding({
        description: 'High priority',
        matcher: () => true,
        command: new NoOpCommand('high'),
        priority: 1,
      });

      const bindings = resolver.getAllBindings();
      expect(bindings[0].description).toBe('High priority');
      expect(bindings[1].description).toBe('Low priority');
    });
  });

  describe('Integration tests', () => {
    it('should handle complete key binding workflow', () => {
      const resolver = new BindingResolver(createDefaultBindings());

      // Simulate typing "hello" followed by Enter
      const inputs = [
        { name: 'h', sequence: 'h' },
        { name: 'e', sequence: 'e' },
        { name: 'l', sequence: 'l' },
        { name: 'l', sequence: 'l' },
        { name: 'o', sequence: 'o' },
        { name: 'return', sequence: '\r' },
      ];

      inputs.forEach((input) => {
        const keySignature = normalizeKey({
          ...input,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
        });

        const command = resolver.resolve(keySignature, mockContext);
        expect(command).not.toBeNull();
        command?.execute(mockContext);
      });

      expect(mockContext.insert).toHaveBeenCalledTimes(5);
      expect(mockContext.insert).toHaveBeenCalledWith('h');
      expect(mockContext.insert).toHaveBeenCalledWith('e');
      expect(mockContext.insert).toHaveBeenCalledWith('l');
      expect(mockContext.insert).toHaveBeenCalledWith('o');
      expect(mockContext.newline).toHaveBeenCalledTimes(1);
    });
  });
});
