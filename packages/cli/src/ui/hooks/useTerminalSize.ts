/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useApp } from 'ink';

export function useTerminalSize(): { columns: number; rows: number } {
  const { rerender } = useApp();
  const [size, setSize] = useState({
    columns: process.stdout.columns || 60,
    rows: process.stdout.rows || 20,
  });

  useEffect(() => {
    function updateSize() {
      setSize({
        columns: process.stdout.columns || 60,
        rows: process.stdout.rows || 20,
      });
      // Force a full redraw to prevent rendering artifacts from stale
      // incremental rendering state after terminal dimensions change.
      rerender();
    }

    process.stdout.on('resize', updateSize);
    return () => {
      process.stdout.off('resize', updateSize);
    };
  }, [rerender]);

  return size;
}
