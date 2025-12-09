/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeAssistServer } from '../server.js';
import type { ReceiveEventsResponse } from './types.js';

// Mock dependencies before importing the module under test
vi.mock('../server.js');

describe('events', () => {
  let mockServer: CodeAssistServer;

  beforeEach(() => {
    // Reset modules to clear the cached `eventsPromise`
    vi.resetModules();

    // Create a mock instance of the server for each test
    mockServer = {
      receiveEvents: vi.fn(),
    } as unknown as CodeAssistServer;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch events from the server', async () => {
    const { getEvents } = await import('./events.js');
    const mockApiResponse: ReceiveEventsResponse = {
      events: [
        {
          eventId: '1',
          eventType: 'CAMPAIGN_NOTIFICATION',
          campaignNotification: {
            title: 'title',
            body: 'body',
            campaignId: 'id',
            actions: [],
          },
        },
      ],
    };
    vi.mocked(mockServer.receiveEvents).mockResolvedValue(mockApiResponse);

    const events = await getEvents(mockServer);

    expect(mockServer.receiveEvents).toHaveBeenCalled();
    expect(events).toEqual(mockApiResponse);
  });

  it('should cache the events promise to avoid multiple fetches', async () => {
    const { getEvents } = await import('./events.js');
    const mockApiResponse: ReceiveEventsResponse = {
      events: [],
    };
    vi.mocked(mockServer.receiveEvents).mockResolvedValue(mockApiResponse);

    const firstCall = await getEvents(mockServer);
    const secondCall = await getEvents(mockServer);

    expect(firstCall).toBe(secondCall); // Should be the exact same promise object
    expect(mockServer.receiveEvents).toHaveBeenCalledTimes(1);
  });
});
