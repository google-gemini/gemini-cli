/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, forwardRef, useImperativeHandle } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useTheme } from '../../contexts/ThemeContext';

export interface TerminalRef {
  focus: () => void;
}

export const Terminal = forwardRef<TerminalRef>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const term = useTerminal(containerRef, theme);

  useImperativeHandle(ref, () => ({
    focus: () => {
      term.current?.focus();
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        flex: 1,
        padding: '0 10px 10px 10px',
        boxSizing: 'border-box',
      }}
    />
  );
});

Terminal.displayName = 'Terminal';
