/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { spawn } from 'node:child_process';
import type { LoadedSettings } from '../../config/settings.js';

export enum Event {
  Idle = 'idle',
  Confirm = 'confirm',
}

interface EventHandler {
  on?: Event[];
  spawn?: string[];
}

export interface UseEventManagerReturn {
  notify: (event: Event) => void;
}

/**
 * Custom hook to manage events.
 *
 * Encapsulates the code to fire an event and execute a configured command.
 */
export function useEvents(settings: LoadedSettings): UseEventManagerReturn {
  const notify = useCallback(
    (event: Event) => {
      const events = settings?.merged?.events as EventHandler[];
      if (!events) {
        return;
      }

      for (const eventHandler of events) {
        if (!eventHandler.on?.includes(event)) {
          continue;
        }

        const spawnArgs = eventHandler.spawn;
        if (!spawnArgs || spawnArgs.length === 0) {
          console.error('No command configured to handle event', event);
          continue;
        }

        const [command, ...args] = spawnArgs;
        const child = spawn(command, args, {
          stdio: 'inherit',
        });

        child.on('error', (err) => {
          console.error('Failed to spawn process:', err);
        });
      }
    },
    [settings?.merged?.events],
  );

  return {
    notify,
  };
}
