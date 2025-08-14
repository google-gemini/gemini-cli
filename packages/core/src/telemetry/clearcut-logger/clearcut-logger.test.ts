/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';

import { ClearcutLogger, LogEventEntry, TEST_ONLY } from './clearcut-logger.js';
import { ConfigParameters } from '../../config/config.js';
import * as userAccount from '../../utils/user_account.js';
import * as userId from '../../utils/user_id.js';
import { EventMetadataKey } from './event-metadata-key.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/msw.js';

vi.mock('../../utils/user_account');
vi.mock('../../utils/user_id');

const mockUserAccount = vi.mocked(userAccount);
const mockUserId = vi.mocked(userId);

// TODO(richieforeman): Consider moving this to test setup globally.
beforeAll(() => {
  server.listen({});
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('ClearcutLogger', () => {
  const NEXT_WAIT_MS = 1234;
  const CLEARCUT_URL = 'https://play.googleapis.com/log';
  const MOCK_DATE = new Date('2025-01-02T00:00:00.000Z');
  const EXAMPLE_RESPONSE = `["${NEXT_WAIT_MS}",null,[[["ANDROID_BACKUP",0],["BATTERY_STATS",0],["SMART_SETUP",0],["TRON",0]],-3334737594024971225],[]]`;
  // A helper to get the internal events array for testing
  const getEvents = (l: ClearcutLogger): LogEventEntry[][] =>
    l['events'].toArray() as LogEventEntry[][];

  const getEventsSize = (l: ClearcutLogger): number => l['events'].size;

  const requeueFailedEvents = (l: ClearcutLogger, events: LogEventEntry[][]) =>
    l['requeueFailedEvents'](events);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setup({
    config = {} as Partial<ConfigParameters>,
    lifetimeGoogleAccounts = 1,
    cachedGoogleAccount = 'test@google.com',
    installationId = 'test-installation-id',
  } = {}) {
    server.resetHandlers(
      http.post(CLEARCUT_URL, () => HttpResponse.text(EXAMPLE_RESPONSE)),
    );

    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);

    const loggerConfig = makeFakeConfig({
      ...config,
    });
    ClearcutLogger.clearInstance();

    mockUserAccount.getCachedGoogleAccount.mockReturnValue(cachedGoogleAccount);
    mockUserAccount.getLifetimeGoogleAccounts.mockReturnValue(
      lifetimeGoogleAccounts,
    );
    mockUserId.getInstallationId.mockReturnValue(installationId);

    const logger = ClearcutLogger.getInstance(loggerConfig);

    return { logger, loggerConfig };
  }

  afterEach(() => {
    ClearcutLogger.clearInstance();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it.each([
      { usageStatisticsEnabled: false, expectedValue: undefined },
      {
        usageStatisticsEnabled: true,
        expectedValue: expect.any(ClearcutLogger),
      },
    ])(
      'returns an instance if usage statistics are enabled',
      ({ usageStatisticsEnabled, expectedValue }) => {
        ClearcutLogger.clearInstance();
        const { logger } = setup({
          config: {
            usageStatisticsEnabled,
          },
        });
        expect(logger).toEqual(expectedValue);
      },
    );

    it('is a singleton', () => {
      ClearcutLogger.clearInstance();
      const { loggerConfig } = setup();
      const logger1 = ClearcutLogger.getInstance(loggerConfig);
      const logger2 = ClearcutLogger.getInstance(loggerConfig);
      expect(logger1).toBe(logger2);
    });
  });

  describe('createLogEvent', () => {
    it('logs the total number of google accounts', () => {
      const { logger } = setup({
        lifetimeGoogleAccounts: 9001,
      });

      const event = logger?.createLogEvent('abc', []);

      expect(event?.event_metadata[0][0]).toEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
        value: '9001',
      });
    });

    it('logs the current surface from a github action', () => {
      const { logger } = setup({});

      vi.stubEnv('GITHUB_SHA', '8675309');

      const event = logger?.createLogEvent('abc', []);

      expect(event?.event_metadata[0][1]).toEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
        value: 'GitHub',
      });
    });

    it('honors the value from env.SURFACE over all others', () => {
      const { logger } = setup({});

      vi.stubEnv('TERM_PROGRAM', 'vscode');
      vi.stubEnv('SURFACE', 'ide-1234');

      const event = logger?.createLogEvent('abc', []);

      expect(event?.event_metadata[0][1]).toEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
        value: 'ide-1234',
      });
    });

    it.each([
      {
        env: {
          CURSOR_TRACE_ID: 'abc123',
          GITHUB_SHA: undefined,
        },
        expectedValue: 'cursor',
      },
      {
        env: {
          TERM_PROGRAM: 'vscode',
          GITHUB_SHA: undefined,
        },
        expectedValue: 'vscode',
      },
      {
        env: {
          MONOSPACE_ENV: 'true',
          GITHUB_SHA: undefined,
        },
        expectedValue: 'firebasestudio',
      },
      {
        env: {
          __COG_BASHRC_SOURCED: 'true',
          GITHUB_SHA: undefined,
        },
        expectedValue: 'devin',
      },
      {
        env: {
          CLOUD_SHELL: 'true',
          GITHUB_SHA: undefined,
        },
        expectedValue: 'cloudshell',
      },
    ])(
      'logs the current surface for as $expectedValue, preempting vscode detection',
      ({ env, expectedValue }) => {
        const { logger } = setup({});
        for (const [key, value] of Object.entries(env)) {
          vi.stubEnv(key, value);
        }
        vi.stubEnv('TERM_PROGRAM', 'vscode');
        const event = logger?.createLogEvent('abc', []);
        expect(event?.event_metadata[0][1]).toEqual({
          gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
          value: expectedValue,
        });
      },
    );
  });

  describe('enqueueLogEvent', () => {
    it('should add events to the queue', () => {
      const { logger } = setup();
      logger!.enqueueLogEvent({ test: 'event1' });
      expect(getEventsSize(logger!)).toBe(1);
    });

    it('should evict the oldest event when the queue is full', () => {
      const { logger } = setup();

      for (let i = 0; i < TEST_ONLY.MAX_EVENTS; i++) {
        logger!.enqueueLogEvent({ event_id: i });
      }

      expect(getEventsSize(logger!)).toBe(TEST_ONLY.MAX_EVENTS);
      const firstEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      expect(firstEvent.event_id).toBe(0);

      // This should push out the first event
      logger!.enqueueLogEvent({ event_id: TEST_ONLY.MAX_EVENTS });

      expect(getEventsSize(logger!)).toBe(TEST_ONLY.MAX_EVENTS);
      const newFirstEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      );
      expect(newFirstEvent.event_id).toBe(1);
      const lastEvent = JSON.parse(
        getEvents(logger!)[TEST_ONLY.MAX_EVENTS - 1][0].source_extension_json,
      );
      expect(lastEvent.event_id).toBe(TEST_ONLY.MAX_EVENTS);
    });
  });

  describe('flushToClearcut', () => {
    it('allows for usage with a configured proxy agent', async () => {
      const { logger } = setup({
        config: {
          proxy: 'http://mycoolproxy.whatever.com:3128',
        },
      });

      logger!.enqueueLogEvent({ event_id: 1 });

      const response = await logger!.flushToClearcut();

      expect(response.nextRequestWaitMs).toBe(NEXT_WAIT_MS);
    });

    it('should clear events on successful flush', async () => {
      const { logger } = setup();

      logger!.enqueueLogEvent({ event_id: 1 });
      const response = await logger!.flushToClearcut();

      expect(getEvents(logger!)).toEqual([]);
      expect(response.nextRequestWaitMs).toBe(NEXT_WAIT_MS);
    });

    it('should handle a network error and requeue events', async () => {
      const { logger } = setup();

      server.resetHandlers(http.post(CLEARCUT_URL, () => HttpResponse.error()));
      logger!.enqueueLogEvent({ event_id: 1 });
      logger!.enqueueLogEvent({ event_id: 2 });
      expect(getEventsSize(logger!)).toBe(2);

      const x = logger!.flushToClearcut();
      await x;

      expect(getEventsSize(logger!)).toBe(2);
      const events = getEvents(logger!);
      expect(JSON.parse(events[0][0].source_extension_json).event_id).toBe(1);
    });

    it('should handle an HTTP error and requeue events', async () => {
      const { logger } = setup();

      server.resetHandlers(
        http.post(
          CLEARCUT_URL,
          () =>
            new HttpResponse(
              { 'the system is down': true },
              {
                status: 500,
              },
            ),
        ),
      );

      logger!.enqueueLogEvent({ event_id: 1 });
      logger!.enqueueLogEvent({ event_id: 2 });

      expect(getEvents(logger!).length).toBe(2);
      await logger!.flushToClearcut();

      expect(getEvents(logger!).length).toBe(2);
      const events = getEvents(logger!);
      expect(JSON.parse(events[0][0].source_extension_json).event_id).toBe(1);
    });
  });

  describe('requeueFailedEvents logic', () => {
    it('should limit the number of requeued events to max_retry_events', () => {
      const { logger } = setup();
      const maxRetryEvents = TEST_ONLY.MAX_RETRY_EVENTS;
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
      const { logger } = setup();
      const maxEvents = TEST_ONLY.MAX_EVENTS;
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
