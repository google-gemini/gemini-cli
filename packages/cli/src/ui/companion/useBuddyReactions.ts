/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { setBuddyStatus } from './BuddyState.js';

export type BuddyReactionEvent =
  | { type: 'command_suppressed'; command: string }
  | { type: 'command_denied'; command: string }
  | { type: 'dev_loop_auto_build'; command?: string };

export function applyBuddyReaction(event: BuddyReactionEvent): void {
  switch (event.type) {
    case 'command_suppressed':
      setBuddyStatus('protective', `Skipped ${event.command}. Still on mission.`);
      return;
    case 'command_denied':
      setBuddyStatus('blocked', `Blocked ${event.command}. Nope rope cut.`);
      return;
    case 'dev_loop_auto_build':
      setBuddyStatus('busy', 'Dev build is catching up. Coffee-sized pause.');
      return;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function useBuddyReactions(events: readonly BuddyReactionEvent[]): void {
  useEffect(() => {
    const latest = events.at(-1);
    if (latest) {
      applyBuddyReaction(latest);
    }
  }, [events]);
}
