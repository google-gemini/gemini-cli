/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { debounce } from '../../utils/debounce';

export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 60,
    rows: process.stdout.rows || 20,
  });

  const updateSize = useCallback(
    debounce(() => {
      setSize({
        columns: process.stdout.columns || 60,
        rows: process.stdout.rows || 20,
      });
    }, 100),
    [],
  );

  useEffect(() => {
    process.stdout.on('resize', updateSize);
    return () => {
      process.stdout.off('resize', updateSize);
    };
  }, [updateSize]);

  return size;
}
