/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useStdout } from 'ink';

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  if (!stdout) {
    // Fallback for test environments or headless mode
    return { columns: 80, rows: 24 };
  }
  return {
    columns: stdout.columns || 60,
    rows: stdout.rows || 20,
  };
}
