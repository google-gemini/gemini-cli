/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

export type ExtensionUpdateAction =
  | {
      type: 'SET_STATE';
      payload: { name: string; state: ExtensionUpdateState };
    }
  | {
      type: 'SET_PROCESSED';
      payload: { name: string; processed: boolean };
    };

export function extensionUpdatesReducer(
  state: Map<string, ExtensionUpdateStatus>,
  action: ExtensionUpdateAction,
): Map<string, ExtensionUpdateStatus> {
  switch (action.type) {
    case 'SET_STATE': {
      const existing = state.get(action.payload.name);
      if (existing?.status === action.payload.state) {
        return state;
      }
      const newState = new Map(state);
      newState.set(action.payload.name, {
        status: action.payload.state,
        processed: false,
      });
      return newState;
    }
    case 'SET_PROCESSED': {
      const existing = state.get(action.payload.name);
      if (!existing || existing.processed === action.payload.processed) {
        return state;
      }
      const newState = new Map(state);
      newState.set(action.payload.name, {
        ...existing,
        processed: action.payload.processed,
      });
      return newState;
    }
    default:
      return state;
  }
}
