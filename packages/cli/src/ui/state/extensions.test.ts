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
  initialExtensionUpdatesState,
} from './extensions.js';

describe('extensionUpdatesReducer', () => {
  describe('SET_STATE', () => {
    it.each([
      ExtensionUpdateState.UPDATE_AVAILABLE,
      ExtensionUpdateState.UPDATED,
      ExtensionUpdateState.ERROR,
    ])('should handle SET_STATE action for state: %s', (state) => {
      const action = {
        type: 'SET_STATE' as const,
        payload: { name: 'ext1', state },
      };

      const newState = extensionUpdatesReducer(
        initialExtensionUpdatesState,
        action,
      );

      expect(newState.extensionStatuses.get('ext1')).toEqual({
        status: state,
        notified: false,
      });
    });

    it('should not update state if SET_STATE payload is identical to existing state', () => {
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        extensionStatuses: new Map([
          [
            'ext1',
            {
              status: ExtensionUpdateState.UPDATE_AVAILABLE,
              notified: false,
            },
          ],
        ]),
      };

      const action = {
        type: 'SET_STATE' as const,
        payload: { name: 'ext1', state: ExtensionUpdateState.UPDATE_AVAILABLE },
      };

      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState).toBe(initialState);
    });
  });

  describe('SET_NOTIFIED', () => {
    it.each([true, false])(
      'should handle SET_NOTIFIED action with notified: %s',
      (notified) => {
        const initialState: ExtensionUpdatesState = {
          ...initialExtensionUpdatesState,
          extensionStatuses: new Map([
            [
              'ext1',
              {
                status: ExtensionUpdateState.UPDATE_AVAILABLE,
                notified: !notified,
              },
            ],
          ]),
        };

        const action = {
          type: 'SET_NOTIFIED' as const,
          payload: { name: 'ext1', notified },
        };

        const newState = extensionUpdatesReducer(initialState, action);

        expect(newState.extensionStatuses.get('ext1')).toEqual({
          status: ExtensionUpdateState.UPDATE_AVAILABLE,
          notified,
        });
      },
    );

    it('should not update state if SET_NOTIFIED payload is identical to existing state', () => {
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        extensionStatuses: new Map([
          [
            'ext1',
            {
              status: ExtensionUpdateState.UPDATE_AVAILABLE,
              notified: true,
            },
          ],
        ]),
      };

      const action = {
        type: 'SET_NOTIFIED' as const,
        payload: { name: 'ext1', notified: true },
      };

      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState).toBe(initialState);
    });

    it('should ignore SET_NOTIFIED if extension does not exist', () => {
      const action = {
        type: 'SET_NOTIFIED' as const,
        payload: { name: 'non-existent', notified: true },
      };

      const newState = extensionUpdatesReducer(
        initialExtensionUpdatesState,
        action,
      );

      expect(newState).toBe(initialExtensionUpdatesState);
    });
  });

  describe('Batch Checks', () => {
    it('should handle BATCH_CHECK_START action', () => {
      const action = { type: 'BATCH_CHECK_START' as const };
      const newState = extensionUpdatesReducer(
        initialExtensionUpdatesState,
        action,
      );
      expect(newState.batchChecksInProgress).toBe(1);
    });

    it('should handle BATCH_CHECK_END action', () => {
      const initialState = {
        ...initialExtensionUpdatesState,
        batchChecksInProgress: 1,
      };
      const action = { type: 'BATCH_CHECK_END' as const };
      const newState = extensionUpdatesReducer(initialState, action);
      expect(newState.batchChecksInProgress).toBe(0);
    });
  });

  describe('Scheduled Updates', () => {
    it('should handle SCHEDULE_UPDATE action', () => {
      const callback = () => {};
      const action = {
        type: 'SCHEDULE_UPDATE' as const,
        payload: {
          names: ['ext1'],
          all: false,
          onComplete: callback,
        },
      };

      const newState = extensionUpdatesReducer(
        initialExtensionUpdatesState,
        action,
      );

      expect(newState.scheduledUpdate).toEqual({
        names: ['ext1'],
        all: false,
        onCompleteCallbacks: [callback],
      });
    });

    it('should merge SCHEDULE_UPDATE with existing scheduled update', () => {
      const callback1 = () => {};
      const callback2 = () => {};
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        scheduledUpdate: {
          names: ['ext1'],
          all: false,
          onCompleteCallbacks: [callback1],
        },
      };

      const action = {
        type: 'SCHEDULE_UPDATE' as const,
        payload: {
          names: ['ext2'],
          all: true,
          onComplete: callback2,
        },
      };

      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState.scheduledUpdate).toEqual({
        names: ['ext1', 'ext2'],
        all: true, // Should be true if any update is all: true
        onCompleteCallbacks: [callback1, callback2],
      });
    });

    it('should handle CLEAR_SCHEDULED_UPDATE action', () => {
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        scheduledUpdate: {
          names: ['ext1'],
          all: false,
          onCompleteCallbacks: [],
        },
      };

      const action = { type: 'CLEAR_SCHEDULED_UPDATE' as const };
      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState.scheduledUpdate).toBeNull();
    });
  });

  describe('RESTARTED', () => {
    it('should handle RESTARTED action', () => {
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        extensionStatuses: new Map([
          [
            'ext1',
            {
              status: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
              notified: true,
            },
          ],
        ]),
      };

      const action = {
        type: 'RESTARTED' as const,
        payload: { name: 'ext1' },
      };

      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState.extensionStatuses.get('ext1')).toEqual({
        status: ExtensionUpdateState.UPDATED,
        notified: true,
      });
    });

    it('should not change state for RESTARTED action if status is not UPDATED_NEEDS_RESTART', () => {
      const initialState: ExtensionUpdatesState = {
        ...initialExtensionUpdatesState,
        extensionStatuses: new Map([
          [
            'ext1',
            {
              status: ExtensionUpdateState.UPDATED,
              notified: true,
            },
          ],
        ]),
      };

      const action = {
        type: 'RESTARTED' as const,
        payload: { name: 'ext1' },
      };

      const newState = extensionUpdatesReducer(initialState, action);

      expect(newState).toBe(initialState);
    });
  });
});
