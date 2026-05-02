/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { useStdout } from 'ink';

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();

  const getDimensions = useCallback(
    () => ({
      columns: stdout?.columns || process.stdout.columns || 60,
      rows: stdout?.rows || process.stdout.rows || 20,
    }),
    [stdout],
  );

  const [size, setSize] = useState(getDimensions);

  useEffect(() => {
    const updateSize = () => setSize(getDimensions());

    // Sync dimensions immediately when stdout changes or on mount
    updateSize();

    const target = stdout || process.stdout;
    target.on('resize', updateSize);
    return () => {
      target.off('resize', updateSize);
    };
  }, [stdout, getDimensions]);

  return size;
}
