/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

export type VimMode = 'NORMAL' | 'INSERT';


/**
 * Vim hook that handles all vim mode functionality including:
 * - Mode switching between INSERT and NORMAL modes
 * - Navigation commands (h, j, k, l, w, b, e, 0, $, ^, g, G, I, A) with count support
 * - Editing commands (x, a, i, o, O, d, c, D, C) with count support  
 * - Complex commands (dd, cc, dw, cw, db, cb, de, ce, gg, etc.)
 * - Repeat last command (.)
 * - Settings persistence (vim mode state survives app restart)
 * - Escape behavior (move cursor left when exiting INSERT mode, clear pending operations)
 * - Consolidated input handling to eliminate race conditions
 * - Direct handleInput exposure for integration with InputPrompt
 */
export function useVim(
  buffer: TextBuffer, 
  config: { getVimMode(): boolean },
  settings: LoadedSettings,
  onSubmit?: (value: string) => void
) {
  const [mode, setMode] = useState<VimMode>('NORMAL');
  const modeRef = useRef<VimMode>('NORMAL');
  const [count, setCount] = useState<number>(0);
  const [pendingG, setPendingG] = useState(false);
  const [pendingD, setPendingD] = useState(false);
  const [pendingC, setPendingC] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [runtimeVimModeOverride, setRuntimeVimModeOverride] = useState<boolean | null>(null);

  // Keep mode ref in sync with state
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Helper to update both state and ref immediately
  const setModeImmediate = useCallback((newMode: VimMode) => {
    modeRef.current = newMode;
    setMode(newMode);
  }, []);

  const getCurrentCount = useCallback(() => count || 1, [count]);

  const clearCount = useCallback(() => {
    setCount(0);
  }, []);

  const findNextWordStart = useCallback((text: string, currentOffset: number): number => {
    let i = currentOffset;
    
    // Skip current word if we're in the middle of one
    while (i < text.length && /\w/.test(text[i])) {
      i++;
    }
    
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) {
      i++;
    }
    
    // If we reached the end of text and there's no next word,
    // vim behavior is to move to the end of the current word
    if (i >= text.length) {
      // Go back to find the end of the last word
      let endOfLastWord = text.length - 1;
      while (endOfLastWord >= 0 && /\s/.test(text[endOfLastWord])) {
        endOfLastWord--;
      }
      // Position cursor at the last character of the last word
      return Math.max(0, endOfLastWord);
    }
    
    return i;
  }, []);

  const findPrevWordStart = useCallback((text: string, currentOffset: number): number => {
    let i = currentOffset;
    
    // If at beginning of text, return current position
    if (i <= 0) {
      return currentOffset;
    }
    
    // Move back one character to start searching
    i--;
    
    // Skip whitespace moving backwards
    while (i >= 0 && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n')) {
      i--;
    }
    
    if (i < 0) {
      return 0; // Reached beginning of text
    }
    
    const charAtI = text[i];
    
    if (/\w/.test(charAtI)) {
      // We're in a word, move to its beginning
      while (i >= 0 && /\w/.test(text[i])) {
        i--;
      }
      return i + 1; // Return first character of word
    } else {
      // We're in punctuation, move to its beginning
      while (i >= 0 && !/\w/.test(text[i]) && text[i] !== ' ' && text[i] !== '\t' && text[i] !== '\n') {
        i--;
      }
      return i + 1; // Return first character of punctuation sequence
    }
  }, []);

  const findWordEnd = useCallback((text: string, currentOffset: number): number => {
    let i = currentOffset;
    
    // If we're not on a word character, find the next word
    if (!/\w/.test(text[i])) {
      while (i < text.length && !/\w/.test(text[i])) {
        i++;
      }
    }
    
    // Move to end of current word
    while (i < text.length && /\w/.test(text[i])) {
      i++;
    }
    
    // Move back one to be on the last character of the word
    return Math.max(currentOffset, i - 1);
  }, []);

  const getCurrentOffset = useCallback(() => {
    const lines = buffer.lines;
    const [row, col] = buffer.cursor;
    let offset = 0;
    
    for (let i = 0; i < row; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += col;
    
    return offset;
  }, [buffer]);

  const setOffsetPosition = useCallback((offset: number) => {
    buffer.moveToOffset(offset);
  }, [buffer]);

  const getEffectiveVimMode = useCallback(() => 
    runtimeVimModeOverride !== null ? runtimeVimModeOverride : config.getVimMode(), [runtimeVimModeOverride, config]);

  const toggleVimMode = useCallback(() => {
    const currentMode = getEffectiveVimMode();
    const newMode = !currentMode;
    
    // Persist the new vim mode setting
    settings.setValue(SettingScope.User, 'vimMode', newMode as unknown as string);
    
    // Update runtime override to reflect the change immediately
    setRuntimeVimModeOverride(newMode);
    
    // If disabling vim mode while in INSERT, switch to NORMAL first
    if (currentMode && mode === 'INSERT') {
      setMode('NORMAL');
    }
  }, [getEffectiveVimMode, mode, settings]);

  const handleInputRef = useRef<((key: Key) => boolean) | null>(null);
  
  const handleInput = useCallback((key: Key): boolean => {
    if (!getEffectiveVimMode()) {
      return false; // Let InputPrompt handle it
    }


    // Clear any existing debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current as NodeJS.Timeout);
      debounceTimerRef.current = null;
    }

    // Handle INSERT mode
    if (modeRef.current === 'INSERT') {
      // Handle escape key OR escape sequence (ESC+key pressed quickly)
      // Only treat as escape if:
      // 1. Actual escape key (key.name === 'escape'), OR
      // 2. Escape sequence that's NOT an arrow key or function key (doesn't start with \u001b[)
      const isEscapeToNormal = key.name === 'escape' || 
        (key.sequence && 
         key.sequence.startsWith('\u001b') && 
         !key.sequence.startsWith('\u001b[') && 
         key.sequence.length > 1);
      
      if (isEscapeToNormal) {
        
        // In vim, exiting INSERT mode moves cursor one position left
        // but only if cursor is at the end of the line (past the last character)
        const currentRow = buffer.cursor[0];
        const currentCol = buffer.cursor[1];
        const currentLine = buffer.lines[currentRow] || '';
        
        // Only move left if cursor is at the end of the line (past the last character)
        if (currentCol > 0 && currentCol >= currentLine.length) {
          buffer.move('left');
        }
        
        // Update both state and ref immediately
        setModeImmediate('NORMAL');
        clearCount();
        setPendingD(false);
        setPendingC(false);
        setPendingG(false);
        
        // If this was an escape sequence (ESC+key), process the key part in NORMAL mode
        if (key.sequence && key.sequence.startsWith('\u001b') && !key.sequence.startsWith('\u001b[') && key.sequence.length > 1) {
          const remainingSequence = key.sequence.substring(1); // Remove the \u001b part
          if (remainingSequence) {
            // Create a new key object for the remaining part
            const normalModeKey: Key = {
              name: remainingSequence.length === 1 ? '' : key.name,
              sequence: remainingSequence,
              ctrl: false,
              meta: false,
              shift: false,
              paste: false
            };
            // Process this key immediately in NORMAL mode by calling ourselves recursively
            return handleInputRef.current?.(normalModeKey) ?? false;
          } else {
            return true; // Just escape, nothing more to process
          }
        } else {
          return true; // Just escape, nothing more to process
        }
      }
      
      // In INSERT mode, let InputPrompt handle completion keys
      if (key.name === 'tab' || (key.name === 'return' && !key.ctrl) || key.name === 'up' || key.name === 'down') {
        return false; // Let InputPrompt handle completion
      }
      
      // Special handling for Enter key to allow command submission (lower priority than completion)
      if (key.name === 'return' && !key.ctrl && !key.meta) {
        if (buffer.text.trim() && onSubmit) {
          // Handle command submission directly
          const submittedValue = buffer.text;
          buffer.setText('');
          onSubmit(submittedValue);
          return true;
        }
        return true; // Handled by vim (even if no onSubmit callback)
      }
      
      // useKeypress already provides the correct format for TextBuffer
      buffer.handleInput(key);
      return true; // Handled by vim
    }

    // Handle NORMAL mode
    if (modeRef.current === 'NORMAL') {
      // Handle Escape key in NORMAL mode - clear all pending states
      if (key.name === 'escape') {
        clearCount();
        setPendingD(false);
        setPendingC(false);
        setPendingG(false);
        return true; // Handled by vim
      }
      
      // Handle count input (numbers 1-9, and 0 if count > 0)
      if (/^[1-9]$/.test(key.sequence) || (key.sequence === '0' && count > 0)) {
        setCount(prev => prev * 10 + parseInt(key.sequence, 10));
        return true; // Handled by vim
      }

      const repeatCount = getCurrentCount();
      const text = buffer.text;
      const currentOffset = getCurrentOffset();

      switch (key.sequence) {
        case 'h': {
          // Check if this is part of a change command (ch)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            // Change N characters to the left
            for (let i = 0; i < repeatCount; i++) {
              const _currentRow = buffer.cursor[0];
              const currentCol = buffer.cursor[1];
              if (currentCol > 0) {
                buffer.move('left');
                buffer.del();
              }
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('ch');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal left movement
          for (let i = 0; i < repeatCount; i++) {
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            if (currentCol > 0) {
              buffer.move('left');
            } else if (currentRow > 0) {
              // Move to end of previous line
              buffer.move('up');
              buffer.move('end');
            }
          }
          clearCount();
          return true;
        }

        case 'j': {
          // Check if this is part of a change command (cj)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            // Change from current line down N lines
            const currentRow = buffer.cursor[0];
            const totalLines = buffer.lines.length;
            const linesToChange = Math.min(repeatCount + 1, totalLines - currentRow); // +1 to include current line
            
            if (totalLines === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - change N lines including newlines
              let startOffset = 0;
              for (let row = 0; row < currentRow; row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset;
              for (let i = 0; i < linesToChange; i++) {
                if (currentRow + i < totalLines) {
                  endOffset += buffer.lines[currentRow + i].length;
                  if (currentRow + i < totalLines - 1) {
                    endOffset += 1; // +1 for newline, except for last line
                  }
                }
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('cj');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal down movement
          for (let i = 0; i < repeatCount; i++) {
            buffer.move('down');
          }
          clearCount();
          return true;
        }

        case 'k': {
          // Check if this is part of a change command (ck)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            // Change from current line up N lines
            const currentRow = buffer.cursor[0];
            const linesToChange = Math.min(repeatCount + 1, currentRow + 1); // +1 to include current line
            const startRow = currentRow - repeatCount;
            
            if (buffer.lines.length === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - change N lines including newlines
              let startOffset = 0;
              for (let row = 0; row < Math.max(0, startRow); row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset;
              for (let i = 0; i < linesToChange; i++) {
                const rowIndex = Math.max(0, startRow) + i;
                if (rowIndex < buffer.lines.length) {
                  endOffset += buffer.lines[rowIndex].length;
                  if (rowIndex < buffer.lines.length - 1) {
                    endOffset += 1; // +1 for newline, except for last line
                  }
                }
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
              // Move cursor to start of changed area
              buffer.moveToOffset(startOffset);
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('ck');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal up movement
          for (let i = 0; i < repeatCount; i++) {
            buffer.move('up');
          }
          clearCount();
          return true;
        }

        case 'l': {
          // Check if this is part of a change command (cl)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            // Change N characters to the right
            for (let i = 0; i < repeatCount; i++) {
              buffer.del();
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('cl');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal right movement
          for (let i = 0; i < repeatCount; i++) {
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            const currentLine = buffer.lines[currentRow] || '';
            
            // Don't move past the last character of the line
            if (currentCol < currentLine.length - 1) {
              buffer.move('right');
            } else if (currentRow < buffer.lines.length - 1) {
              // Move to beginning of next line
              buffer.move('down');
              buffer.move('home');
            }
          }
          clearCount();
          return true;
        }

        case 'w': {
          // Check if this is part of a delete command (dw)
          if (pendingD) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Delete from cursor through N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              // For dw, we want to delete to the start of the next word,
              // or to the end of text if there's no next word
              let nextPos = offset;
              
              // Skip current word
              while (nextPos < text.length && /\w/.test(text[nextPos])) {
                nextPos++;
              }
              
              // Skip whitespace to get to next word start
              while (nextPos < text.length && /\s/.test(text[nextPos])) {
                nextPos++;
              }
              
              // If we reached end of text, that's our target
              if (nextPos >= text.length) {
                offset = text.length;
                break;
              } else {
                offset = nextPos;
              }
            }
            endOffset = offset;
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat
            setLastCommand('dw');
            setPendingD(false);
            return true;
          }
          
          // Check if this is part of a change command (cw)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Change from cursor through N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              const nextWordOffset = findNextWordStart(text, offset);
              if (nextWordOffset > offset) {
                offset = nextWordOffset;
              } else {
                break;
              }
            }
            endOffset = offset;
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('cw');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal word movement
          let offset = currentOffset;
          for (let i = 0; i < repeatCount; i++) {
            const nextWordOffset = findNextWordStart(text, offset);
            if (nextWordOffset > offset) {
              offset = nextWordOffset;
            } else {
              // No more words to move to
              break;
            }
          }
          setOffsetPosition(offset);
          clearCount();
          return true;
        }

        case 'b': {
          // Check if this is part of a delete command (db)
          if (pendingD) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Delete from cursor backward through N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              const prevWordOffset = findPrevWordStart(text, offset);
              if (prevWordOffset < offset) {
                offset = prevWordOffset;
              } else {
                break;
              }
            }
            endOffset = offset;
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat
            setLastCommand('db');
            setPendingD(false);
            return true;
          }
          
          // Check if this is part of a change command (cb)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Change from cursor backward through N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              const prevWordOffset = findPrevWordStart(text, offset);
              if (prevWordOffset < offset) {
                offset = prevWordOffset;
              } else {
                break;
              }
            }
            endOffset = offset;
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('cb');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal backward word movement
          let offset = currentOffset;
          for (let i = 0; i < repeatCount; i++) {
            offset = findPrevWordStart(text, offset);
          }
          setOffsetPosition(offset);
          clearCount();
          return true;
        }

        case 'e': {
          // Check if this is part of a delete command (de)
          if (pendingD) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Delete from cursor to end of N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              const wordEndOffset = findWordEnd(text, offset);
              if (wordEndOffset > offset) {
                offset = wordEndOffset;
              } else {
                break;
              }
            }
            // Include the character at the end position for 'de'
            endOffset = Math.min(offset + 1, text.length);
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat
            setLastCommand('de');
            setPendingD(false);
            return true;
          }
          
          // Check if this is part of a change command (ce)
          if (pendingC) {
            const repeatCount = getCurrentCount();
            clearCount();
            
            const text = buffer.text;
            const currentOffset = getCurrentOffset();
            let endOffset = currentOffset;
            
            // Change from cursor to end of N words
            let offset = currentOffset;
            for (let i = 0; i < repeatCount; i++) {
              const wordEndOffset = findWordEnd(text, offset);
              if (wordEndOffset > offset) {
                offset = wordEndOffset;
              } else {
                break;
              }
            }
            // Include the character at the end position for 'ce'
            endOffset = Math.min(offset + 1, text.length);
            
            if (endOffset !== currentOffset) {
              buffer.replaceRangeByOffset(Math.min(currentOffset, endOffset), Math.max(currentOffset, endOffset), '');
            }
            
            // Record this command for repeat and switch to INSERT mode
            setLastCommand('ce');
            setPendingC(false);
            setModeImmediate('INSERT');
            return true;
          }
          
          // Normal word end movement
          let offset = currentOffset;
          for (let i = 0; i < repeatCount; i++) {
            offset = findWordEnd(text, offset);
          }
          setOffsetPosition(offset);
          clearCount();
          return true;
        }

        case 'x': {
          // Delete character under cursor
          for (let i = 0; i < repeatCount; i++) {
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            const currentLine = buffer.lines[currentRow] || '';
            
            if (currentCol < currentLine.length) {
              const isLastChar = currentCol === currentLine.length - 1;
              buffer.del();
              
              // In vim, when deleting the last character on a line,
              // the cursor moves to the previous position
              if (isLastChar && currentCol > 0) {
                buffer.move('left');
              }
            }
          }
          setLastCommand('x');
          clearCount();
          return true;
        }

        case 'i': {
          // Enter INSERT mode at current position
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case 'a': {
          // Enter INSERT mode after current position
          const currentRow = buffer.cursor[0];
          const currentCol = buffer.cursor[1];
          const currentLine = buffer.lines[currentRow] || '';
          
          if (currentCol < currentLine.length) {
            buffer.move('right');
          }
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case 'o': {
          // Insert new line after current line and enter INSERT mode
          buffer.move('end');
          buffer.newline();
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case 'O': {
          // Insert new line before current line and enter INSERT mode
          buffer.move('home');
          buffer.newline();
          buffer.move('up');
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case '0': {
          // Move to start of line
          buffer.move('home');
          clearCount();
          return true;
        }

        case '$': {
          // Move to end of line
          buffer.move('end');
          clearCount();
          return true;
        }

        case '^': {
          // Move to first non-whitespace character
          const currentRow = buffer.cursor[0];
          const currentLine = buffer.lines[currentRow] || '';
          let col = 0;
          while (col < currentLine.length && /\s/.test(currentLine[col])) {
            col++;
          }
          // Calculate offset and move to that position
          let offset = 0;
          for (let i = 0; i < currentRow; i++) {
            offset += buffer.lines[i].length + 1;
          }
          offset += col;
          buffer.moveToOffset(offset);
          clearCount();
          return true;
        }

        case 'g': {
          if (pendingG) {
            // Second 'g' - go to first line (gg command)
            buffer.moveToOffset(0);
            setPendingG(false);
          } else {
            // First 'g' - wait for second g
            setPendingG(true);
          }
          clearCount();
          return true;
        }

        case 'G': {
          if (count > 0) {
            // Go to specific line number (1-based) when a count was provided
            const lineNum = Math.min(count - 1, buffer.lines.length - 1);
            let offset = 0;
            for (let i = 0; i < lineNum; i++) {
              offset += buffer.lines[i].length + 1;
            }
            buffer.moveToOffset(offset);
          } else {
            // Go to last line when no count was provided
            const text = buffer.text;
            const lastLineStart = text.lastIndexOf('\n') + 1;
            buffer.moveToOffset(lastLineStart);
          }
          clearCount();
          return true;
        }

        case 'I': {
          // Enter INSERT mode at start of line (first non-whitespace)
          const currentRow = buffer.cursor[0];
          const currentLine = buffer.lines[currentRow] || '';
          let col = 0;
          while (col < currentLine.length && /\s/.test(currentLine[col])) {
            col++;
          }
          // Calculate offset and move to that position
          let offset = 0;
          for (let i = 0; i < currentRow; i++) {
            offset += buffer.lines[i].length + 1;
          }
          offset += col;
          buffer.moveToOffset(offset);
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case 'A': {
          // Enter INSERT mode at end of line
          buffer.move('end');
          setModeImmediate('INSERT');
          clearCount();
          return true;
        }

        case 'd': {
          if (pendingD) {
            // Second 'd' - delete N lines (dd command)
            const repeatCount = getCurrentCount();
            clearCount();
            
            const startRow = buffer.cursor[0];
            const totalLines = buffer.lines.length;
            const linesToDelete = Math.min(repeatCount, totalLines - startRow);
            
            if (totalLines === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - delete N lines including newlines
              let startOffset = 0;
              for (let row = 0; row < startRow; row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset;
              for (let i = 0; i < linesToDelete; i++) {
                const lineIndex = startRow + i;
                if (lineIndex < totalLines) {
                  endOffset += buffer.lines[lineIndex].length;
                  // Add newline except for the last line if we're deleting to the end
                  if (lineIndex < totalLines - 1) {
                    endOffset += 1;
                  } else if (startRow > 0) {
                    // Last line - include the newline before it
                    startOffset -= 1;
                  }
                }
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
            
            // Record this command for repeat
            setLastCommand('dd');
            setPendingD(false);
          } else {
            // First 'd' - wait for movement command
            setPendingD(true);
          }
          return true;
        }

        case 'c': {
          if (pendingC) {
            // Second 'c' - change N entire lines (cc command)
            const repeatCount = getCurrentCount();
            clearCount();
            
            const startRow = buffer.cursor[0];
            const totalLines = buffer.lines.length;
            const linesToChange = Math.min(repeatCount, totalLines - startRow);
            
            if (totalLines === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - change N lines including newlines
              let startOffset = 0;
              for (let row = 0; row < startRow; row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset;
              for (let i = 0; i < linesToChange; i++) {
                const lineIndex = startRow + i;
                if (lineIndex < totalLines) {
                  endOffset += buffer.lines[lineIndex].length;
                  // Add newline except for the last line if we're changing to the end
                  if (lineIndex < totalLines - 1) {
                    endOffset += 1;
                  } else if (startRow > 0) {
                    // Last line - include the newline before it
                    startOffset -= 1;
                  }
                }
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
            
            setModeImmediate('INSERT');
            setLastCommand('cc');
            setPendingC(false);
          } else {
            // First 'c' - wait for movement command
            setPendingC(true);
          }
          return true;
        }

        case 'D': {
          // Delete from cursor to end of line (equivalent to d$)
          const currentRow = buffer.cursor[0];
          const currentCol = buffer.cursor[1];
          const currentLine = buffer.lines[currentRow] || '';
          
          if (currentCol < currentLine.length) {
            let startOffset = 0;
            for (let i = 0; i < currentRow; i++) {
              startOffset += buffer.lines[i].length + 1;
            }
            startOffset += currentCol;
            
            const endOffset = startOffset + (currentLine.length - currentCol);
            buffer.replaceRangeByOffset(startOffset, endOffset, '');
          }
          
          setLastCommand('D');
          clearCount();
          return true;
        }

        case 'C': {
          // Change from cursor to end of line (equivalent to c$)
          const currentRow = buffer.cursor[0];
          const currentCol = buffer.cursor[1];
          const currentLine = buffer.lines[currentRow] || '';
          
          if (currentCol < currentLine.length) {
            let startOffset = 0;
            for (let i = 0; i < currentRow; i++) {
              startOffset += buffer.lines[i].length + 1;
            }
            startOffset += currentCol;
            
            const endOffset = startOffset + (currentLine.length - currentCol);
            buffer.replaceRangeByOffset(startOffset, endOffset, '');
          }
          
          setModeImmediate('INSERT');
          setLastCommand('C');
          clearCount();
          return true;
        }

        case '.': {
          // Repeat last command
          if (lastCommand === 'x') {
            // Repeat x command
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            const currentLine = buffer.lines[currentRow] || '';
            
            if (currentCol < currentLine.length) {
              buffer.del();
            }
          } else if (lastCommand === 'dd') {
            // Repeat dd command
            const startRow = buffer.cursor[0];
            const totalLines = buffer.lines.length;
            
            if (totalLines === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - delete current line
              let startOffset = 0;
              for (let row = 0; row < startRow; row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset + buffer.lines[startRow].length;
              if (startRow < totalLines - 1) {
                endOffset += 1; // Include newline
              } else if (startRow > 0) {
                // Last line - include the newline before it
                startOffset -= 1;
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
          } else if (lastCommand === 'cc') {
            // Repeat cc command
            const startRow = buffer.cursor[0];
            const totalLines = buffer.lines.length;
            
            if (totalLines === 1) {
              // Single line - clear the content but keep the line
              const currentLine = buffer.lines[0] || '';
              buffer.replaceRangeByOffset(0, currentLine.length, '');
            } else {
              // Multi-line - change current line
              let startOffset = 0;
              for (let row = 0; row < startRow; row++) {
                startOffset += buffer.lines[row].length + 1; // +1 for newline
              }
              
              let endOffset = startOffset + buffer.lines[startRow].length;
              if (startRow < totalLines - 1) {
                endOffset += 1; // Include newline
              } else if (startRow > 0) {
                // Last line - include the newline before it
                startOffset -= 1;
              }
              
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
            
            setModeImmediate('INSERT');
          } else if (lastCommand === 'D') {
            // Repeat D command
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            const currentLine = buffer.lines[currentRow] || '';
            
            if (currentCol < currentLine.length) {
              let startOffset = 0;
              for (let i = 0; i < currentRow; i++) {
                startOffset += buffer.lines[i].length + 1;
              }
              startOffset += currentCol;
              
              const endOffset = startOffset + (currentLine.length - currentCol);
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
          } else if (lastCommand === 'C') {
            // Repeat C command
            const currentRow = buffer.cursor[0];
            const currentCol = buffer.cursor[1];
            const currentLine = buffer.lines[currentRow] || '';
            
            if (currentCol < currentLine.length) {
              let startOffset = 0;
              for (let i = 0; i < currentRow; i++) {
                startOffset += buffer.lines[i].length + 1;
              }
              startOffset += currentCol;
              
              const endOffset = startOffset + (currentLine.length - currentCol);
              buffer.replaceRangeByOffset(startOffset, endOffset, '');
            }
            
            setModeImmediate('INSERT');
          }
          
          clearCount();
          return true;
        }

        default: {
          // Unknown command, clear count and pending states
          clearCount();
          setPendingD(false);
          setPendingC(false);
          setPendingG(false);
          return true; // Still handled by vim to prevent other handlers
        }
      }
    }

    return false; // Not handled by vim
  }, [count, buffer, getCurrentCount, clearCount, findNextWordStart, findPrevWordStart, findWordEnd, getCurrentOffset, setOffsetPosition, getEffectiveVimMode, onSubmit, setModeImmediate, lastCommand, pendingC, pendingD, pendingG]);

  // Set the ref to the current function for recursive calls
  handleInputRef.current = handleInput;

  return {
    mode,
    setMode,
    vimModeEnabled: getEffectiveVimMode(),
    toggleVimMode,
    handleInput, // Expose the input handler for InputPrompt to use
  };
}