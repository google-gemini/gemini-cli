/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { checkExhaustive } from '../../utils/checks.js';

export enum ExtensionUpdateState {
  CHECKING_FOR_UPDATES = 'checking for updates',
  UPDATED_NEEDS_RESTART = 'updated, needs restart',
  UPDATING = 'updating',
  UPDATE_AVAILABLE = 'update available',
  UP_TO_DATE = 'up to date',
  ERROR = 'error',
  NOT_UPDATABLE = 'not updatable',
  UNKNOWN = 'unknown',
}

export interface ExtensionUpdateStatus {
  status: ExtensionUpdateState;
  processed: boolean;
}

export interface ExtensionUpdatesState {
  extensionStatuses: Map<string, ExtensionUpdateStatus>;
  batchChecksInProgress: number;
}

export const initialExtensionUpdatesState: ExtensionUpdatesState = {
  extensionStatuses: new Map(),
  batchChecksInProgress: 0,
};

export type ExtensionUpdateAction =
  | {
      type: 'SET_STATE';
      payload: { name: string; state: ExtensionUpdateState };
    }
  | {
      type: 'SET_PROCESSED';
      payload: { name: string; processed: boolean };
    }
  | { type: 'BATCH_CHECK_START' }
  | { type: 'BATCH_CHECK_END' };

export function extensionUpdatesReducer(
  state: ExtensionUpdatesState,
  action: ExtensionUpdateAction,
): ExtensionUpdatesState {
  switch (action.type) {
    case 'SET_STATE': {
      const existing = state.extensionStatuses.get(action.payload.name);
      if (existing?.status === action.payload.state) {
        return state;
      }
      const newStatuses = new Map(state.extensionStatuses);
      newStatuses.set(action.payload.name, {
        status: action.payload.state,
        processed: false,
      });
      return { ...state, extensionStatuses: newStatuses };
    }
    case 'SET_PROCESSED': {
      const existing = state.extensionStatuses.get(action.payload.name);
      if (!existing || existing.processed === action.payload.processed) {
        return state;
      }
      const newStatuses = new Map(state.extensionStatuses);
      newStatuses.set(action.payload.name, {
        ...existing,
        processed: action.payload.processed,
      });
      return { ...state, extensionStatuses: newStatuses };
    }
    case 'BATCH_CHECK_START':
      return {
        ...state,
        batchChecksInProgress: state.batchChecksInProgress + 1,
      };
    case 'BATCH_CHECK_END':
      return {
        ...state,
        batchChecksInProgress: state.batchChecksInProgress - 1,
      };
    default:
      checkExhaustive(action);
  }
}
