/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

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
  HistoryEntry,
  SelectionRange,
  RangeModification,
  BufferConfig,
} from './text-buffer-interfaces.js';

/**
 * Props for BasicTextEditor composition
 */
export interface BasicTextEditorProps {
  coreState: CoreTextState;
  textEditor: TextEditor;
}

/**
 * Props for AdvancedTextEditor composition
 */
export interface AdvancedTextEditorProps {
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
 * Props for ReadOnlyTextBuffer composition
 */
export interface ReadOnlyTextBufferProps {
  coreState: CoreTextState;
  visualLayout: VisualLayout;
}

/**
 * BasicTextEditor - Composes CoreTextState + TextEditor
 *
 * Provides essential text editing capabilities without advanced features.
 * Ideal for simple text input scenarios where full text buffer functionality
 * is not required.
 */
export class BasicTextEditor implements CoreTextState, TextEditor {
  constructor(private props: BasicTextEditorProps) {}

  // CoreTextState implementation - delegate to coreState
  get lines(): string[] {
    return this.props.coreState.lines;
  }

  get text(): string {
    return this.props.coreState.text;
  }

  get cursor(): CursorPosition {
    return this.props.coreState.cursor;
  }

  get preferredCol(): number | null {
    return this.props.coreState.preferredCol;
  }

  currentLine(row: number): string {
    return this.props.coreState.currentLine(row);
  }

  currentLineLen(row: number): number {
    return this.props.coreState.currentLineLen(row);
  }

  updateLines(newLines: string[]): void {
    this.props.coreState.updateLines(newLines);
  }

  updateCursor(position: CursorPosition): void {
    this.props.coreState.updateCursor(position);
  }

  setPreferredCol(col: number | null): void {
    this.props.coreState.setPreferredCol(col);
  }

  // TextEditor implementation - delegate to textEditor
  insertText(text: string, options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.insertText(text, options);
  }

  deleteCharBefore(options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.deleteCharBefore(options);
  }

  deleteCharAfter(options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.deleteCharAfter(options);
  }

  deleteWordLeft(): void {
    this.props.textEditor.deleteWordLeft();
  }

  deleteWordRight(): void {
    this.props.textEditor.deleteWordRight();
  }

  killLineLeft(): void {
    this.props.textEditor.killLineLeft();
  }

  killLineRight(): void {
    this.props.textEditor.killLineRight();
  }

  setText(text: string): void {
    this.props.textEditor.setText(text);
  }

  newline(): void {
    this.props.textEditor.newline();
  }

  backspace(): void {
    this.props.textEditor.backspace();
  }
}

/**
 * AdvancedTextEditor - Composes all interfaces
 *
 * Provides full text buffer functionality with all advanced features.
 * This is the complete text editing solution that includes visual layout,
 * selection, history, range operations, and configuration.
 */
export class AdvancedTextEditor
  implements
    CoreTextState,
    TextEditor,
    CursorNavigation,
    VisualLayout,
    SelectionOperations,
    HistoryManagement,
    RangeOperations,
    BufferConfiguration
{
  constructor(private props: AdvancedTextEditorProps) {}

  // CoreTextState implementation - delegate to coreState
  get lines(): string[] {
    return this.props.coreState.lines;
  }

  get text(): string {
    return this.props.coreState.text;
  }

  get cursor(): CursorPosition {
    return this.props.coreState.cursor;
  }

  get preferredCol(): number | null {
    return this.props.coreState.preferredCol;
  }

  currentLine(row: number): string {
    return this.props.coreState.currentLine(row);
  }

  currentLineLen(row: number): number {
    return this.props.coreState.currentLineLen(row);
  }

  updateLines(newLines: string[]): void {
    this.props.coreState.updateLines(newLines);
  }

  updateCursor(position: CursorPosition): void {
    this.props.coreState.updateCursor(position);
  }

  setPreferredCol(col: number | null): void {
    this.props.coreState.setPreferredCol(col);
  }

  // TextEditor implementation - delegate to textEditor
  insertText(text: string, options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.insertText(text, options);
  }

  deleteCharBefore(options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.deleteCharBefore(options);
  }

  deleteCharAfter(options?: { skipCallbacks?: boolean }): void {
    this.props.textEditor.deleteCharAfter(options);
  }

  deleteWordLeft(): void {
    this.props.textEditor.deleteWordLeft();
  }

  deleteWordRight(): void {
    this.props.textEditor.deleteWordRight();
  }

  killLineLeft(): void {
    this.props.textEditor.killLineLeft();
  }

  killLineRight(): void {
    this.props.textEditor.killLineRight();
  }

  setText(text: string): void {
    this.props.textEditor.setText(text);
  }

  newline(): void {
    this.props.textEditor.newline();
  }

  backspace(): void {
    this.props.textEditor.backspace();
  }

  // CursorNavigation implementation - delegate to cursorNavigation
  move(direction: Direction): void {
    this.props.cursorNavigation.move(direction);
  }

  moveToPosition(position: CursorPosition): void {
    this.props.cursorNavigation.moveToPosition(position);
  }

  moveToOffset(offset: number): void {
    this.props.cursorNavigation.moveToOffset(offset);
  }

  moveTo(row: number, col: number): void {
    this.props.cursorNavigation.moveTo(row, col);
  }

  home(): void {
    this.props.cursorNavigation.home();
  }

  end(): void {
    this.props.cursorNavigation.end();
  }

  wordLeft(): void {
    this.props.cursorNavigation.wordLeft();
  }

  wordRight(): void {
    this.props.cursorNavigation.wordRight();
  }

  // VisualLayout implementation - delegate to visualLayout
  get allVisualLines(): string[] {
    return this.props.visualLayout.allVisualLines;
  }

  get viewportVisualLines(): string[] {
    return this.props.visualLayout.viewportVisualLines;
  }

  get visualCursor(): CursorPosition {
    return this.props.visualLayout.visualCursor;
  }

  get visualScrollRow(): number {
    return this.props.visualLayout.visualScrollRow;
  }

  get viewport(): Viewport {
    return this.props.visualLayout.viewport;
  }

  updateViewport(viewport: Viewport): void {
    this.props.visualLayout.updateViewport(viewport);
  }

  recalculateLayout(): void {
    this.props.visualLayout.recalculateLayout();
  }

  scrollToRevealCursor(): void {
    this.props.visualLayout.scrollToRevealCursor();
  }

  getVisualPosition(logicalPosition: CursorPosition): CursorPosition {
    return this.props.visualLayout.getVisualPosition(logicalPosition);
  }

  getLogicalPosition(visualPosition: CursorPosition): CursorPosition {
    return this.props.visualLayout.getLogicalPosition(visualPosition);
  }

  // SelectionOperations implementation - delegate to selectionOperations
  get selectionAnchor(): CursorPosition | null {
    return this.props.selectionOperations.selectionAnchor;
  }

  get hasSelection(): boolean {
    return this.props.selectionOperations.hasSelection;
  }

  startSelection(): void {
    this.props.selectionOperations.startSelection();
  }

  clearSelection(): void {
    this.props.selectionOperations.clearSelection();
  }

  getSelectedText(): string | null {
    return this.props.selectionOperations.getSelectedText();
  }

  getSelectionRange(): SelectionRange | null {
    return this.props.selectionOperations.getSelectionRange();
  }

  selectAll(): void {
    this.props.selectionOperations.selectAll();
  }

  copy(): string | null {
    return this.props.selectionOperations.copy();
  }

  cut(): string | null {
    return this.props.selectionOperations.cut();
  }

  paste(text: string): boolean {
    return this.props.selectionOperations.paste(text);
  }

  // HistoryManagement implementation - delegate to historyManagement
  get canUndo(): boolean {
    return this.props.historyManagement.canUndo;
  }

  get canRedo(): boolean {
    return this.props.historyManagement.canRedo;
  }

  pushUndo(entry: HistoryEntry): void {
    this.props.historyManagement.pushUndo(entry);
  }

  undo(): HistoryEntry | null {
    return this.props.historyManagement.undo();
  }

  redo(): HistoryEntry | null {
    return this.props.historyManagement.redo();
  }

  clearHistory(): void {
    this.props.historyManagement.clearHistory();
  }

  getHistorySize(): number {
    return this.props.historyManagement.getHistorySize();
  }

  // RangeOperations implementation - delegate to rangeOperations
  replaceRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ): boolean {
    return this.props.rangeOperations.replaceRange(
      startRow,
      startCol,
      endRow,
      endCol,
      text,
    );
  }

  replaceRangeByOffset(
    startOffset: number,
    endOffset: number,
    text: string,
  ): boolean {
    return this.props.rangeOperations.replaceRangeByOffset(
      startOffset,
      endOffset,
      text,
    );
  }

  deleteRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): boolean {
    return this.props.rangeOperations.deleteRange(
      startRow,
      startCol,
      endRow,
      endCol,
    );
  }

  getRangeText(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): string {
    return this.props.rangeOperations.getRangeText(
      startRow,
      startCol,
      endRow,
      endCol,
    );
  }

  modifyRange(modification: RangeModification): boolean {
    return this.props.rangeOperations.modifyRange(modification);
  }

  offsetToPosition(offset: number): CursorPosition {
    return this.props.rangeOperations.offsetToPosition(offset);
  }

  positionToOffset(position: CursorPosition): number {
    return this.props.rangeOperations.positionToOffset(position);
  }

  // BufferConfiguration implementation - delegate to bufferConfiguration
  get config(): BufferConfig {
    return this.props.bufferConfiguration.config;
  }

  updateConfig(newConfig: Partial<BufferConfig>): void {
    this.props.bufferConfiguration.updateConfig(newConfig);
  }

  getConfig(): BufferConfig {
    return this.props.bufferConfiguration.getConfig();
  }

  resetToDefaults(): void {
    this.props.bufferConfiguration.resetToDefaults();
  }
}

/**
 * ReadOnlyTextBuffer - Composes CoreTextState + VisualLayout
 *
 * Provides read-only access to text content with visual layout capabilities.
 * Ideal for display scenarios where text editing is not required but
 * visual presentation and navigation are needed.
 */
export class ReadOnlyTextBuffer implements CoreTextState, VisualLayout {
  constructor(private props: ReadOnlyTextBufferProps) {}

  // CoreTextState implementation (read-only) - delegate to coreState
  get lines(): string[] {
    return this.props.coreState.lines;
  }

  get text(): string {
    return this.props.coreState.text;
  }

  get cursor(): CursorPosition {
    return this.props.coreState.cursor;
  }

  get preferredCol(): number | null {
    return this.props.coreState.preferredCol;
  }

  currentLine(row: number): string {
    return this.props.coreState.currentLine(row);
  }

  currentLineLen(row: number): number {
    return this.props.coreState.currentLineLen(row);
  }

  updateLines(newLines: string[]): void {
    throw new Error('Not implemented - read-only buffer');
  }

  updateCursor(position: CursorPosition): void {
    this.props.coreState.updateCursor(position);
  }

  setPreferredCol(col: number | null): void {
    this.props.coreState.setPreferredCol(col);
  }

  // VisualLayout implementation - delegate to visualLayout
  get allVisualLines(): string[] {
    return this.props.visualLayout.allVisualLines;
  }

  get viewportVisualLines(): string[] {
    return this.props.visualLayout.viewportVisualLines;
  }

  get visualCursor(): CursorPosition {
    return this.props.visualLayout.visualCursor;
  }

  get visualScrollRow(): number {
    return this.props.visualLayout.visualScrollRow;
  }

  get viewport(): Viewport {
    return this.props.visualLayout.viewport;
  }

  updateViewport(viewport: Viewport): void {
    this.props.visualLayout.updateViewport(viewport);
  }

  recalculateLayout(): void {
    this.props.visualLayout.recalculateLayout();
  }

  scrollToRevealCursor(): void {
    this.props.visualLayout.scrollToRevealCursor();
  }

  getVisualPosition(logicalPosition: CursorPosition): CursorPosition {
    return this.props.visualLayout.getVisualPosition(logicalPosition);
  }

  getLogicalPosition(visualPosition: CursorPosition): CursorPosition {
    return this.props.visualLayout.getLogicalPosition(visualPosition);
  }
}
