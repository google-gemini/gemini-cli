/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import type { Event } from './types.js';

let eventPromise: Promise<Event> | undefined;

/**
 * Gets the next event from the server.
 *
 * The events are cached so that they are only fetched once.
 */
export async function getEvents(server: CodeAssistServer): Promise<Event> {
  if (eventPromise) {
    return eventPromise;
  }

  eventPromise = (async () => {
    const response = await server.receiveEvents();
    return response.event;
  })();
  return eventPromise;
}
