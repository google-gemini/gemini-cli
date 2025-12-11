/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodeAssistServer } from '../server.js';
import type { Events } from './types.js';

let eventsPromise: Promise<Events> | undefined;

/**
 * Gets the events from the server.
 *
 * The events are cached so that they are only fetched once.
 */
export async function getEvents(server: CodeAssistServer): Promise<Events> {
  if (eventsPromise) {
    return eventsPromise;
  }

  eventsPromise = (async () => {
    const response = await server.receiveEvents();
    return response;
  })();
  return eventsPromise;
}
