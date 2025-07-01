/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CoreTextState,
  TextEditor,
  CursorNavigation,
  VisualLayout,
  SelectionOperations,
  HistoryManagement,
  RangeOperations,
  BufferConfiguration,
  type CursorPosition,
  type Direction,
  type Viewport,
  type HistoryEntry,
  type SelectionRange,
  type RangeModification,
  type BufferConfig,
} from './text-buffer-interfaces.js';
import type { UseLogicalTextStateReturn } from '../hooks/useLogicalTextState.js';
import type { UseHistoryStateReturn } from '../hooks/useHistoryState.js';
import type { UseVisualLayoutStateReturn } from '../hooks/useVisualLayoutState.js';
import type { UseSelectionStateReturn } from '../hooks/useSelectionState.js';
import type { UseRangeOperationsReturn } from '../hooks/useRangeOperations.js';

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * CoreTextStateImpl - Implementation using useLogicalTextState hook
 */
export class CoreTextStateImpl implements CoreTextState {
  constructor(private logicalState: UseLogicalTextStateReturn) {}

  get lines(): string[] {
    return this.logicalState.lines;
  }

  get text(): string {
    return this.logicalState.lines.join('\n');
  }

  get cursor(): CursorPosition {
    return [this.logicalState.cursorRow, this.logicalState.cursorCol];
  }

  get preferredCol(): number | null {
    return this.logicalState.preferredCol;
  }

  currentLine(row: number): string {
    return this.logicalState.lines[row] ?? '';
  }

  currentLineLen(row: number): number {
    return this.logicalState.lines[row]?.length ?? 0;
  }

  updateLines(newLines: string[]): void {
    this.logicalState.setLines(newLines);
  }

  updateCursor(position: CursorPosition): void {
    this.logicalState.setCursor(position[0], position[1]);
  }

  setPreferredCol(col: number | null): void {
    this.logicalState.setPreferredCol(col);
  }
}

/**
 * TextEditorImpl - Implementation using useLogicalTextState hook
 */
export class TextEditorImpl implements TextEditor {
  constructor(private logicalState: UseLogicalTextStateReturn) {}

  insertText(text: string, options?: { skipCallbacks?: boolean }): void {
    this.logicalState.insertText(text, options);
  }

  deleteCharBefore(options?: { skipCallbacks?: boolean }): void {
    this.logicalState.deleteCharBefore(options);
  }

  deleteCharAfter(options?: { skipCallbacks?: boolean }): void {
    this.logicalState.deleteCharAfter(options);
  }

  deleteWordLeft(): void {
    // TODO: Implement word deletion logic
    throw new Error('Not implemented');
  }

  deleteWordRight(): void {
    // TODO: Implement word deletion logic
    throw new Error('Not implemented');
  }

  killLineLeft(): void {
    // TODO: Implement line killing logic
    throw new Error('Not implemented');
  }

  killLineRight(): void {
    // TODO: Implement line killing logic
    throw new Error('Not implemented');
  }

  setText(text: string): void {
    const lines = text.split('\n');
    this.logicalState.setLines(lines.length === 0 ? [''] : lines);
  }

  newline(): void {
    this.insertText('\n');
  }

  backspace(): void {
    this.deleteCharBefore();
  }
}

/**
 * CursorNavigationImpl - Implementation using cursor movement logic
 */
export class CursorNavigationImpl implements CursorNavigation {
  constructor(private logicalState: UseLogicalTextStateReturn) {}

  move(direction: Direction): void {
    // TODO: Implement movement logic based on direction
    throw new Error('Not implemented');
  }

  moveToPosition(position: CursorPosition): void {
    this.logicalState.setCursor(position[0], position[1]);
  }

  moveToOffset(offset: number): void {
    // TODO: Implement offset-based positioning
    throw new Error('Not implemented');
  }

  moveTo(row: number, col: number): void {
    this.logicalState.setCursor(row, col);
  }

  home(): void {
    this.logicalState.setCursor(this.logicalState.cursorRow, 0);
  }

  end(): void {
    const currentRow = this.logicalState.cursorRow;
    const lineLength = this.logicalState.getCurrentLineLength();
    this.logicalState.setCursor(currentRow, lineLength);
  }

  wordLeft(): void {
    // TODO: Implement word movement
    throw new Error('Not implemented');
  }

  wordRight(): void {
    // TODO: Implement word movement
    throw new Error('Not implemented');
  }
}

/**
 * VisualLayoutImpl - Implementation using useVisualLayoutState hook
 */
export class VisualLayoutImpl implements VisualLayout {
  constructor(
    private visualState: UseVisualLayoutStateReturn,
    private currentViewport: Viewport,
  ) {}

  get allVisualLines(): string[] {
    return this.visualState.visualLines;
  }

  get viewportVisualLines(): string[] {
    return this.visualState.getVisibleVisualLines();
  }

  get visualCursor(): CursorPosition {
    return this.visualState.visualCursor;
  }

  get visualScrollRow(): number {
    return this.visualState.visualScrollRow;
  }

  get viewport(): Viewport {
    return this.currentViewport;
  }

  updateViewport(viewport: Viewport): void {
    this.currentViewport = viewport;
    // Note: This would need to trigger a recalculation in the actual implementation
  }

  recalculateLayout(): void {
    // The visual layout hook handles this automatically
    // This method is for manual triggers if needed
  }

  scrollToRevealCursor(): void {
    // The visual layout hook handles this automatically
    // This method is for manual triggers if needed
  }

  getVisualPosition(logicalPosition: CursorPosition): CursorPosition {
    const result = this.visualState.logicalToVisual(
      logicalPosition[0],
      logicalPosition[1],
    );
    return result ?? [0, 0];
  }

  getLogicalPosition(visualPosition: CursorPosition): CursorPosition {
    const result = this.visualState.visualToLogical(
      visualPosition[0],
      visualPosition[1],
    );
    return result ?? [0, 0];
  }
}

/**
 * SelectionOperationsImpl - Implementation using useSelectionState hook
 */
export class SelectionOperationsImpl implements SelectionOperations {
  constructor(
    private selectionState: UseSelectionStateReturn,
    private textState: UseLogicalTextStateReturn,
  ) {}

  get selectionAnchor(): CursorPosition | null {
    return this.selectionState.selectionAnchor;
  }

  get hasSelection(): boolean {
    return this.selectionState.hasSelection;
  }

  startSelection(): void {
    const currentCursor: CursorPosition = [
      this.textState.cursorRow,
      this.textState.cursorCol,
    ];
    this.selectionState.setSelectionAnchor(currentCursor);
    this.selectionState.setSelectionExtent(currentCursor);
  }

  clearSelection(): void {
    this.selectionState.clearSelection();
  }

  getSelectedText(): string | null {
    if (!this.hasSelection) return null;
    return this.selectionState.getSelectedText(this.textState.lines);
  }

  getSelectionRange(): SelectionRange | null {
    const bounds = this.selectionState.getSelectionBounds();
    if (!bounds) return null;

    const text = this.selectionState.getSelectedText(this.textState.lines);
    return {
      start: bounds.start,
      end: bounds.end,
      text,
    };
  }

  selectAll(): void {
    const lines = this.textState.lines;
    const lastLine = lines[lines.length - 1] ?? '';
    this.selectionState.selectAll(lines.length, lastLine.length);
  }

  copy(): string | null {
    if (!this.hasSelection) return null;
    this.selectionState.copyToClipboard(this.textState.lines);
    return this.selectionState.clipboardContent;
  }

  cut(): string | null {
    if (!this.hasSelection) return null;
    const text = this.selectionState.getSelectedText(this.textState.lines);
    this.selectionState.cutToClipboard(this.textState.lines);
    return text;
  }

  paste(text: string): boolean {
    this.selectionState.setClipboardContent(text);
    // Insert text at current cursor position
    this.textState.insertText(text);
    return true;
  }
}

/**
 * HistoryManagementImpl - Implementation using useHistoryState hook
 */
export class HistoryManagementImpl implements HistoryManagement {
  constructor(private historyState: UseHistoryStateReturn) {}

  get canUndo(): boolean {
    return this.historyState.canUndo;
  }

  get canRedo(): boolean {
    return this.historyState.canRedo;
  }

  pushUndo(entry: HistoryEntry): void {
    this.historyState.pushUndo(entry);
  }

  undo(): HistoryEntry | null {
    return this.historyState.undo();
  }

  redo(): HistoryEntry | null {
    return this.historyState.redo();
  }

  clearHistory(): void {
    this.historyState.clearHistory();
  }

  getHistorySize(): number {
    return this.historyState.undoStack.length;
  }
}

/**
 * RangeOperationsImpl - Implementation using useRangeOperations hook and additional utilities
 */
export class RangeOperationsImpl implements RangeOperations {
  constructor(
    private rangeOps: UseRangeOperationsReturn,
    private textState: UseLogicalTextStateReturn,
  ) {}

  replaceRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ): boolean {
    return this.rangeOps.replaceRange(startRow, startCol, endRow, endCol, text);
  }

  replaceRangeByOffset(
    startOffset: number,
    endOffset: number,
    text: string,
  ): boolean {
    return this.rangeOps.replaceRangeByOffset(startOffset, endOffset, text);
  }

  deleteRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): boolean {
    return this.replaceRange(startRow, startCol, endRow, endCol, '');
  }

  getRangeText(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): string {
    const lines = this.textState.lines;
    if (startRow === endRow) {
      const line = lines[startRow] ?? '';
      return line.slice(startCol, endCol);
    }

    const result: string[] = [];
    for (let row = startRow; row <= endRow; row++) {
      const line = lines[row] ?? '';
      if (row === startRow) {
        result.push(line.slice(startCol));
      } else if (row === endRow) {
        result.push(line.slice(0, endCol));
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }

  modifyRange(modification: RangeModification): boolean {
    const {
      startRow,
      startCol,
      endRow,
      endCol,
      operation,
      text = '',
    } = modification;

    switch (operation) {
      case 'replace':
        return this.replaceRange(startRow, startCol, endRow, endCol, text);
      case 'delete':
        return this.deleteRange(startRow, startCol, endRow, endCol);
      case 'insert':
        return this.replaceRange(startRow, startCol, startRow, startCol, text);
      default:
        return false;
    }
  }

  offsetToPosition(offset: number): CursorPosition {
    const text = this.textState.lines.join('\n');
    let currentOffset = 0;

    for (let row = 0; row < this.textState.lines.length; row++) {
      const line = this.textState.lines[row] ?? '';
      const lineLength = line.length;

      if (currentOffset + lineLength >= offset) {
        return [row, offset - currentOffset];
      }

      currentOffset += lineLength + 1; // +1 for newline
    }

    // If offset is beyond text, return end position
    const lastRow = this.textState.lines.length - 1;
    const lastLine = this.textState.lines[lastRow] ?? '';
    return [lastRow, lastLine.length];
  }

  positionToOffset(position: CursorPosition): number {
    const [row, col] = position;
    let offset = 0;

    for (let r = 0; r < row && r < this.textState.lines.length; r++) {
      const line = this.textState.lines[r] ?? '';
      offset += line.length + 1; // +1 for newline
    }

    return offset + col;
  }
}

/**
 * BufferConfigurationImpl - Implementation for buffer configuration
 */
export class BufferConfigurationImpl implements BufferConfiguration {
  private _config: BufferConfig = {
    historyLimit: 100,
    tabSize: 2,
    wordWrap: true,
    autoIndent: false,
  };

  get config(): BufferConfig {
    return { ...this._config };
  }

  updateConfig(newConfig: Partial<BufferConfig>): void {
    this._config = { ...this._config, ...newConfig };
  }

  getConfig(): BufferConfig {
    return { ...this._config };
  }

  resetToDefaults(): void {
    this._config = {
      historyLimit: 100,
      tabSize: 2,
      wordWrap: true,
      autoIndent: false,
    };
  }
}
