/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandActionReturn } from './types.js';

export async function* performNewSession(): AsyncGenerator<CommandActionReturn> {
  yield {
    type: 'message',
    messageType: 'info',
    content: 'Saving current session and starting a fresh one for you.',
  };

  yield {
    type: 'clear_session',
  };
}
