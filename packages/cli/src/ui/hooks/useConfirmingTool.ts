/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useUIState } from '../contexts/UIStateContext.js';
import { getConfirmingToolState } from '../utils/confirmingTool.js';
import type { ConfirmingToolState } from '../utils/confirmingTool.js';

export type { ConfirmingToolState } from '../utils/confirmingTool.js';

/**
 * Selects the "Head" of the confirmation queue.
 * Returns the first tool in the pending state that requires confirmation.
 */
export function useConfirmingTool(): ConfirmingToolState | null {
  // We use pendingHistoryItems to ensure we capture tools from both
  // Gemini responses and Slash commands.
  const { pendingHistoryItems } = useUIState();

  return useMemo(
    () => getConfirmingToolState(pendingHistoryItems),
    [pendingHistoryItems],
  );
}
