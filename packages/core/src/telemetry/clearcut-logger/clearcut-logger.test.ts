/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as https from 'https';
import { ClientRequest, IncomingMessage } from 'http';
import { Readable, Writable } from 'stream';

import {
  ClearcutLogger,
  LogResponse,
  LogEventEntry,
} from './clearcut-logger.js';
import { Config } from '../../config/config.js';
import * as userAccount from '../../utils/user_account.js';
import * as userId from '../../utils/user_id.js';

// Mock dependencies
vi.mock('https-proxy-agent');
vi.mock('https');
vi.mock('../../utils/user_account');
vi.mock('../../utils/user_id');

const mockHttps = vi.mocked(https);
const mockUserAccount = vi.mocked(userAccount);
const mockUserId = vi.mocked(userId);

describe('ClearcutLogger', () => {
  let mockConfig: Config;
  let logger: ClearcutLogger | undefined;

  // A helper to get the internal events array for testing
  const getEvents = (l: ClearcutLogger): LogEventEntry[][] =>
    l['events'].toArray() as LogEventEntry[][];

  const getEventsSize = (l: ClearcutLogger): number => l['events'].size;

  const getMaxEvents = (l: ClearcutLogger): number => l['max_events'];

  const getMaxRetryEvents = (l: ClearcutLogger): number =>
    l['max_retry_events'];

  const requeueFailedEvents = (l: ClearcutLogger, events: LogEventEntry[][]) =>
    l['requeueFailedEvents'](events);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());

    mockConfig = {
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getDebugMode: vi.fn().mockReturnValue(false),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProxy: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;

    mockUserAccount.getCachedGoogleAccount.mockReturnValue('test@google.com');
    mockUserAccount.getLifetimeGoogleAccounts.mockReturnValue(1);
    mockUserId.getInstallationId.mockReturnValue('test-installation-id');

    logger = ClearcutLogger.getInstance(mockConfig);
    expect(logger).toBeDefined();
  });

  afterEach(() => {
    ClearcutLogger.clearInstance();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not return an instance if usage statistics are disabled', () => {
    ClearcutLogger.clearInstance();
    vi.spyOn(mockConfig, 'getUsageStatisticsEnabled').mockReturnValue(false);
    const disabledLogger = ClearcutLogger.getInstance(mockConfig);
    expect(disabledLogger).toBeUndefined();
  });

  describe('enqueueLogEvent', () => {
    it('should add events to the queue', () => {
      logger!.enqueueLogEvent({ test: 'event1' });
      expect(getEventsSize(logger!)).toBe(1);
    });

    it('should evict the oldest event when the queue is full', () => {
      const maxEvents = getMaxEvents(logger!);

      for (let i = 0; i < maxEvents; i++) {
        logger!.enqueueLogEvent({ event_id: i });
      }

      expect(getEventsSize(logger!)).toBe(maxEvents);
      const firstEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      expect(firstEvent.event_id).toBe(0);

      // This should push out the first event
      logger!.enqueueLogEvent({ event_id: maxEvents });

      expect(getEventsSize(logger!)).toBe(maxEvents);
      const newFirstEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      expect(newFirstEvent.event_id).toBe(1);
      const lastEvent = JSON.parse(
        getEvents(logger!)[maxEvents - 1][0].source_extension_json,
      );
      expect(lastEvent.event_id).toBe(maxEvents);
    });
  });

  describe('flushToClearcut', () => {
    let mockRequest: Writable;
    let mockResponse: Readable & Partial<IncomingMessage>;

    beforeEach(() => {
      mockRequest = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      vi.spyOn(mockRequest, 'on');
      vi.spyOn(mockRequest, 'end').mockReturnThis();
      vi.spyOn(mockRequest, 'destroy').mockReturnThis();

      mockResponse = new Readable({ read() {} }) as Readable &
        Partial<IncomingMessage>;

      mockHttps.request.mockImplementation(
        (
          _options: string | https.RequestOptions | URL,
          ...args: unknown[]
        ): ClientRequest => {
          const callback = args.find((arg) => typeof arg === 'function') as
            | ((res: IncomingMessage) => void)
            | undefined;

          if (callback) {
            callback(mockResponse as IncomingMessage);
          }
          return mockRequest as ClientRequest;
        },
      );
    });

    it('should clear events on successful flush', async () => {
      mockResponse.statusCode = 200;
      const mockResponseBody = { nextRequestWaitMs: 1000 };
      // Encoded protobuf for {nextRequestWaitMs: 1000} which is `08 E8 07`
      const encodedResponse = Buffer.from([8, 232, 7]);

      logger!.enqueueLogEvent({ event_id: 1 });
      const flushPromise = logger!.flushToClearcut();

      mockResponse.push(encodedResponse);
      mockResponse.push(null); // End the stream

      const response: LogResponse = await flushPromise;

      expect(getEventsSize(logger!)).toBe(0);
      expect(response.nextRequestWaitMs).toBe(
        mockResponseBody.nextRequestWaitMs,
      );
    });

    it('should handle a network error and requeue events', async () => {
      logger!.enqueueLogEvent({ event_id: 1 });
      logger!.enqueueLogEvent({ event_id: 2 });
      expect(getEventsSize(logger!)).toBe(2);

      const flushPromise = logger!.flushToClearcut();
      mockRequest.emit('error', new Error('Network error'));
      await flushPromise;

      expect(getEventsSize(logger!)).toBe(2);
      const events = getEvents(logger!);
      expect(JSON.parse(events[0][0].source_extension_json).event_id).toBe(1);
    });

    it('should handle an HTTP error and requeue events', async () => {
      mockResponse.statusCode = 500;
      mockResponse.statusMessage = 'Internal Server Error';

      logger!.enqueueLogEvent({ event_id: 1 });
      logger!.enqueueLogEvent({ event_id: 2 });
      expect(getEventsSize(logger!)).toBe(2);

      const flushPromise = logger!.flushToClearcut();
      mockResponse.emit('end'); // End the response to trigger promise resolution
      await flushPromise;

      expect(getEventsSize(logger!)).toBe(2);
      const events = getEvents(logger!);
      expect(JSON.parse(events[0][0].source_extension_json).event_id).toBe(1);
    });
  });

  describe('requeueFailedEvents logic', () => {
    it('should limit the number of requeued events to max_retry_events', () => {
      const maxRetryEvents = getMaxRetryEvents(logger!);
      const eventsToLogCount = maxRetryEvents + 5;
      const eventsToSend: LogEventEntry[][] = [];
      for (let i = 0; i < eventsToLogCount; i++) {
        eventsToSend.push([
          {
            event_time_ms: Date.now(),
            source_extension_json: JSON.stringify({ event_id: i }),
          },
        ]);
      }

      requeueFailedEvents(logger!, eventsToSend);

      expect(getEventsSize(logger!)).toBe(maxRetryEvents);
      const firstRequeuedEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      // The last `maxRetryEvents` are kept. The oldest of those is at index `eventsToLogCount - maxRetryEvents`.
      expect(firstRequeuedEvent.event_id).toBe(
        eventsToLogCount - maxRetryEvents,
      );
    });

    it('should not requeue more events than available space in the queue', () => {
      const maxEvents = getMaxEvents(logger!);
      const spaceToLeave = 5;
      const initialEventCount = maxEvents - spaceToLeave;
      for (let i = 0; i < initialEventCount; i++) {
        logger!.enqueueLogEvent({ event_id: `initial_${i}` });
      }
      expect(getEventsSize(logger!)).toBe(initialEventCount);

      const failedEventsCount = 10; // More than spaceToLeave
      const eventsToSend: LogEventEntry[][] = [];
      for (let i = 0; i < failedEventsCount; i++) {
        eventsToSend.push([
          {
            event_time_ms: Date.now(),
            source_extension_json: JSON.stringify({ event_id: `failed_${i}` }),
          },
        ]);
      }

      requeueFailedEvents(logger!, eventsToSend);

      // availableSpace is 5. eventsToRequeue is min(10, 5) = 5.
      // Total size should be initialEventCount + 5 = maxEvents.
      expect(getEventsSize(logger!)).toBe(maxEvents);

      // The requeued events are the *last* 5 of the failed events.
      // startIndex = max(0, 10 - 5) = 5.
      // Loop unshifts events from index 9 down to 5.
      // The first element in the deque is the one with id 'failed_5'.
      const firstRequeuedEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      expect(firstRequeuedEvent.event_id).toBe('failed_5');
    });
  });
});
