/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export common types for convenience
export type CursorPosition = [number, number];
export type Direction = 'left' | 'right' | 'up' | 'down' | 'wordLeft' | 'wordRight' | 'home' | 'end';

/**
 * Viewport dimensions for rendering calculations
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * History entry for undo/redo operations
 */
export interface HistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

/**
 * Selection range with start and end positions
 */
export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
  text: string;
}

/**
 * Range modification operation
 */
export interface RangeModification {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  operation: 'replace' | 'delete' | 'insert';
  text?: string;
}

/**
 * Buffer configuration options
 */
export interface BufferConfig {
  historyLimit: number;
  tabSize: number;
  wordWrap: boolean;
  autoIndent: boolean;
}

/**
 * CoreTextState Interface - Basic text state (lines, cursor position)
 * 
 * Responsible for fundamental text storage and cursor positioning.
 * This is the foundation interface that provides access to the raw text
 * content and current cursor location.
 */
export interface CoreTextState {
  // State properties
  readonly lines: string[];
  readonly text: string;
  readonly cursor: CursorPosition;
  readonly preferredCol: number | null;

  // Core text access
  currentLine(row: number): string;
  currentLineLen(row: number): number;

  // State updates
  updateLines(newLines: string[]): void;
  updateCursor(position: CursorPosition): void;
  setPreferredCol(col: number | null): void;
}

/**
 * TextEditor Interface - Text editing operations (insert, delete, etc.)
 * 
 * Provides all text modification operations. Handles character-level
 * and line-level edits, including advanced editing operations like
 * word deletion and line killing.
 */
export interface TextEditor {
  // Basic editing
  insertText(text: string, options?: { skipCallbacks?: boolean }): void;
  deleteCharBefore(options?: { skipCallbacks?: boolean }): void;
  deleteCharAfter(options?: { skipCallbacks?: boolean }): void;

  // Word-level operations
  deleteWordLeft(): void;
  deleteWordRight(): void;

  // Line-level operations
  killLineLeft(): void;
  killLineRight(): void;

  // Bulk operations
  setText(text: string): void;

  // Convenience methods
  newline(): void;
  backspace(): void;
}

/**
 * CursorNavigation Interface - Cursor movement and positioning
 * 
 * Handles all cursor movement operations. Provides both high-level
 * directional movement and precise positioning capabilities.
 */
export interface CursorNavigation {
  // Directional movement
  move(direction: Direction): void;

  // Direct positioning
  moveToPosition(position: CursorPosition): void;
  moveToOffset(offset: number): void;
  moveTo(row: number, col: number): void;

  // Convenience movements
  home(): void;
  end(): void;
  wordLeft(): void;
  wordRight(): void;
}

/**
 * VisualLayout Interface - Visual rendering and layout
 * 
 * Manages the visual representation of text, handling line wrapping,
 * scrolling, and the mapping between logical and visual coordinates.
 */
export interface VisualLayout {
  // Visual state properties
  readonly allVisualLines: string[];
  readonly viewportVisualLines: string[];
  readonly visualCursor: CursorPosition;
  readonly visualScrollRow: number;
  readonly viewport: Viewport;

  // Layout management
  updateViewport(viewport: Viewport): void;
  recalculateLayout(): void;
  scrollToRevealCursor(): void;

  // Coordinate mapping
  getVisualPosition(logicalPosition: CursorPosition): CursorPosition;
  getLogicalPosition(visualPosition: CursorPosition): CursorPosition;
}

/**
 * SelectionOperations Interface - Text selection and clipboard
 * 
 * Provides text selection functionality and clipboard operations.
 * Handles both keyboard-driven and programmatic selection operations.
 */
export interface SelectionOperations {
  // Selection state
  readonly selectionAnchor: CursorPosition | null;
  readonly hasSelection: boolean;

  // Selection management
  startSelection(): void;
  clearSelection(): void;
  getSelectedText(): string | null;
  getSelectionRange(): SelectionRange | null;
  selectAll(): void;

  // Clipboard operations
  copy(): string | null;
  cut(): string | null;
  paste(text: string): boolean;
}

/**
 * HistoryManagement Interface - Undo/redo functionality
 * 
 * Manages the undo/redo stack and provides operations for
 * reverting and replaying changes to the text buffer.
 */
export interface HistoryManagement {
  // History state
  readonly canUndo: boolean;
  readonly canRedo: boolean;

  // History operations
  pushUndo(entry: HistoryEntry): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;

  // History management
  clearHistory(): void;
  getHistorySize(): number;
}

/**
 * RangeOperations Interface - Range-based text manipulation
 * 
 * Provides operations for manipulating text ranges, including
 * replacement, deletion, and coordinate conversion utilities.
 */
export interface RangeOperations {
  // Range modifications
  replaceRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ): boolean;

  replaceRangeByOffset(
    startOffset: number,
    endOffset: number,
    text: string,
  ): boolean;

  deleteRange(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): boolean;

  getRangeText(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): string;

  modifyRange(modification: RangeModification): boolean;

  // Coordinate utilities
  offsetToPosition(offset: number): CursorPosition;
  positionToOffset(position: CursorPosition): number;
}

/**
 * BufferConfiguration Interface - Configuration and metadata
 * 
 * Manages buffer-level configuration options such as history limits,
 * tab settings, and editor behavior preferences.
 */
export interface BufferConfiguration {
  // Configuration state
  readonly config: BufferConfig;

  // Configuration management
  updateConfig(newConfig: Partial<BufferConfig>): void;
  getConfig(): BufferConfig;
  resetToDefaults(): void;
}