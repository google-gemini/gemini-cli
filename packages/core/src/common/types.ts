/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

export type HistoryContent = Content & {
  /**
   * A flag to indicate that the model's response is incomplete.
   * This is set to `true` when a stream begins and is set to `false` upon
   * successful completion. If the stream is interrupted (e.g., due to an
   * error or cancellation), it remains `true`. This allows the UI to save
   * and display partial responses without polluting the model's future
   * context with incomplete history.
   */
  isPartial?: boolean;
};
