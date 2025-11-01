/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { Theme } from '../contexts/ThemeContext';

// Helper for debounce
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  timeout = 100,
) {
  let timer: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  theme: Theme,
) {
  const term = useRef<Terminal | null>(null);
  const isResetting = useRef(false);

  useEffect(() => {
    if (containerRef.current && !term.current) {
      const fitAddon = new FitAddon();
      term.current = new Terminal({
        fontFamily:
          'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
        fontSize: 14,
        cursorBlink: true,
        allowTransparency: true,
        theme,
      });
      term.current.loadAddon(fitAddon);
      term.current.open(containerRef.current);

      const onResize = () => {
        try {
          const geometry = fitAddon.proposeDimensions();
          if (geometry && geometry.cols > 0 && geometry.rows > 0) {
            window.electron.terminal.resize({
              cols: geometry.cols,
              rows: geometry.rows,
            });
          }
          fitAddon.fit();
        } catch {
          // Ignore resize errors
        }
      };

      const debouncedResize = debounce(onResize, 50);

      // Initial resize with a small delay to allow layout to settle
      setTimeout(() => onResize(), 100);

      const dataListener = window.electron.terminal.onData((_event, data) => {
        if (isResetting.current) {
          term.current?.clear();
          isResetting.current = false;
          term.current?.focus();
        }
        term.current?.write(data);
      });

      term.current.onKey(({ key, domEvent: event }) => {
        if (event.key === 'Enter' && event.shiftKey) {
          window.electron.terminal.sendKey('\n');
        } else {
          window.electron.terminal.sendKey(key);
        }
      });

      const removeResetListener = window.electron.terminal.onReset(() => {
        term.current?.clear();
        term.current?.write('Settings updated. Restarting CLI...\r\n');
        isResetting.current = true;
      });

      const resizeObserver = new ResizeObserver(debouncedResize);
      resizeObserver.observe(containerRef.current);
      window.addEventListener('focus', onResize);

      const removeMainWindowResizeListener =
        window.electron.onMainWindowResize(onResize);

      return () => {
        debouncedResize.cancel();
        resizeObserver.disconnect();
        window.removeEventListener('focus', onResize);
        removeResetListener();
        removeMainWindowResizeListener();
        dataListener();
        term.current?.dispose();
        term.current = null;
      };
    }
  }, [containerRef, theme]);

  useEffect(() => {
    if (term.current) {
      term.current.options.theme = theme;
    }
  }, [theme]);

  return term;
}
