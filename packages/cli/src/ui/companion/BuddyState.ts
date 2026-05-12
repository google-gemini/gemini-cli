/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export type BuddyMood = 'steady' | 'blocked' | 'protective' | 'busy';

export interface BuddyState {
  visible: boolean;
  mood: BuddyMood;
  message: string;
}

const defaultState: BuddyState = {
  visible: false,
  mood: 'steady',
  message: 'Standing by.',
};

let buddyState: BuddyState = { ...defaultState };
const listeners = new Set<() => void>();

function notifyBuddyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getBuddyState(): BuddyState {
  return buddyState;
}

export function setBuddyVisible(visible: boolean): void {
  if (buddyState.visible === visible) {
    return;
  }

  buddyState = { ...buddyState, visible };
  notifyBuddyListeners();
}

export function toggleBuddy(): boolean {
  setBuddyVisible(!buddyState.visible);
  return buddyState.visible;
}

export function setBuddyStatus(mood: BuddyMood, message: string): void {
  if (buddyState.mood === mood && buddyState.message === message) {
    return;
  }

  buddyState = { ...buddyState, mood, message };
  notifyBuddyListeners();
}

export function resetBuddyState(): void {
  buddyState = { ...defaultState };
  notifyBuddyListeners();
}

export function useBuddyState(): BuddyState {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => {
      setVersion((version) => version + 1);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return buddyState;
}
