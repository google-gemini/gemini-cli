/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCallRequestInfo } from '../turn.js';
import type {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '../../tools/tools.js';

export interface ConfirmationStrategy {
  /**
   * Determines if and how a tool should be confirmed.
   * @param toolCall The tool call being processed
   * @param confirmationDetails The details provided by the tool (if any)
   * @param signal AbortSignal
   * @returns A promise resolving to the outcome (Proceed, Cancel, etc.)
   */
  confirm(
    toolCall: ToolCallRequestInfo,
    confirmationDetails: ToolCallConfirmationDetails,
    signal: AbortSignal,
  ): Promise<ToolConfirmationOutcome>;
}
