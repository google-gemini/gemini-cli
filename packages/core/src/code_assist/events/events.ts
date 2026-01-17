/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import type { Event } from './types.js';

let eventPromise: Promise<Event | undefined> | undefined;

/**
 * Gets the next event from the server.
 *
 * The events are cached so that they are only fetched once.
 */
export async function getEvents(
  server?: CodeAssistServer | undefined,
): Promise<Event | undefined> {
  if (eventPromise) {
    return eventPromise;
  }

  eventPromise = (async () => {
    if (!server) {
      return undefined;
    }
    const response = await server.receiveEvents();
    return response.event;
  })();
  return eventPromise;
}
