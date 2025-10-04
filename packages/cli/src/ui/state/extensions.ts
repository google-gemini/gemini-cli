/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionUpdateInfo } from '../../config/extension.js';
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
  notified: boolean;
}

export interface ExtensionUpdatesState {
  extensionStatuses: Map<string, ExtensionUpdateStatus>;
  batchChecksInProgress: number;
  // Explicitly scheduled updates.
  scheduledUpdate: ScheduledUpdate | null;
}

export interface ScheduledUpdate {
  names: string[] | null;
  all: boolean;
  onCompleteCallbacks: OnCompleteUpdate[];
}

export interface ScheduleUpdateArgs {
  names: string[] | null;
  all: boolean;
  onComplete: OnCompleteUpdate;
}

type OnCompleteUpdate = (updateInfos: ExtensionUpdateInfo[]) => void;

export const initialExtensionUpdatesState: ExtensionUpdatesState = {
  extensionStatuses: new Map(),
  batchChecksInProgress: 0,
  scheduledUpdate: null,
};

export type ExtensionUpdateAction =
  | {
      type: 'SET_STATE';
      payload: { name: string; state: ExtensionUpdateState };
    }
  | {
      type: 'SET_NOTIFIED';
      payload: { name: string; notified: boolean };
    }
  | { type: 'BATCH_CHECK_START' }
  | { type: 'BATCH_CHECK_END' }
  | { type: 'SCHEDULE_UPDATE'; payload: ScheduleUpdateArgs }
  | { type: 'CLEAR_SCHEDULED_UPDATE' };

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
        notified: false,
      });
      return { ...state, extensionStatuses: newStatuses };
    }
    case 'SET_NOTIFIED': {
      const existing = state.extensionStatuses.get(action.payload.name);
      if (!existing || existing.notified === action.payload.notified) {
        return state;
      }
      const newStatuses = new Map(state.extensionStatuses);
      newStatuses.set(action.payload.name, {
        ...existing,
        notified: action.payload.notified,
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
    case 'SCHEDULE_UPDATE':
      return {
        ...state,
        // If there is a pre-existing scheduled update, we merge them.
        scheduledUpdate: {
          all: state.scheduledUpdate?.all || action.payload.all,
          names: [
            ...(state.scheduledUpdate?.names ?? []),
            ...(action.payload.names ?? []),
          ],
          onCompleteCallbacks: [
            ...(state.scheduledUpdate?.onCompleteCallbacks ?? []),
            action.payload.onComplete,
          ],
        },
      };
    case 'CLEAR_SCHEDULED_UPDATE':
      return {
        ...state,
        scheduledUpdate: null,
      };
    default:
      checkExhaustive(action);
  }
}
