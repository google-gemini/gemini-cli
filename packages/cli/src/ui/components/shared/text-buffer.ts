/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import pathMod from 'path';
import { useState, useCallback, useEffect, useMemo } from 'react';

export type Direction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end';

// Simple helper for word‑wise ops.
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return !/[\s,.;!?]/.test(ch);
}

export interface Viewport {
  height: number;
  width: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/*
 * -------------------------------------------------------------------------
 *  Unicode‑aware helpers (work at the code‑point level rather than UTF‑16
 *  code units so that surrogate‑pair emoji count as one "column".)
 * ---------------------------------------------------------------------- */

function toCodePoints(str: string): string[] {
  // [...str] or Array.from both iterate by UTF‑32 code point, handling
  // surrogate pairs correctly.
  return Array.from(str);
}

function cpLen(str: string): number {
  return toCodePoints(str).length;
}

function cpSlice(str: string, start: number, end?: number): string {
  // Slice by code‑point indices and re‑join.
  const arr = toCodePoints(str).slice(start, end);
  return arr.join('');
}

/* -------------------------------------------------------------------------
 *  Debug helper – enable verbose logging by setting env var TEXTBUFFER_DEBUG=1
 * ---------------------------------------------------------------------- */

// Enable verbose logging only when requested via env var.
const DEBUG =
  process.env['TEXTBUFFER_DEBUG'] === '1' ||
  process.env['TEXTBUFFER_DEBUG'] === 'true';

function dbg(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[TextBuffer]', ...args);
  }
}

/* ────────────────────────────────────────────────────────────────────────── */

interface UseTextBufferProps {
  initialText?: string;
  initialCursorOffset?: number;
  viewport: Viewport; // Viewport dimensions needed for scrolling
  stdin?: NodeJS.ReadStream | null; // For external editor
  setRawMode?: (mode: boolean) => void; // For external editor
  onChange?: (text: string) => void; // Callback for when text changes
}

interface UndoHistoryEntry {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

function calculateInitialCursorPosition(
  initialLines: string[],
  offset: number,
): [number, number] {
  let remainingChars = offset;
  let row = 0;
  while (row < initialLines.length) {
    const lineLength = cpLen(initialLines[row]);
    // Add 1 for the newline character (except for the last line)
    const totalCharsInLineAndNewline =
      lineLength + (row < initialLines.length - 1 ? 1 : 0);

    if (remainingChars <= lineLength) {
      // Cursor is on this line
      return [row, remainingChars];
    }
    remainingChars -= totalCharsInLineAndNewline;
    row++;
  }
  // Offset is beyond the text, place cursor at the end of the last line
  if (initialLines.length > 0) {
    const lastRow = initialLines.length - 1;
    return [lastRow, cpLen(initialLines[lastRow])];
  }
  return [0, 0]; // Default for empty text
}

export function useTextBuffer({
  initialText = '',
  initialCursorOffset = 0,
  viewport,
  stdin,
  setRawMode,
  onChange,
}: UseTextBufferProps): TextBuffer {
  const [lines, setLines] = useState<string[]>(() => {
    const l = initialText.split('\n');
    return l.length === 0 ? [''] : l;
  });

  const [[initialCursorRow, initialCursorCol]] = useState(() =>
    calculateInitialCursorPosition(lines, initialCursorOffset),
  );

  const [cursorRow, setCursorRow] = useState<number>(initialCursorRow);
  const [cursorCol, setCursorCol] = useState<number>(initialCursorCol);
  const [scrollRow, setScrollRow] = useState<number>(0);
  const [scrollCol, setScrollCol] = useState<number>(0);
  const [preferredCol, setPreferredCol] = useState<number | null>(null);

  const [undoStack, setUndoStack] = useState<UndoHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoHistoryEntry[]>([]);
  const historyLimit = 100;

  const [clipboard, setClipboard] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<
    [number, number] | null
  >(null);

  const currentLine = useCallback(
    (r: number): string => lines[r] ?? '',
    [lines],
  );
  const currentLineLen = useCallback(
    (r: number): number => cpLen(currentLine(r)),
    [currentLine],
  );

  useEffect(() => {
    const { height, width } = viewport;
    let newScrollRow = scrollRow;
    let newScrollCol = scrollCol;

    if (cursorRow < scrollRow) {
      newScrollRow = cursorRow;
    } else if (cursorRow >= scrollRow + height) {
      newScrollRow = cursorRow - height + 1;
    }

    if (cursorCol < scrollCol) {
      newScrollCol = cursorCol;
    } else if (cursorCol >= scrollCol + width) {
      newScrollCol = cursorCol - width + 1;
    }

    if (newScrollRow !== scrollRow) {
      setScrollRow(newScrollRow);
    }
    if (newScrollCol !== scrollCol) {
      setScrollCol(newScrollCol);
    }
  }, [cursorRow, cursorCol, scrollRow, scrollCol, viewport]);

  const pushUndo = useCallback(() => {
    dbg('pushUndo', { cursor: [cursorRow, cursorCol], text: lines.join('\n') });
    const snapshot = { lines: [...lines], cursorRow, cursorCol };
    setUndoStack((prev) => {
      const newStack = [...prev, snapshot];
      if (newStack.length > historyLimit) {
        newStack.shift();
      }
      return newStack;
    });
    setRedoStack([]);
  }, [lines, cursorRow, cursorCol, historyLimit]);

  const _restoreState = useCallback(
    (state: UndoHistoryEntry | undefined): boolean => {
      if (!state) return false;
      setLines(state.lines);
      setCursorRow(state.cursorRow);
      setCursorCol(state.cursorCol);
      return true;
    },
    [],
  );

  const text = lines.join('\n');

  // TODO(jacobr): stop using useEffect for this case. This may require a
  // refactor of App.tsx and InputPrompt.tsx to simplify where onChange is used.
  useEffect(() => {
    if (onChange) {
      onChange(text);
    }
  }, [text, onChange]);

  const undo = useCallback((): boolean => {
    const state = undoStack[undoStack.length - 1];
    if (!state) return false;

    setUndoStack((prev) => prev.slice(0, -1));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setRedoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [undoStack, lines, cursorRow, cursorCol, _restoreState]);

  const redo = useCallback((): boolean => {
    const state = redoStack[redoStack.length - 1];
    if (!state) return false;

    setRedoStack((prev) => prev.slice(0, -1));
    const currentSnapshot = { lines: [...lines], cursorRow, cursorCol };
    setUndoStack((prev) => [...prev, currentSnapshot]);
    return _restoreState(state);
  }, [redoStack, lines, cursorRow, cursorCol, _restoreState]);

  const insertStr = useCallback(
    (str: string): boolean => {
      dbg('insertStr', { str, beforeCursor: [cursorRow, cursorCol] });
      if (str === '') return false;

      pushUndo();
      const normalised = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const parts = normalised.split('\n');

      setLines((prevLines) => {
        const newLines = [...prevLines];
        const lineContent = currentLine(cursorRow);
        const before = cpSlice(lineContent, 0, cursorCol);
        const after = cpSlice(lineContent, cursorCol);

        newLines[cursorRow] = before + parts[0];

        if (parts.length > 2) {
          const middle = parts.slice(1, -1);
          newLines.splice(cursorRow + 1, 0, ...middle);
        }

        const lastPart = parts[parts.length - 1]!;
        newLines.splice(cursorRow + (parts.length - 1), 0, lastPart + after);

        setCursorRow((prev) => prev + parts.length - 1);
        setCursorCol(cpLen(lastPart));
        return newLines;
      });
      setPreferredCol(null);
      return true;
    },
    [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol],
  );

  const insert = useCallback(
    (ch: string): void => {
      if (/[\n\r]/.test(ch)) {
        insertStr(ch);
        return;
      }
      dbg('insert', { ch, beforeCursor: [cursorRow, cursorCol] });
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        const lineContent = currentLine(cursorRow);
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          ch +
          cpSlice(lineContent, cursorCol);
        return newLines;
      });
      setCursorCol((prev) => prev + ch.length);
      setPreferredCol(null);
    },
    [pushUndo, cursorRow, cursorCol, currentLine, insertStr, setPreferredCol],
  );

  const newline = useCallback((): void => {
    dbg('newline', { beforeCursor: [cursorRow, cursorCol] });
    pushUndo();
    setLines((prevLines) => {
      const newLines = [...prevLines];
      const l = currentLine(cursorRow);
      const before = cpSlice(l, 0, cursorCol);
      const after = cpSlice(l, cursorCol);
      newLines[cursorRow] = before;
      newLines.splice(cursorRow + 1, 0, after);
      return newLines;
    });
    setCursorRow((prev) => prev + 1);
    setCursorCol(0);
    setPreferredCol(null);
  }, [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol]);

  const backspace = useCallback((): void => {
    dbg('backspace', { beforeCursor: [cursorRow, cursorCol] });
    if (cursorCol === 0 && cursorRow === 0) return;

    pushUndo();
    if (cursorCol > 0) {
      setLines((prevLines) => {
        const newLines = [...prevLines];
        const lineContent = currentLine(cursorRow);
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol - 1) +
          cpSlice(lineContent, cursorCol);
        return newLines;
      });
      setCursorCol((prev) => prev - 1);
    } else if (cursorRow > 0) {
      const prevLineContent = currentLine(cursorRow - 1);
      const currentLineContentVal = currentLine(cursorRow);
      const newCol = cpLen(prevLineContent);
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow - 1] = prevLineContent + currentLineContentVal;
        newLines.splice(cursorRow, 1);
        return newLines;
      });
      setCursorRow((prev) => prev - 1);
      setCursorCol(newCol);
    }
    setPreferredCol(null);
  }, [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol]);

  const del = useCallback((): void => {
    dbg('delete', { beforeCursor: [cursorRow, cursorCol] });
    const lineContent = currentLine(cursorRow);
    if (cursorCol < currentLineLen(cursorRow)) {
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] =
          cpSlice(lineContent, 0, cursorCol) +
          cpSlice(lineContent, cursorCol + 1);
        return newLines;
      });
    } else if (cursorRow < lines.length - 1) {
      pushUndo();
      const nextLineContent = currentLine(cursorRow + 1);
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = lineContent + nextLineContent;
        newLines.splice(cursorRow + 1, 1);
        return newLines;
      });
    }
    // cursor position does not change for del
    setPreferredCol(null);
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    currentLineLen,
    lines.length,
    setPreferredCol,
  ]);

  const setText = useCallback(
    (text: string): void => {
      dbg('setText', { text });
      pushUndo();
      const newContentLines = text.replace(/\r\n?/g, '\n').split('\n');
      setLines(newContentLines.length === 0 ? [''] : newContentLines);
      setCursorRow(newContentLines.length - 1);
      setCursorCol(cpLen(newContentLines[newContentLines.length - 1] ?? ''));
      setScrollRow(0);
      setScrollCol(0);
      setPreferredCol(null);
    },
    [pushUndo, setPreferredCol],
  );

  const replaceRange = useCallback(
    (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      text: string,
    ): boolean => {
      if (
        startRow > endRow ||
        (startRow === endRow && startCol > endCol) ||
        startRow < 0 ||
        startCol < 0 ||
        endRow >= lines.length
      ) {
        console.error('Invalid range provided to replaceRange');
        return false;
      }
      dbg('replaceRange', {
        start: [startRow, startCol],
        end: [endRow, endCol],
        text,
      });
      pushUndo();

      const sCol = clamp(startCol, 0, currentLineLen(startRow));
      const eCol = clamp(endCol, 0, currentLineLen(endRow));

      const prefix = cpSlice(currentLine(startRow), 0, sCol);
      const suffix = cpSlice(currentLine(endRow), eCol);

      setLines((prevLines) => {
        const newLines = [...prevLines];
        if (startRow < endRow) {
          newLines.splice(startRow + 1, endRow - startRow);
        }
        newLines[startRow] = prefix + suffix;
        // Now insert text at this new effective cursor position
        const tempCursorRow = startRow;
        const tempCursorCol = sCol;

        const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const parts = normalised.split('\n');
        const currentLineContent = newLines[tempCursorRow];
        const beforeInsert = cpSlice(currentLineContent, 0, tempCursorCol);
        const afterInsert = cpSlice(currentLineContent, tempCursorCol);

        newLines[tempCursorRow] = beforeInsert + parts[0];
        if (parts.length > 2) {
          newLines.splice(tempCursorRow + 1, 0, ...parts.slice(1, -1));
        }
        const lastPart = parts[parts.length - 1]!;
        newLines.splice(
          tempCursorRow + (parts.length - 1),
          0,
          lastPart + afterInsert,
        );

        setCursorRow(tempCursorRow + parts.length - 1);
        setCursorCol(cpLen(lastPart));
        return newLines;
      });

      setPreferredCol(null);
      return true;
    },
    [pushUndo, lines, currentLine, currentLineLen, setPreferredCol],
  );

  const deleteWordLeft = useCallback((): void => {
    dbg('deleteWordLeft', { beforeCursor: [cursorRow, cursorCol] });
    if (cursorCol === 0 && cursorRow === 0) return;
    if (cursorCol === 0) {
      backspace();
      return;
    }
    pushUndo();
    const lineContent = currentLine(cursorRow);
    const arr = toCodePoints(lineContent);
    let start = cursorCol;
    let onlySpaces = true;
    for (let i = 0; i < start; i++) {
      if (isWordChar(arr[i])) {
        onlySpaces = false;
        break;
      }
    }
    if (onlySpaces && start > 0) {
      start--;
    } else {
      while (start > 0 && !isWordChar(arr[start - 1])) start--;
      while (start > 0 && isWordChar(arr[start - 1])) start--;
    }
    setLines((prevLines) => {
      const newLines = [...prevLines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, start) + cpSlice(lineContent, cursorCol);
      return newLines;
    });
    setCursorCol(start);
    setPreferredCol(null);
  }, [pushUndo, cursorRow, cursorCol, currentLine, backspace, setPreferredCol]);

  const deleteWordRight = useCallback((): void => {
    dbg('deleteWordRight', { beforeCursor: [cursorRow, cursorCol] });
    const lineContent = currentLine(cursorRow);
    const arr = toCodePoints(lineContent);
    if (cursorCol >= arr.length && cursorRow === lines.length - 1) return;
    if (cursorCol >= arr.length) {
      del();
      return;
    }
    pushUndo();
    let end = cursorCol;
    while (end < arr.length && !isWordChar(arr[end])) end++;
    while (end < arr.length && isWordChar(arr[end])) end++;
    setLines((prevLines) => {
      const newLines = [...prevLines];
      newLines[cursorRow] =
        cpSlice(lineContent, 0, cursorCol) + cpSlice(lineContent, end);
      return newLines;
    });
    // Cursor col does not change
    setPreferredCol(null);
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    del,
    lines.length,
    setPreferredCol,
  ]);

  const killLineRight = useCallback((): void => {
    const lineContent = currentLine(cursorRow);
    if (cursorCol < currentLineLen(cursorRow)) {
      // Cursor is before the end of the line's content, delete text to the right
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = cpSlice(lineContent, 0, cursorCol);
        return newLines;
      });
      // Cursor position and preferredCol do not change in this case
    } else if (
      cursorCol === currentLineLen(cursorRow) &&
      cursorRow < lines.length - 1
    ) {
      // Cursor is at the end of the line's content (or line is empty),
      // and it's not the last line. Delete the newline.
      // `del()` handles pushUndo and setPreferredCol.
      del();
    }
    // If cursor is at the end of the line and it's the last line, do nothing.
  }, [
    pushUndo,
    cursorRow,
    cursorCol,
    currentLine,
    currentLineLen,
    lines.length,
    del,
  ]);

  const killLineLeft = useCallback((): void => {
    const lineContent = currentLine(cursorRow);
    // Only act if the cursor is not at the beginning of the line
    if (cursorCol > 0) {
      pushUndo();
      setLines((prevLines) => {
        const newLines = [...prevLines];
        newLines[cursorRow] = cpSlice(lineContent, cursorCol);
        return newLines;
      });
      setCursorCol(0);
      setPreferredCol(null);
    }
  }, [pushUndo, cursorRow, cursorCol, currentLine, setPreferredCol]);

  const move = useCallback(
    (dir: Direction): void => {
      const before = [cursorRow, cursorCol];
      let newCursorRow = cursorRow;
      let newCursorCol = cursorCol;
      let newPreferredCol = preferredCol;

      switch (dir) {
        case 'left':
          newPreferredCol = null;
          if (newCursorCol > 0) newCursorCol--;
          else if (newCursorRow > 0) {
            newCursorRow--;
            newCursorCol = currentLineLen(newCursorRow);
          }
          break;
        case 'right':
          newPreferredCol = null;
          if (newCursorCol < currentLineLen(newCursorRow)) newCursorCol++;
          else if (newCursorRow < lines.length - 1) {
            newCursorRow++;
            newCursorCol = 0;
          }
          break;
        case 'up':
          if (newCursorRow > 0) {
            if (newPreferredCol === null) newPreferredCol = newCursorCol;
            newCursorRow--;
            newCursorCol = clamp(
              newPreferredCol,
              0,
              currentLineLen(newCursorRow),
            );
          }
          break;
        case 'down':
          if (newCursorRow < lines.length - 1) {
            if (newPreferredCol === null) newPreferredCol = newCursorCol;
            newCursorRow++;
            newCursorCol = clamp(
              newPreferredCol,
              0,
              currentLineLen(newCursorRow),
            );
          }
          break;
        case 'home':
          newPreferredCol = null;
          newCursorCol = 0;
          break;
        case 'end':
          newPreferredCol = null;
          newCursorCol = currentLineLen(newCursorRow);
          break;
        case 'wordLeft': {
          newPreferredCol = null;
          const slice = cpSlice(
            currentLine(newCursorRow),
            0,
            newCursorCol,
          ).replace(/[\s,.;!?]+$/, '');
          let lastIdx = 0;
          const regex = /[\s,.;!?]+/g;
          let m;
          while ((m = regex.exec(slice)) != null) lastIdx = m.index;
          newCursorCol = lastIdx === 0 ? 0 : cpLen(slice.slice(0, lastIdx)) + 1;
          break;
        }
        case 'wordRight': {
          newPreferredCol = null;
          const l = currentLine(newCursorRow);
          const regex = /[\s,.;!?]+/g;
          let moved = false;
          let m;
          while ((m = regex.exec(l)) != null) {
            const cpIdx = cpLen(l.slice(0, m.index));
            if (cpIdx > newCursorCol) {
              newCursorCol = cpIdx;
              moved = true;
              break;
            }
          }
          if (!moved) newCursorCol = currentLineLen(newCursorRow);
          break;
        }
        default: // Add default case to satisfy linter
          break;
      }
      setCursorRow(newCursorRow);
      setCursorCol(newCursorCol);
      setPreferredCol(newPreferredCol);
      dbg('move', { dir, before, after: [newCursorRow, newCursorCol] });
    },
    [
      cursorRow,
      cursorCol,
      preferredCol,
      lines,
      currentLineLen,
      currentLine,
      setPreferredCol,
    ],
  );

  const openInExternalEditor = useCallback(
    async (opts: { editor?: string } = {}): Promise<void> => {
      const editor =
        opts.editor ??
        process.env['VISUAL'] ??
        process.env['EDITOR'] ??
        (process.platform === 'win32' ? 'notepad' : 'vi');
      const tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'gemini-edit-'));
      const filePath = pathMod.join(tmpDir, 'buffer.txt');
      fs.writeFileSync(filePath, text, 'utf8');

      pushUndo(); // Snapshot before external edit

      const wasRaw = stdin?.isRaw ?? false;
      try {
        setRawMode?.(false);
        const { status, error } = spawnSync(editor, [filePath], {
          stdio: 'inherit',
        });
        if (error) throw error;
        if (typeof status === 'number' && status !== 0)
          throw new Error(`External editor exited with status ${status}`);

        let newText = fs.readFileSync(filePath, 'utf8');
        newText = newText.replace(/\r\n?/g, '\n');

        const newContentLines = newText.split('\n');
        setLines(newContentLines.length === 0 ? [''] : newContentLines);
        setCursorRow(newContentLines.length - 1);
        setCursorCol(cpLen(newContentLines[newContentLines.length - 1] ?? ''));
        setScrollRow(0);
        setScrollCol(0);
        setPreferredCol(null);
      } catch (err) {
        console.error('[useTextBuffer] external editor error', err);
        // TODO(jacobr): potentially revert or handle error state.
      } finally {
        if (wasRaw) setRawMode?.(true);
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
        try {
          fs.rmdirSync(tmpDir);
        } catch {
          /* ignore */
        }
      }
    },
    [text, pushUndo, stdin, setRawMode, setPreferredCol],
  );

  const handleInput = useCallback(
    (input: string | undefined, key: Record<string, boolean>): boolean => {
      dbg('handleInput', { input, key, cursor: [cursorRow, cursorCol] });
      const beforeText = text; // For change detection
      const beforeCursor = [cursorRow, cursorCol];

      if (key['escape']) return false;

      if (key['return'] || input === '\r' || input === '\n') newline();
      else if (key['leftArrow'] && !key['meta'] && !key['ctrl'] && !key['alt'])
        move('left');
      else if (key['rightArrow'] && !key['meta'] && !key['ctrl'] && !key['alt'])
        move('right');
      else if (key['upArrow']) move('up');
      else if (key['downArrow']) move('down');
      else if ((key['meta'] || key['ctrl'] || key['alt']) && key['leftArrow'])
        move('wordLeft');
      else if ((key['meta'] || key['ctrl'] || key['alt']) && key['rightArrow'])
        move('wordRight');
      else if (key['home']) move('home');
      else if (key['end']) move('end');
      else if (
        (key['meta'] || key['ctrl'] || key['alt']) &&
        (key['backspace'] || input === '\x7f')
      )
        deleteWordLeft();
      else if ((key['meta'] || key['ctrl'] || key['alt']) && key['delete'])
        deleteWordRight();
      else if (
        key['backspace'] ||
        input === '\x7f' ||
        (key['delete'] && !key['shift'])
      )
        backspace();
      else if (key['delete']) del();
      else if (input && !key['ctrl'] && !key['meta']) insert(input);

      const textChanged = text !== beforeText;
      const cursorChanged =
        cursorRow !== beforeCursor[0] || cursorCol !== beforeCursor[1];

      dbg('handleInput:after', {
        cursor: [cursorRow, cursorCol],
        text,
      });
      return textChanged || cursorChanged;
    },
    [
      text,
      cursorRow,
      cursorCol,
      newline,
      move,
      deleteWordLeft,
      deleteWordRight,
      backspace,
      del,
      insert,
    ],
  );

  const visibleLines = useMemo(
    () => lines.slice(scrollRow, scrollRow + viewport.height),
    [lines, scrollRow, viewport.height],
  );

  // Exposed API of the hook
  const returnValue: TextBuffer = {
    // State
    lines,
    text,
    cursor: [cursorRow, cursorCol],
    scroll: [scrollRow, scrollCol],
    preferredCol,
    selectionAnchor,

    // Actions
    setText,
    insert,
    newline,
    backspace,
    del,
    move,
    undo,
    redo,
    replaceRange,
    deleteWordLeft,
    deleteWordRight,
    killLineRight,
    killLineLeft,
    handleInput,
    openInExternalEditor,

    // Selection & Clipboard (simplified for now)
    copy: useCallback(() => {
      if (!selectionAnchor) return null;
      const [ar, ac] = selectionAnchor;
      const [br, bc] = [cursorRow, cursorCol];
      if (ar === br && ac === bc) return null;
      const topBefore = ar < br || (ar === br && ac < bc);
      const [sr, sc, er, ec] = topBefore ? [ar, ac, br, bc] : [br, bc, ar, ac];

      let selectedTextVal;
      if (sr === er) {
        selectedTextVal = cpSlice(currentLine(sr), sc, ec);
      } else {
        const parts: string[] = [cpSlice(currentLine(sr), sc)];
        for (let r = sr + 1; r < er; r++) parts.push(currentLine(r));
        parts.push(cpSlice(currentLine(er), 0, ec));
        selectedTextVal = parts.join('\n');
      }
      setClipboard(selectedTextVal);
      return selectedTextVal;
    }, [selectionAnchor, cursorRow, cursorCol, currentLine]),
    paste: useCallback(() => {
      if (clipboard === null) return false;
      return insertStr(clipboard);
    }, [clipboard, insertStr]),
    startSelection: useCallback(
      () => setSelectionAnchor([cursorRow, cursorCol]),
      [cursorRow, cursorCol],
    ),
    visibleLines,
  };
  return returnValue;
}

export interface TextBuffer {
  // State
  lines: string[];
  text: string;
  cursor: [number, number];
  scroll: [number, number];
  /**
   * When the user moves the caret vertically we try to keep their original
   * horizontal column even when passing through shorter lines.  We remember
   * that *preferred* column in this field while the user is still travelling
   * vertically.  Any explicit horizontal movement resets the preference.
   */
  preferredCol: number | null;
  selectionAnchor: [number, number] | null;

  // Actions

  /**
   * Replaces the entire buffer content with the provided text.
   * The operation is undoable.
   */
  setText: (text: string) => void;
  /**
   * Insert a single character or string without newlines.
   */
  insert: (ch: string) => void;
  newline: () => void;
  backspace: () => void;
  del: () => void;
  move: (dir: Direction) => void;
  undo: () => boolean;
  redo: () => boolean;
  /**
   * Replaces the text within the specified range with new text.
   * Handles both single-line and multi-line ranges.
   *
   * @param startRow The starting row index (inclusive).
   * @param startCol The starting column index (inclusive, code-point based).
   * @param endRow The ending row index (inclusive).
   * @param endCol The ending column index (exclusive, code-point based).
   * @param text The new text to insert.
   * @returns True if the buffer was modified, false otherwise.
   */
  replaceRange: (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
    text: string,
  ) => boolean;
  /**
   * Delete the word to the *left* of the caret, mirroring common
   * Ctrl/Alt+Backspace behaviour in editors & terminals. Both the adjacent
   * whitespace *and* the word characters immediately preceding the caret are
   * removed.  If the caret is already at column‑0 this becomes a no-op.
   */
  deleteWordLeft: () => void;
  /**
   * Delete the word to the *right* of the caret, akin to many editors'
   * Ctrl/Alt+Delete shortcut.  Removes any whitespace/punctuation that
   * follows the caret and the next contiguous run of word characters.
   */
  deleteWordRight: () => void;
  /**
   * Deletes text from the cursor to the end of the current line.
   */
  killLineRight: () => void;
  /**
   * Deletes text from the start of the current line to the cursor.
   */
  killLineLeft: () => void;
  /**
   * High level "handleInput" – receives what Ink gives us.
   */
  handleInput: (
    input: string | undefined,
    key: Record<string, boolean>,
  ) => boolean;
  /**
   * Opens the current buffer contents in the user’s preferred terminal text
   * editor ($VISUAL or $EDITOR, falling back to "vi").  The method blocks
   * until the editor exits, then reloads the file and replaces the in‑memory
   * buffer with whatever the user saved.
   *
   * The operation is treated as a single undoable edit – we snapshot the
   * previous state *once* before launching the editor so one `undo()` will
   * revert the entire change set.
   *
   * Note: We purposefully rely on the *synchronous* spawn API so that the
   * calling process genuinely waits for the editor to close before
   * continuing.  This mirrors Git’s behaviour and simplifies downstream
   * control‑flow (callers can simply `await` the Promise).
   */
  openInExternalEditor: (opts?: { editor?: string }) => Promise<void>;

  // Selection & Clipboard
  copy: () => string | null;
  paste: () => boolean;
  startSelection: () => void;

  // For rendering
  visibleLines: string[];
}
