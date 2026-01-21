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
  beforeEach,
} from 'vitest';
import type { LogEvent, LogEventEntry } from './clearcut-logger.js';
import { ClearcutLogger, EventNames, TEST_ONLY } from './clearcut-logger.js';
import type { ContentGeneratorConfig } from '../../core/contentGenerator.js';
import { AuthType } from '../../core/contentGenerator.js';
import type { SuccessfulToolCall } from '../../core/coreToolScheduler.js';
import type { ConfigParameters } from '../../config/config.js';
import { EventMetadataKey } from './event-metadata-key.js';
import { makeFakeConfig } from '../../test-utils/config.js';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/msw.js';
import {
  StartSessionEvent,
  UserPromptEvent,
  makeChatCompressionEvent,
  ModelRoutingEvent,
  ToolCallEvent,
  AgentStartEvent,
  AgentFinishEvent,
  WebFetchFallbackAttemptEvent,
  HookCallEvent,
} from '../types.js';
import { AgentTerminateMode } from '../../agents/types.js';
import { GIT_COMMIT_INFO, CLI_VERSION } from '../../generated/git-commit.js';
import { UserAccountManager } from '../../utils/userAccountManager.js';
import { InstallationManager } from '../../utils/installationManager.js';

import si from 'systeminformation';
import type { Systeminformation } from 'systeminformation';

interface CustomMatchers<R = unknown> {
  toHaveMetadataValue: ([key, value]: [EventMetadataKey, string]) => R;
  toHaveEventName: (name: EventNames) => R;
  toHaveMetadataKey: (key: EventMetadataKey) => R;
  toHaveGwsExperiments: (exps: number[]) => R;
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
    const event = JSON.parse(received[0].source_extension_json) as LogEvent;
    const metadata = event['event_metadata'][0];
    const data = metadata.find((m) => m.gemini_cli_key === key)?.value;

    const pass = data !== undefined && data === value;

    return {
      pass,
      message: () => `event ${received} should have: ${value}. Found: ${data}`,
    };
  },

  toHaveMetadataKey(received: LogEventEntry[], key: EventMetadataKey) {
    const { isNot } = this;
    const event = JSON.parse(received[0].source_extension_json) as LogEvent;
    const metadata = event['event_metadata'][0];

    const pass = metadata.some((m) => m.gemini_cli_key === key);

    return {
      pass,
      message: () =>
        `event ${received} ${isNot ? 'has' : 'does not have'} the metadata key ${key}`,
    };
  },

  toHaveGwsExperiments(received: LogEventEntry[], exps: number[]) {
    const { isNot } = this;
    const gwsExperiment = received[0].exp?.gws_experiment;

    const pass =
      gwsExperiment !== undefined &&
      gwsExperiment.length === exps.length &&
      gwsExperiment.every((val, idx) => val === exps[idx]);

    return {
      pass,
      message: () =>
        `exp.gws_experiment ${JSON.stringify(gwsExperiment)} does${isNot ? '' : ' not'} match ${JSON.stringify(exps)}`,
    };
  },
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    cpus: vi.fn(() => [{ model: 'Intel(R) Core(TM) i9-9980HK CPU @ 2.40GHz' }]),
    totalmem: vi.fn(() => 32 * 1024 * 1024 * 1024),
  };
});

vi.mock('../../utils/userAccountManager.js');
vi.mock('../../utils/installationManager.js');
vi.mock('systeminformation', () => ({
  default: {
    graphics: vi.fn().mockResolvedValue({
      controllers: [{ model: 'Mock GPU' }],
    }),
  },
}));

const mockUserAccount = vi.mocked(UserAccountManager.prototype);
const mockInstallMgr = vi.mocked(InstallationManager.prototype);

beforeEach(() => {
  // Ensure Antigravity detection doesn't interfere with other tests
  vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
});

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

  beforeEach(() => {
    vi.stubEnv('ANTIGRAVITY_CLI_ALIAS', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('CODESPACES', '');
    vi.stubEnv('VSCODE_IPC_HOOK_CLI', '');
    vi.stubEnv('EDITOR_IN_CLOUD_SHELL', '');
    vi.stubEnv('CLOUD_SHELL', '');
    vi.stubEnv('TERM_PRODUCT', '');
    vi.stubEnv('MONOSPACE_ENV', '');
    vi.stubEnv('REPLIT_USER', '');
    vi.stubEnv('__COG_BASHRC_SOURCED', '');
  });

  function setup({
    config = {
      experiments: {
        experimentIds: [123, 456, 789],
      },
    } as unknown as Partial<ConfigParameters>,
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
    TEST_ONLY.resetCachedGpuInfoForTesting();
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
    it('logs the total number of google accounts', async () => {
      const { logger } = setup({
        lifetimeGoogleAccounts: 9001,
      });

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
        value: '9001',
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
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_OS,
            value: process.platform,
          },
          {
            gemini_cli_key: EventMetadataKey.GEMINI_CLI_USER_SETTINGS,
            value: logger?.getConfigJson(),
          },
        ]),
      );
    });

    it('logs the current nodejs version', () => {
      const { logger } = setup({});

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_NODE_VERSION,
        value: process.versions.node,
      });
    });

    it('logs all user settings', () => {
      const { logger } = setup({
        config: {},
      });

      vi.stubEnv('TERM_PROGRAM', 'vscode');
      vi.stubEnv('SURFACE', 'ide-1234');

      const event = logger?.createLogEvent(EventNames.TOOL_CALL, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_USER_SETTINGS,
        value: logger?.getConfigJson(),
      });
    });

    it('logs the GPU information (single GPU)', async () => {
      vi.mocked(si.graphics).mockResolvedValueOnce({
        controllers: [{ model: 'Single GPU' }],
      } as unknown as Systeminformation.GraphicsData);
      const { logger, loggerConfig } = setup({});

      await logger?.logStartSessionEvent(new StartSessionEvent(loggerConfig));

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      const gpuInfoEntry = event?.event_metadata[0].find(
        (item) => item.gemini_cli_key === EventMetadataKey.GEMINI_CLI_GPU_INFO,
      );
      expect(gpuInfoEntry).toBeDefined();
      expect(gpuInfoEntry?.value).toBe('Single GPU');
    });

    it('logs multiple GPUs', async () => {
      vi.mocked(si.graphics).mockResolvedValueOnce({
        controllers: [{ model: 'GPU 1' }, { model: 'GPU 2' }],
      } as unknown as Systeminformation.GraphicsData);
      const { logger, loggerConfig } = setup({});

      await logger?.logStartSessionEvent(new StartSessionEvent(loggerConfig));

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      const metadata = event?.event_metadata[0];

      const gpuInfoEntry = metadata?.find(
        (m) => m.gemini_cli_key === EventMetadataKey.GEMINI_CLI_GPU_INFO,
      );
      expect(gpuInfoEntry?.value).toBe('GPU 1, GPU 2');
    });

    it('logs NA when no GPUs are found', async () => {
      vi.mocked(si.graphics).mockResolvedValueOnce({
        controllers: [],
      } as unknown as Systeminformation.GraphicsData);
      const { logger, loggerConfig } = setup({});

      await logger?.logStartSessionEvent(new StartSessionEvent(loggerConfig));

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      const metadata = event?.event_metadata[0];

      const gpuInfoEntry = metadata?.find(
        (m) => m.gemini_cli_key === EventMetadataKey.GEMINI_CLI_GPU_INFO,
      );
      expect(gpuInfoEntry?.value).toBe('NA');
    });

    it('logs FAILED when GPU detection fails', async () => {
      vi.mocked(si.graphics).mockRejectedValueOnce(
        new Error('Detection failed'),
      );
      const { logger, loggerConfig } = setup({});

      await logger?.logStartSessionEvent(new StartSessionEvent(loggerConfig));

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);

      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GPU_INFO,
        value: 'FAILED',
      });
    });

    type SurfaceDetectionTestCase = {
      name: string;
      env: Record<string, string | undefined>;
      expected: string;
    };

    it.each<SurfaceDetectionTestCase>([
      {
        name: 'github action',
        env: { GITHUB_SHA: '8675309' },
        expected: 'GitHub',
      },
      {
        name: 'Cloud Shell via EDITOR_IN_CLOUD_SHELL',
        env: { EDITOR_IN_CLOUD_SHELL: 'true' },
        expected: 'cloudshell',
      },
      {
        name: 'Cloud Shell via CLOUD_SHELL',
        env: { CLOUD_SHELL: 'true' },
        expected: 'cloudshell',
      },
      {
        name: 'VSCode via TERM_PROGRAM',
        env: {
          TERM_PROGRAM: 'vscode',
          GITHUB_SHA: undefined,
          MONOSPACE_ENV: '',
        },
        expected: 'vscode',
      },
      {
        name: 'SURFACE env var',
        env: { SURFACE: 'ide-1234' },
        expected: 'ide-1234',
      },
      {
        name: 'SURFACE env var takes precedence',
        env: { TERM_PROGRAM: 'vscode', SURFACE: 'ide-1234' },
        expected: 'ide-1234',
      },
      {
        name: 'Cursor',
        env: {
          CURSOR_TRACE_ID: 'abc123',
          TERM_PROGRAM: 'vscode',
          GITHUB_SHA: undefined,
        },
        expected: 'cursor',
      },
      {
        name: 'Firebase Studio',
        env: {
          MONOSPACE_ENV: 'true',
          TERM_PROGRAM: 'vscode',
          GITHUB_SHA: undefined,
        },
        expected: 'firebasestudio',
      },
      {
        name: 'Devin',
        env: {
          __COG_BASHRC_SOURCED: 'true',
          TERM_PROGRAM: 'vscode',
          GITHUB_SHA: undefined,
        },
        expected: 'devin',
      },
      {
        name: 'unidentified',
        env: {
          GITHUB_SHA: undefined,
          TERM_PROGRAM: undefined,
          SURFACE: undefined,
        },
        expected: 'SURFACE_NOT_SET',
      },
    ])(
      'logs the current surface as $expected from $name',
      ({ env, expected }) => {
        const { logger } = setup({});
        for (const [key, value] of Object.entries(env)) {
          vi.stubEnv(key, value);
        }
        const event = logger?.createLogEvent(EventNames.API_ERROR, []);
        expect(event?.event_metadata[0]).toContainEqual({
          gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
          value: expected,
        });
      },
    );
  });

  describe('GH_WORKFLOW_NAME metadata', () => {
    it('includes workflow name when GH_WORKFLOW_NAME is set', () => {
      const { logger } = setup({});
      vi.stubEnv('GH_WORKFLOW_NAME', 'test-workflow');

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      expect(event?.event_metadata[0]).toContainEqual({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GH_WORKFLOW_NAME,
        value: 'test-workflow',
      });
    });

    it('does not include workflow name when GH_WORKFLOW_NAME is not set', () => {
      const { logger } = setup({});
      vi.stubEnv('GH_WORKFLOW_NAME', undefined);

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      const hasWorkflowName = event?.event_metadata[0].some(
        (item) =>
          item.gemini_cli_key === EventMetadataKey.GEMINI_CLI_GH_WORKFLOW_NAME,
      );
      expect(hasWorkflowName).toBe(false);
    });
  });

  describe('GITHUB_REPOSITORY metadata', () => {
    it('includes hashed repository when GITHUB_REPOSITORY is set', () => {
      vi.stubEnv('GITHUB_REPOSITORY', 'google/gemini-cli');
      const { logger } = setup({});

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      const repositoryMetadata = event?.event_metadata[0].find(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      );
      expect(repositoryMetadata).toBeDefined();
      expect(repositoryMetadata?.value).toMatch(/^[a-f0-9]{64}$/);
      expect(repositoryMetadata?.value).not.toBe('google/gemini-cli');
    });

    it('hashes repository name consistently', () => {
      vi.stubEnv('GITHUB_REPOSITORY', 'google/gemini-cli');
      const { logger } = setup({});

      const event1 = logger?.createLogEvent(EventNames.API_ERROR, []);
      const event2 = logger?.createLogEvent(EventNames.API_ERROR, []);

      const hash1 = event1?.event_metadata[0].find(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      )?.value;
      const hash2 = event2?.event_metadata[0].find(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      )?.value;

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different repositories', () => {
      vi.stubEnv('GITHUB_REPOSITORY', 'google/gemini-cli');
      const { logger: logger1 } = setup({});
      const event1 = logger1?.createLogEvent(EventNames.API_ERROR, []);
      const hash1 = event1?.event_metadata[0].find(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      )?.value;

      vi.stubEnv('GITHUB_REPOSITORY', 'google/other-repo');
      ClearcutLogger.clearInstance();
      const { logger: logger2 } = setup({});
      const event2 = logger2?.createLogEvent(EventNames.API_ERROR, []);
      const hash2 = event2?.event_metadata[0].find(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      )?.value;

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).not.toBe(hash2);
    });

    it('does not include repository when GITHUB_REPOSITORY is not set', () => {
      vi.stubEnv('GITHUB_REPOSITORY', undefined);
      const { logger } = setup({});

      const event = logger?.createLogEvent(EventNames.API_ERROR, []);
      const hasRepository = event?.event_metadata[0].some(
        (item) =>
          item.gemini_cli_key ===
          EventMetadataKey.GEMINI_CLI_GH_REPOSITORY_NAME_HASH,
      );
      expect(hasRepository).toBe(false);
    });
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

  describe('logRipgrepFallbackEvent', () => {
    it('logs an event with the proper name', () => {
      const { logger } = setup();
      // Spy on flushToClearcut to prevent it from clearing the queue
      const flushSpy = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(logger!, 'flushToClearcut' as any)
        .mockResolvedValue({ nextRequestWaitMs: 0 });

      logger?.logRipgrepFallbackEvent();

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.RIPGREP_FALLBACK);
      expect(flushSpy).toHaveBeenCalledOnce();
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

  describe('logModelRoutingEvent', () => {
    it('logs a successful routing event', () => {
      const { logger } = setup();
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'default-strategy',
        123,
        'some reasoning',
        false,
        undefined,
      );

      logger?.logModelRoutingEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.MODEL_ROUTING);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_DECISION,
        'gemini-pro',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_DECISION_SOURCE,
        'default-strategy',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_LATENCY_MS,
        '123',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_FAILURE,
        'false',
      ]);
    });

    it('logs a failed routing event with a reason', () => {
      const { logger } = setup();
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'router-exception',
        234,
        'some reasoning',
        true,
        'Something went wrong',
      );

      logger?.logModelRoutingEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.MODEL_ROUTING);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_DECISION,
        'gemini-pro',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_DECISION_SOURCE,
        'router-exception',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_LATENCY_MS,
        '234',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_FAILURE,
        'true',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_ROUTING_FAILURE_REASON,
        'Something went wrong',
      ]);
    });
  });

  describe('logAgentStartEvent', () => {
    it('logs an event with proper fields', () => {
      const { logger } = setup();
      const event = new AgentStartEvent('agent-123', 'TestAgent');

      logger?.logAgentStartEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.AGENT_START);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_ID,
        'agent-123',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_NAME,
        'TestAgent',
      ]);
    });
  });

  describe('logExperiments', () => {
    it('async path includes exp.gws_experiment field with experiment IDs', async () => {
      const { logger } = setup();
      const event = logger!.createLogEvent(EventNames.START_SESSION, []);

      await logger?.enqueueLogEventAfterExperimentsLoadAsync(event);
      await vi.runAllTimersAsync();

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.START_SESSION);
      // Both metadata and exp.gws_experiment should be populated
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_EXPERIMENT_IDS,
        '123,456,789',
      ]);
      expect(events[0]).toHaveGwsExperiments([123, 456, 789]);
    });

    it('async path includes empty gws_experiment array when no experiments', async () => {
      const { logger } = setup({
        config: {
          experiments: {
            experimentIds: [],
          },
        } as unknown as Partial<ConfigParameters>,
      });
      const event = logger!.createLogEvent(EventNames.START_SESSION, []);

      await logger?.enqueueLogEventAfterExperimentsLoadAsync(event);
      await vi.runAllTimersAsync();

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveGwsExperiments([]);
    });

    it('non-async path does not include exp.gws_experiment field', () => {
      const { logger } = setup();
      const event = new AgentStartEvent('agent-123', 'TestAgent');

      // logAgentStartEvent uses the non-async enqueueLogEvent path
      logger?.logAgentStartEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      // exp.gws_experiment should NOT be present for non-async events
      expect(events[0][0].exp).toBeUndefined();
    });
  });

  describe('logAgentFinishEvent', () => {
    it('logs an event with proper fields (success)', () => {
      const { logger } = setup();
      const event = new AgentFinishEvent(
        'agent-123',
        'TestAgent',
        1000,
        5,
        AgentTerminateMode.GOAL,
      );

      logger?.logAgentFinishEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.AGENT_FINISH);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_ID,
        'agent-123',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_NAME,
        'TestAgent',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_DURATION_MS,
        '1000',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_TURN_COUNT,
        '5',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_TERMINATE_REASON,
        'GOAL',
      ]);
    });

    it('logs an event with proper fields (error)', () => {
      const { logger } = setup();
      const event = new AgentFinishEvent(
        'agent-123',
        'TestAgent',
        500,
        2,
        AgentTerminateMode.ERROR,
      );

      logger?.logAgentFinishEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.AGENT_FINISH);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AGENT_TERMINATE_REASON,
        'ERROR',
      ]);
    });
  });

  describe('logToolCallEvent', () => {
    it('logs an event with all diff metadata', () => {
      const { logger } = setup();
      const completedToolCall = {
        request: { name: 'test', args: {}, prompt_id: 'prompt-123' },
        response: {
          resultDisplay: {
            diffStat: {
              model_added_lines: 1,
              model_removed_lines: 2,
              model_added_chars: 3,
              model_removed_chars: 4,
              user_added_lines: 5,
              user_removed_lines: 6,
              user_added_chars: 7,
              user_removed_chars: 8,
            },
          },
        },
        status: 'success',
      } as SuccessfulToolCall;

      logger?.logToolCallEvent(new ToolCallEvent(completedToolCall));

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.TOOL_CALL);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        '1',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_REMOVED_LINES,
        '2',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_CHARS,
        '3',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_REMOVED_CHARS,
        '4',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_USER_ADDED_LINES,
        '5',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_USER_REMOVED_LINES,
        '6',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_USER_ADDED_CHARS,
        '7',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_USER_REMOVED_CHARS,
        '8',
      ]);
    });

    it('logs an event with partial diff metadata', () => {
      const { logger } = setup();
      const completedToolCall = {
        request: { name: 'test', args: {}, prompt_id: 'prompt-123' },
        response: {
          resultDisplay: {
            diffStat: {
              model_added_lines: 1,
              model_removed_lines: 2,
              model_added_chars: 3,
              model_removed_chars: 4,
            },
          },
        },
        status: 'success',
      } as SuccessfulToolCall;

      logger?.logToolCallEvent(new ToolCallEvent(completedToolCall));

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.TOOL_CALL);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        '1',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_REMOVED_LINES,
        '2',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_ADDED_CHARS,
        '3',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_AI_REMOVED_CHARS,
        '4',
      ]);
      expect(events[0]).not.toHaveMetadataKey(
        EventMetadataKey.GEMINI_CLI_USER_ADDED_LINES,
      );
      expect(events[0]).not.toHaveMetadataKey(
        EventMetadataKey.GEMINI_CLI_USER_REMOVED_LINES,
      );
      expect(events[0]).not.toHaveMetadataKey(
        EventMetadataKey.GEMINI_CLI_USER_ADDED_CHARS,
      );
      expect(events[0]).not.toHaveMetadataKey(
        EventMetadataKey.GEMINI_CLI_USER_REMOVED_CHARS,
      );
    });

    it('does not log diff metadata if diffStat is not present', () => {
      const { logger } = setup();
      const completedToolCall = {
        request: { name: 'test', args: {}, prompt_id: 'prompt-123' },
        response: {
          resultDisplay: {},
        },
        status: 'success',
      } as SuccessfulToolCall;

      logger?.logToolCallEvent(new ToolCallEvent(completedToolCall));

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.TOOL_CALL);
      expect(events[0]).not.toHaveMetadataKey(
        EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
      );
    });
  });

  describe('flushIfNeeded', () => {
    it('should not flush if the interval has not passed', () => {
      const { logger } = setup();
      const flushSpy = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(logger!, 'flushToClearcut' as any)
        .mockResolvedValue({ nextRequestWaitMs: 0 });

      logger!.flushIfNeeded();
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should flush if the interval has passed', async () => {
      const { logger } = setup();
      const flushSpy = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(logger!, 'flushToClearcut' as any)
        .mockResolvedValue({ nextRequestWaitMs: 0 });

      // Advance time by more than the flush interval
      await vi.advanceTimersByTimeAsync(1000 * 60 * 2);

      logger!.flushIfNeeded();
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('logWebFetchFallbackAttemptEvent', () => {
    it('logs an event with the proper name and reason', () => {
      const { logger } = setup();
      const event = new WebFetchFallbackAttemptEvent('private_ip');

      logger?.logWebFetchFallbackAttemptEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.WEB_FETCH_FALLBACK_ATTEMPT);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_WEB_FETCH_FALLBACK_REASON,
        'private_ip',
      ]);
    });
  });

  describe('logHookCallEvent', () => {
    it('logs an event with proper fields', () => {
      const { logger } = setup();
      const hookName = '/path/to/my/script.sh';

      const event = new HookCallEvent(
        'before-tool',
        'command',
        hookName,
        {}, // input
        150, // duration
        true, // success
        {}, // output
        0, // exit code
      );

      logger?.logHookCallEvent(event);

      const events = getEvents(logger!);
      expect(events.length).toBe(1);
      expect(events[0]).toHaveEventName(EventNames.HOOK_CALL);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_HOOK_EVENT_NAME,
        'before-tool',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_HOOK_DURATION_MS,
        '150',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_HOOK_SUCCESS,
        'true',
      ]);
      expect(events[0]).toHaveMetadataValue([
        EventMetadataKey.GEMINI_CLI_HOOK_EXIT_CODE,
        '0',
      ]);
    });
  });
});
