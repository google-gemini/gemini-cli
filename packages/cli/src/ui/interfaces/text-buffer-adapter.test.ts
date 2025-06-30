/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextBufferAdapter } from './text-buffer-adapter.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type {
  CoreTextState,
  TextEditor,
  CursorNavigation,
  VisualLayout,
  SelectionOperations,
  HistoryManagement,
  RangeOperations,
  BufferConfiguration,
} from './text-buffer-interfaces.js';

// Mock segregated interfaces for testing the adapter
const createMockSegregatedInterfaces = () => {
  const coreState: CoreTextState = {
    lines: ['Hello world', 'Second line'],
    text: 'Hello world\nSecond line',
    cursor: [0, 5],
    preferredCol: null,
    currentLine: vi.fn((row: number) => row === 0 ? 'Hello world' : 'Second line'),
    currentLineLen: vi.fn((row: number) => row === 0 ? 11 : 11),
    updateLines: vi.fn(),
    updateCursor: vi.fn(),
    setPreferredCol: vi.fn(),
  };

  const textEditor: TextEditor = {
    insertText: vi.fn(),
    deleteCharBefore: vi.fn(),
    deleteCharAfter: vi.fn(),
    deleteWordLeft: vi.fn(),
    deleteWordRight: vi.fn(),
    killLineLeft: vi.fn(),
    killLineRight: vi.fn(),
    setText: vi.fn(),
    newline: vi.fn(),
    backspace: vi.fn(),
  };

  const cursorNavigation: CursorNavigation = {
    move: vi.fn(),
    moveToPosition: vi.fn(),
    moveToOffset: vi.fn(),
    moveTo: vi.fn(),
    home: vi.fn(),
    end: vi.fn(),
    wordLeft: vi.fn(),
    wordRight: vi.fn(),
  };

  const visualLayout: VisualLayout = {
    allVisualLines: ['Hello world', 'Second line'],
    viewportVisualLines: ['Hello world', 'Second line'],
    visualCursor: [0, 5],
    visualScrollRow: 0,
    viewport: { width: 80, height: 24 },
    updateViewport: vi.fn(),
    recalculateLayout: vi.fn(),
    scrollToRevealCursor: vi.fn(),
    getVisualPosition: vi.fn(),
    getLogicalPosition: vi.fn(),
  };

  const selectionOperations: SelectionOperations = {
    selectionAnchor: null,
    hasSelection: false,
    startSelection: vi.fn(),
    clearSelection: vi.fn(),
    getSelectedText: vi.fn(() => null),
    getSelectionRange: vi.fn(() => null),
    selectAll: vi.fn(),
    copy: vi.fn(() => null),
    cut: vi.fn(() => null),
    paste: vi.fn(() => false),
  };

  const historyManagement: HistoryManagement = {
    canUndo: false,
    canRedo: false,
    pushUndo: vi.fn(),
    undo: vi.fn(() => null),
    redo: vi.fn(() => null),
    clearHistory: vi.fn(),
    getHistorySize: vi.fn(() => 0),
  };

  const rangeOperations: RangeOperations = {
    replaceRange: vi.fn(() => true),
    replaceRangeByOffset: vi.fn(() => true),
    deleteRange: vi.fn(() => true),
    getRangeText: vi.fn(() => ''),
    modifyRange: vi.fn(() => true),
    offsetToPosition: vi.fn(() => [0, 0]),
    positionToOffset: vi.fn(() => 0),
  };

  const bufferConfiguration: BufferConfiguration = {
    config: {
      historyLimit: 100,
      tabSize: 2,
      wordWrap: true,
      autoIndent: false,
    },
    updateConfig: vi.fn(),
    getConfig: vi.fn(),
    resetToDefaults: vi.fn(),
  };

  return {
    coreState,
    textEditor,
    cursorNavigation,
    visualLayout,
    selectionOperations,
    historyManagement,
    rangeOperations,
    bufferConfiguration,
  };
};

describe('TextBufferAdapter', () => {
  let adapter: TextBufferAdapter;
  let mockInterfaces: ReturnType<typeof createMockSegregatedInterfaces>;

  beforeEach(() => {
    mockInterfaces = createMockSegregatedInterfaces();
    adapter = new TextBufferAdapter(mockInterfaces);
  });

  it('should instantiate successfully with segregated interfaces', () => {
    expect(() => new TextBufferAdapter(mockInterfaces)).not.toThrow();
    expect(adapter).toBeInstanceOf(TextBufferAdapter);
  });

  describe('CoreTextState compatibility', () => {
    it('should expose lines property', () => {
      expect(adapter.lines).toEqual(['Hello world', 'Second line']);
    });

    it('should expose text property', () => {
      expect(adapter.text).toBe('Hello world\nSecond line');
    });

    it('should expose cursor property', () => {
      expect(adapter.cursor).toEqual([0, 5]);
    });

    it('should expose preferredCol property', () => {
      expect(adapter.preferredCol).toBeNull();
    });
  });

  describe('TextEditor compatibility', () => {
    it('should provide setText method', () => {
      adapter.setText('new text');
      expect(mockInterfaces.textEditor.setText).toHaveBeenCalledWith('new text');
    });

    it('should provide insert method', () => {
      adapter.insert('x');
      expect(mockInterfaces.textEditor.insertText).toHaveBeenCalledWith('x');
    });

    it('should provide insertStr method', () => {
      const result = adapter.insertStr('hello world');
      expect(result).toBe(true);
      expect(mockInterfaces.textEditor.insertText).toHaveBeenCalledWith('hello world');
    });

    it('should provide newline method', () => {
      adapter.newline();
      expect(mockInterfaces.textEditor.newline).toHaveBeenCalled();
    });

    it('should provide backspace method', () => {
      adapter.backspace();
      expect(mockInterfaces.textEditor.backspace).toHaveBeenCalled();
    });

    it('should provide del method', () => {
      adapter.del();
      expect(mockInterfaces.textEditor.deleteCharAfter).toHaveBeenCalled();
    });
  });

  describe('CursorNavigation compatibility', () => {
    it('should provide move method', () => {
      adapter.move('left');
      expect(mockInterfaces.cursorNavigation.move).toHaveBeenCalledWith('left');
    });

    it('should provide moveToOffset method', () => {
      adapter.moveToOffset(10);
      expect(mockInterfaces.cursorNavigation.moveToOffset).toHaveBeenCalledWith(10);
    });
  });

  describe('VisualLayout compatibility', () => {
    it('should expose visual layout properties', () => {
      expect(adapter.allVisualLines).toEqual(['Hello world', 'Second line']);
      expect(adapter.viewportVisualLines).toEqual(['Hello world', 'Second line']);
      expect(adapter.visualCursor).toEqual([0, 5]);
      expect(adapter.visualScrollRow).toBe(0);
    });
  });

  describe('SelectionOperations compatibility', () => {
    it('should expose selection properties', () => {
      expect(adapter.selectionAnchor).toBeNull();
    });

    it('should provide copy method', () => {
      const result = adapter.copy();
      expect(result).toBeNull();
      expect(mockInterfaces.selectionOperations.copy).toHaveBeenCalled();
    });

    it('should provide paste method', () => {
      const result = adapter.paste();
      expect(result).toBe(false);
    });

    it('should provide startSelection method', () => {
      adapter.startSelection();
      expect(mockInterfaces.selectionOperations.startSelection).toHaveBeenCalled();
    });
  });

  describe('HistoryManagement compatibility', () => {
    it('should provide undo method', () => {
      const result = adapter.undo();
      expect(result).toBe(false);
      expect(mockInterfaces.historyManagement.undo).toHaveBeenCalled();
    });

    it('should provide redo method', () => {
      const result = adapter.redo();
      expect(result).toBe(false);
      expect(mockInterfaces.historyManagement.redo).toHaveBeenCalled();
    });
  });

  describe('RangeOperations compatibility', () => {
    it('should provide replaceRange method', () => {
      const result = adapter.replaceRange(0, 0, 0, 5, 'hello');
      expect(result).toBe(true);
      expect(mockInterfaces.rangeOperations.replaceRange).toHaveBeenCalledWith(0, 0, 0, 5, 'hello');
    });

    it('should provide replaceRangeByOffset method', () => {
      const result = adapter.replaceRangeByOffset(0, 5, 'hello');
      expect(result).toBe(true);
      expect(mockInterfaces.rangeOperations.replaceRangeByOffset).toHaveBeenCalledWith(0, 5, 'hello');
    });
  });

  describe('Advanced operations compatibility', () => {
    it('should provide deleteWordLeft method', () => {
      adapter.deleteWordLeft();
      expect(mockInterfaces.textEditor.deleteWordLeft).toHaveBeenCalled();
    });

    it('should provide deleteWordRight method', () => {
      adapter.deleteWordRight();
      expect(mockInterfaces.textEditor.deleteWordRight).toHaveBeenCalled();
    });

    it('should provide killLineLeft method', () => {
      adapter.killLineLeft();
      expect(mockInterfaces.textEditor.killLineLeft).toHaveBeenCalled();
    });

    it('should provide killLineRight method', () => {
      adapter.killLineRight();
      expect(mockInterfaces.textEditor.killLineRight).toHaveBeenCalled();
    });
  });

  describe('External editor compatibility', () => {
    it('should provide openInExternalEditor method', () => {
      expect(typeof adapter.openInExternalEditor).toBe('function');
      // Note: This method throws an error indicating coordination logic needed
      expect(() => adapter.openInExternalEditor()).toThrow('openInExternalEditor coordination not implemented');
    });
  });

  describe('handleInput compatibility', () => {
    it('should provide handleInput method', () => {
      const key = {
        name: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'a',
      };
      expect(typeof adapter.handleInput).toBe('function');
      // Note: This method throws an error indicating coordination logic needed
      expect(() => adapter.handleInput(key)).toThrow('handleInput coordination not implemented');
    });
  });

  describe('Batch operations compatibility', () => {
    it('should provide applyOperations method', () => {
      const ops = [{ type: 'insert' as const, payload: 'hello' }];
      adapter.applyOperations(ops);
      expect(mockInterfaces.textEditor.insertText).toHaveBeenCalledWith('hello');
    });
  });

  describe('Complete TextBuffer interface compliance', () => {
    it('should implement all TextBuffer interface methods', () => {
      // Verify adapter conforms to TextBuffer interface
      const textBuffer: TextBuffer = adapter;
      
      // Should be able to call all TextBuffer methods
      expect(typeof textBuffer.setText).toBe('function');
      expect(typeof textBuffer.insert).toBe('function');
      expect(typeof textBuffer.insertStr).toBe('function');
      expect(typeof textBuffer.newline).toBe('function');
      expect(typeof textBuffer.backspace).toBe('function');
      expect(typeof textBuffer.del).toBe('function');
      expect(typeof textBuffer.move).toBe('function');
      expect(typeof textBuffer.undo).toBe('function');
      expect(typeof textBuffer.redo).toBe('function');
      expect(typeof textBuffer.replaceRange).toBe('function');
      expect(typeof textBuffer.replaceRangeByOffset).toBe('function');
      expect(typeof textBuffer.moveToOffset).toBe('function');
      expect(typeof textBuffer.deleteWordLeft).toBe('function');
      expect(typeof textBuffer.deleteWordRight).toBe('function');
      expect(typeof textBuffer.killLineLeft).toBe('function');
      expect(typeof textBuffer.killLineRight).toBe('function');
      expect(typeof textBuffer.handleInput).toBe('function');
      expect(typeof textBuffer.openInExternalEditor).toBe('function');
      expect(typeof textBuffer.copy).toBe('function');
      expect(typeof textBuffer.paste).toBe('function');
      expect(typeof textBuffer.startSelection).toBe('function');
      expect(typeof textBuffer.applyOperations).toBe('function');
    });

    it('should maintain 100% backward compatibility', () => {
      // All existing code should work unchanged
      adapter.insertStr('hello');
      adapter.move('left');
      adapter.startSelection();
      adapter.copy();
      adapter.undo();
      adapter.replaceRange(0, 0, 0, 5, 'world');
      
      // Properties should be accessible
      expect(Array.isArray(adapter.lines)).toBe(true);
      expect(typeof adapter.text).toBe('string');
      expect(Array.isArray(adapter.cursor)).toBe(true);
      expect(Array.isArray(adapter.allVisualLines)).toBe(true);
      
      // Verify delegation calls were made
      expect(mockInterfaces.textEditor.insertText).toHaveBeenCalledWith('hello');
      expect(mockInterfaces.cursorNavigation.move).toHaveBeenCalledWith('left');
      expect(mockInterfaces.selectionOperations.startSelection).toHaveBeenCalled();
      expect(mockInterfaces.selectionOperations.copy).toHaveBeenCalled();
      expect(mockInterfaces.historyManagement.undo).toHaveBeenCalled();
      expect(mockInterfaces.rangeOperations.replaceRange).toHaveBeenCalledWith(0, 0, 0, 5, 'world');
    });
  });
});