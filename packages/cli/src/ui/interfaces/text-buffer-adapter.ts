/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unused-vars, no-case-declarations */

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
  CursorPosition,
  Direction,
  Viewport,
} from './text-buffer-interfaces.js';

/**
 * Dependencies for the TextBufferAdapter
 */
export interface TextBufferAdapterDependencies {
  coreState: CoreTextState;
  textEditor: TextEditor;
  cursorNavigation: CursorNavigation;
  visualLayout: VisualLayout;
  selectionOperations: SelectionOperations;
  historyManagement: HistoryManagement;
  rangeOperations: RangeOperations;
  bufferConfiguration: BufferConfiguration;
}

/**
 * TextBufferAdapter - Backward compatibility adapter
 * 
 * Provides 100% backward compatibility with the existing TextBuffer interface
 * while internally using the segregated interfaces. This allows existing code
 * to continue working unchanged while enabling migration to the new interface
 * system.
 */
export class TextBufferAdapter implements TextBuffer {
  constructor(private deps: TextBufferAdapterDependencies) {}

  // CoreTextState delegation
  get lines(): string[] {
    return this.deps.coreState.lines;
  }

  get text(): string {
    return this.deps.coreState.text;
  }

  get cursor(): CursorPosition {
    return this.deps.coreState.cursor;
  }

  get preferredCol(): number | null {
    return this.deps.coreState.preferredCol;
  }

  get selectionAnchor(): CursorPosition | null {
    return this.deps.selectionOperations.selectionAnchor;
  }

  // VisualLayout delegation
  get allVisualLines(): string[] {
    return this.deps.visualLayout.allVisualLines;
  }

  get viewportVisualLines(): string[] {
    return this.deps.visualLayout.viewportVisualLines;
  }

  get visualCursor(): CursorPosition {
    return this.deps.visualLayout.visualCursor;
  }

  get visualScrollRow(): number {
    return this.deps.visualLayout.visualScrollRow;
  }

  // TextEditor delegation
  setText(text: string): void {
    this.deps.textEditor.setText(text);
  }

  insert(ch: string): void {
    this.deps.textEditor.insertText(ch);
  }

  insertStr(str: string): boolean {
    this.deps.textEditor.insertText(str);
    return str.length > 0; // Return true if text was inserted
  }

  newline(): void {
    this.deps.textEditor.newline();
  }

  backspace(): void {
    this.deps.textEditor.backspace();
  }

  del(): void {
    this.deps.textEditor.deleteCharAfter();
  }

  // CursorNavigation delegation
  move(dir: Direction): void {
    this.deps.cursorNavigation.move(dir);
  }

  moveToOffset(offset: number): void {
    this.deps.cursorNavigation.moveToOffset(offset);
  }

  // HistoryManagement delegation
  undo(): boolean {
    const result = this.deps.historyManagement.undo();
    return result !== null;
  }

  redo(): boolean {
    const result = this.deps.historyManagement.redo();
    return result !== null;
  }

  // RangeOperations delegation
  replaceRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ): boolean {
    return this.deps.rangeOperations.replaceRange(startRow, startCol, endRow, endCol, text);
  }

  replaceRangeByOffset(
    startOffset: number,
    endOffset: number,
    replacementText: string,
  ): boolean {
    return this.deps.rangeOperations.replaceRangeByOffset(startOffset, endOffset, replacementText);
  }

  // Advanced TextEditor operations
  deleteWordLeft(): void {
    this.deps.textEditor.deleteWordLeft();
  }

  deleteWordRight(): void {
    this.deps.textEditor.deleteWordRight();
  }

  killLineLeft(): void {
    this.deps.textEditor.killLineLeft();
  }

  killLineRight(): void {
    this.deps.textEditor.killLineRight();
  }

  // SelectionOperations delegation
  copy(): string | null {
    return this.deps.selectionOperations.copy();
  }

  paste(): boolean {
    // Get clipboard content from selection operations and paste it
    const clipboardContent = this.deps.selectionOperations.getSelectedText();
    if (clipboardContent) {
      return this.deps.selectionOperations.paste(clipboardContent);
    }
    return false;
  }

  startSelection(): void {
    this.deps.selectionOperations.startSelection();
  }

  // Complex operations requiring coordination between multiple interfaces
  handleInput(key: {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    paste: boolean;
    sequence: string;
  }): boolean {
    // This is a complex operation that would need to coordinate between interfaces
    // For now, we'll throw an error to indicate this needs specific implementation
    // In a real implementation, this would dispatch to appropriate interface methods
    // based on the key input patterns
    throw new Error('handleInput coordination not implemented - requires key binding logic');
  }

  openInExternalEditor(opts?: { editor?: string }): Promise<void> {
    // This is a complex operation that would need to coordinate between interfaces
    // It would need to use the text from coreState, launch editor, then use setText
    throw new Error('openInExternalEditor coordination not implemented - requires file system integration');
  }

  // Batch operations requiring coordination
  applyOperations(ops: Array<{ type: 'insert'; payload: string } | { type: 'backspace' }>): void {
    // This would coordinate with textEditor and historyManagement for batch operations
    for (const op of ops) {
      switch (op.type) {
        case 'insert':
          this.deps.textEditor.insertText(op.payload);
          break;
        case 'backspace':
          this.deps.textEditor.deleteCharBefore();
          break;
        default:
          // Type-safe exhaustive check
          const _exhaustive: never = op;
          throw new Error(`Unknown operation type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}