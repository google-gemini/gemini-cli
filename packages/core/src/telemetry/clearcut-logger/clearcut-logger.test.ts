/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import 'vitest';
import {
  vi,
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import {
  ClearcutLogger,
  LogEvent,
  LogEventEntry,
  EventNames,
  TEST_ONLY,
} from './clearcut-logger.js';
import {
  AuthType,
  ContentGeneratorConfig,
} from '../../core/contentGenerator.js';
import { ConfigParameters } from '../../config/config.js';
import { EventMetadataKey } from './event-metadata-key.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/msw.js';
import { UserPromptEvent, makeChatCompressionEvent } from '../types.js';
import { GIT_COMMIT_INFO, CLI_VERSION } from '../../generated/git-commit.js';
import { UserAccountManager } from '../../utils/userAccountManager.js';
import { InstallationManager } from '../../utils/installationManager.js';

interface CustomMatchers<R = unknown> {
  toHaveMetadataValue: ([key, value]: [EventMetadataKey, string]) => R;
  toHaveEventName: (name: EventNames) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Matchers<T = any> extends CustomMatchers<T> {}
}

expect.extend({
  toHaveEventName(received: LogEventEntry[], name: EventNames) {
    const { isNot } = this;
    const event = JSON.parse(received[0].source_extension_json) as LogEvent;
    const pass = event.event_name === (name as unknown as string);
    return {
      pass,
      message: () =>
        `event name ${event.event_name} does${isNot ? ' not ' : ''} match ${name}}`,
    };
  },

  toHaveMetadataValue(
    received: LogEventEntry[],
    [key, value]: [EventMetadataKey, string],
  ) {
    const { isNot } = this;
    const event = JSON.parse(received[0].source_extension_json) as LogEvent;
    const metadata = event['event_metadata'][0];
    const data = metadata.find((m) => m.gemini_cli_key === key)?.value;

    const pass = data !== undefined && data === value;

    return {
      pass,
      message: () =>
        `event ${received} does${isNot ? ' not' : ''} have ${value}}`,
    };
  },
});

vi.mock('../../utils/userAccountManager.js');
vi.mock('../../utils/installationManager.js');

const mockUserAccount = vi.mocked(UserAccountManager.prototype);
const mockInstallMgr = vi.mocked(InstallationManager.prototype);

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
    mockInstallMgr.getInstallationId = vi
      .fn()
      .mockReturnValue('test-installation-id');

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

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
        value: '9001',
      });
    });

    it('logs the current surface from a github action', () => {
      const { logger } = setup({});

      vi.stubEnv('GITHUB_SHA', '8675309');

      const event = logger?.createLogEvent(EventNames.CHAT_COMPRESSION, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
        value: 'GitHub',
      });
    });

    it('logs default metadata', () => {
      // Define expected values
      const session_id = 'my-session-id';
      const auth_type = AuthType.USE_GEMINI;
      const google_accounts = 123;
      const surface = 'ide-1234';
      const cli_version = CLI_VERSION;
      const git_commit_hash = GIT_COMMIT_INFO;
      const prompt_id = 'my-prompt-123';

      // Setup logger with expected values
      const { logger, loggerConfig } = setup({
        lifetimeGoogleAccounts: google_accounts,
        config: { sessionId: session_id },
      });
      vi.spyOn(loggerConfig, 'getContentGeneratorConfig').mockReturnValue({
        authType: auth_type,
      } as ContentGeneratorConfig);
      logger?.logNewPromptEvent(new UserPromptEvent(1, prompt_id)); // prompt_id == session_id before this
      vi.stubEnv('SURFACE', surface);

      // Create log event
      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      // Ensure expected values exist
      expect(event?.event_metadata[0]).toEqual(
        expect.arrayContaining([
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
            value: session_id,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
            value: JSON.stringify(auth_type),
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
            value: `${google_accounts}`,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
            value: surface,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_VERSION,
            value: cli_version,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_GIT_COMMIT_HASH,
            value: git_commit_hash,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
            value: prompt_id,
          },
        ]),
      );
    });

    it('logs the current surface', () => {
      const { logger } = setup({});

      vi.stubEnv('TERM_PROGRAM', 'vscode');
      vi.stubEnv('SURFACE', 'ide-1234');

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      expect(event?.event_metadata[0]).toContainEqual({
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
      'logs the current surface as $expectedValue, preempting vscode detection',
      ({ env, expectedValue }) => {
        const { logger } = setup({});
        for (const [key, value] of Object.entries(env)) {
          vi.stubEnv(key, value);
        }
        vi.stubEnv('TERM_PROGRAM', 'vscode');
        const event = logger?.createLogEvent(EventNames.API_ERROR, []);
        expect(event?.event_metadata[0][3]).toEqual({
          gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
          value: expectedValue,
        });
      },
    );
  });

  describe('logChatCompressionEvent', () => {
    it('logs an event with proper fields', () => {
      const { logger } = setup();
      logger?.logChatCompressionEvent(
        makeChatCompressionEvent({
          tokens_before: 9001,
          tokens_after: 8000,
        }),
      );

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.CHAT_COMPRESSION);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_COMPRESSION_TOKENS_BEFORE,
        '9001',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_COMPRESSION_TOKENS_AFTER,
        '8000',
      ]);
    });
  });

  describe('enqueueLogEvent', () => {
    it('should add events to the queue', () => {
      const { logger } = setup();
      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));
      expect(getEventsSize(logger!)).toBe(1);
    });

    it('should evict the oldest event when the queue is full', () => {
      const { logger } = setup();

      for (let i = 0; i < TEST_ONLY.MAX_EVENTS; i++) {
        logger!.enqueueLogEvent(
          logger!.createLogEvent(EventNames.API_ERROR, [
            {
              gemini_cli_key: EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
              value: `${i}`,
            },
          ]),
        );
      }

      let events = getEvents(logger!);
      expect(events.length).toBe(TEST_ONLY.MAX_EVENTS);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        '0',
      ]);

      // This should push out the first event
      logger!.enqueueLogEvent(
        logger!.createLogEvent(EventNames.API_ERROR, [
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
            value: `${TEST_ONLY.MAX_EVENTS}`,
          },
        ]),
      );
      events = getEvents(logger!);
      expect(events.length).toBe(TEST_ONLY.MAX_EVENTS);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        '1',
      ]);

      expect(events.at(TEST_ONLY.MAX_EVENTS - 1)).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        `${TEST_ONLY.MAX_EVENTS}`,
      ]);
    });
  });

  describe('flushToClearcut', () => {
    it('allows for usage with a configured proxy agent', async () => {
      const { logger } = setup({
        config: {
          proxy: 'http://mycoolproxy.whatever.com:3128',
        },
      });

      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));

      const response = await logger!.flushToClearcut();

      expect(response.nextRequestWaitMs).toBe(NEXT_WAIT_MS);
    });

    it('should clear events on successful flush', async () => {
      const { logger } = setup();

      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));
      const response = await logger!.flushToClearcut();

      expect(getEvents(logger!)).toEqual([]);
      expect(response.nextRequestWaitMs).toBe(NEXT_WAIT_MS);
    });

    it('should handle a network error and requeue events', async () => {
      const { logger } = setup();

      server.resetHandlers(http.post(CLEARCUT_URL, () => HttpResponse.error()));
      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_REQUEST));
      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));
      expect(getEventsSize(logger!)).toBe(2);

      const x = logger!.flushToClearcut();
      await x;

      expect(getEventsSize(logger!)).toBe(2);
      const events = getEvents(logger!);

      expect(events.length).toBe(2);
      expect(events[0]).toHaveEventName(EventNames.API_REQUEST);
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

      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_REQUEST));
      logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));

      expect(getEvents(logger!).length).toBe(2);
      await logger!.flushToClearcut();

      const events = getEvents(logger!);

      expect(events[0]).toHaveEventName(EventNames.API_REQUEST);
    });
  });

  describe('requeueFailedEvents logic', () => {
    it('should limit the number of requeued events to max_retry_events', () => {
      const { logger } = setup();
      const eventsToLogCount = TEST_ONLY.MAX_RETRY_EVENTS + 5;
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

      expect(getEventsSize(logger!)).toBe(TEST_ONLY.MAX_RETRY_EVENTS);
      const firstRequeuedEvent = JSON.parse(
        getEvents(logger!)[0][0].source_extension_json,
      ) as { event_id: string };
      // The last `maxRetryEvents` are kept. The oldest of those is at index `eventsToLogCount - maxRetryEvents`.
      expect(firstRequeuedEvent.event_id).toBe(
        eventsToLogCount - TEST_ONLY.MAX_RETRY_EVENTS,
      );
    });

    it('should not requeue more events than available space in the queue', () => {
      const { logger } = setup();
      const maxEvents = TEST_ONLY.MAX_EVENTS;
      const spaceToLeave = 5;
      const initialEventCount = maxEvents - spaceToLeave;
      for (let i = 0; i < initialEventCount; i++) {
        logger!.enqueueLogEvent(logger!.createLogEvent(EventNames.API_ERROR));
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
      ) as { event_id: string };
      expect(firstRequeuedEvent.event_id).toBe('failed_5');
    });
  });
});
