/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  extensionUpdatesReducer,
  type ExtensionUpdatesState,
  ExtensionUpdateState,
} from './extensions.js';

describe('extensionUpdatesReducer', () => {
  it('should handle RESTARTED action', () => {
    const initialState: ExtensionUpdatesState = {
      extensionStatuses: new Map([
        [
          'ext1',
          {
            status: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
            lastUpdateTime: 0,
            lastUpdateCheck: 0,
            notified: true,
          },
        ],
      ]),
      batchChecksInProgress: 0,
      scheduledUpdate: null,
    };

    const action = {
      type: 'RESTARTED' as const,
      payload: { name: 'ext1' },
    };

    const newState = extensionUpdatesReducer(initialState, action);

    const expectedStatus = {
      status: ExtensionUpdateState.UPDATED,
      lastUpdateTime: 0,
      lastUpdateCheck: 0,
      notified: true,
    };

    expect(newState.extensionStatuses.get('ext1')).toEqual(expectedStatus);
  });

  it('should not change state for RESTARTED action if status is not UPDATED_NEEDS_RESTART', () => {
    const initialState: ExtensionUpdatesState = {
      extensionStatuses: new Map([
        [
          'ext1',
          {
            status: ExtensionUpdateState.UPDATED,
            lastUpdateTime: 0,
            lastUpdateCheck: 0,
            notified: true,
          },
        ],
      ]),
      batchChecksInProgress: 0,
      scheduledUpdate: null,
    };

    const action = {
      type: 'RESTARTED' as const,
      payload: { name: 'ext1' },
    };

    const newState = extensionUpdatesReducer(initialState, action);

    expect(newState).toEqual(initialState);
  });
});
