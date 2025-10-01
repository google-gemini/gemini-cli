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

export type ExtensionUpdateAction = {
  type: 'SET_STATE';
  payload: { name: string; state: ExtensionUpdateState };
};

export function extensionUpdatesReducer(
  state: Map<string, ExtensionUpdateState>,
  action: ExtensionUpdateAction,
): Map<string, ExtensionUpdateState> {
  switch (action.type) {
    case 'SET_STATE': {
      if (state.get(action.payload.name) === action.payload.state) {
        return state;
      }
      const newState = new Map(state);
      newState.set(action.payload.name, action.payload.state);
      return newState;
    }
    default:
      return state;
  }
}
