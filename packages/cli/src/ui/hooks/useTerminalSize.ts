/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';

const TERMINAL_PADDING_X = 8;

// IME stabilization constants
const IME_SIZE_CHANGE_THRESHOLD = 5; // Minimum column change to consider significant
const IME_STABILIZATION_DELAY = 150; // Delay in ms before applying size changes
const VSCode_TERM_PROGRAM = 'vscode';

// Helper function to centralize terminal size calculation
const getTerminalSize = () => ({
  columns: (process.stdout.columns || 60) - TERMINAL_PADDING_X,
  rows: process.stdout.rows || 20,
});

// Check if we're running in VSCode or VSCode-based terminal where IME issues occur
const isVSCodeFamily = process.env['TERM_PROGRAM'] === VSCode_TERM_PROGRAM ||
                       process.env['VSCODE_GIT_IPC_HANDLE'] !== undefined ||
                       process.env['CURSOR_TRACE_ID'] !== undefined ||
                       process.env['VSCODE_GIT_ASKPASS_MAIN']?.toLowerCase().includes('cursor') ||
                       process.env['VSCODE_GIT_ASKPASS_MAIN']?.toLowerCase().includes('windsurf');

export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState(getTerminalSize());

  const lastStableSize = useRef(size);
  const pendingUpdate = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function updateSize() {
      const newSize = getTerminalSize();

      if (isVSCodeFamily) {
        const columnsDiff = Math.abs(newSize.columns - lastStableSize.current.columns);
        
        // If the column change is small (likely IME candidate window), debounce the update
        if (columnsDiff > 0 && columnsDiff <= IME_SIZE_CHANGE_THRESHOLD) {
          // Clear any existing pending update
          if (pendingUpdate.current) {
            clearTimeout(pendingUpdate.current);
          }

          // Schedule a delayed update to allow IME operations to complete
          pendingUpdate.current = setTimeout(() => {
            // Only update if the size is still the same after the delay
            const currentSize = getTerminalSize();
            
            if (currentSize.columns === newSize.columns && currentSize.rows === newSize.rows) {
              lastStableSize.current = currentSize;
              setSize(currentSize);
            }
            pendingUpdate.current = null;
          }, IME_STABILIZATION_DELAY);

          return; // Don't update immediately for small changes
        }
      }

      // For significant size changes or non-VSCode terminals, update immediately
      lastStableSize.current = newSize;
      setSize(newSize);

      // Clear any pending delayed update since we're updating now
      if (pendingUpdate.current) {
        clearTimeout(pendingUpdate.current);
        pendingUpdate.current = null;
      }
    }

    process.stdout.on('resize', updateSize);
    return () => {
      process.stdout.off('resize', updateSize);
      if (pendingUpdate.current) {
        clearTimeout(pendingUpdate.current);
      }
    };
  }, []);

  return size;
}
