/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout?.columns || process.stdout.columns || 60,
    rows: stdout?.rows || process.stdout.rows || 20,
  });

  useEffect(() => {
    function updateSize() {
      setSize({
        columns: stdout?.columns || process.stdout.columns || 60,
        rows: stdout?.rows || process.stdout.rows || 20,
      });
    }

    const target = stdout || process.stdout;
    target.on('resize', updateSize);
    return () => {
      target.off('resize', updateSize);
    };
  }, [stdout]);

  return size;
}
