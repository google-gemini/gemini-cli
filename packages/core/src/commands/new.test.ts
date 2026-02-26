/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe } from 'vitest';
import { performNewSession } from './new.js';

describe('newCommand', () => {
  it('should yield the correct actions to start a new session', async () => {
    const newSessionGenerator = performNewSession();

    const firstAction = await newSessionGenerator.next();
    const secondAction = await newSessionGenerator.next();
    const thirdAction = await newSessionGenerator.next();

    expect(firstAction.value).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Saving current session and starting a fresh one for you.',
    });
    expect(firstAction.done).toBe(false);

    expect(secondAction.value).toEqual({
      type: 'clear_session',
    });
    expect(secondAction.done).toBe(false);

    expect(thirdAction.done).toBe(true);
  });
});
