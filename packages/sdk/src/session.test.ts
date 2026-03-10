/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCliSession } from './session.js';
import type { GeminiCliAgent } from './agent.js';
import type { GeminiCliAgentOptions } from './types.js';

// Mock @google/gemini-cli-core to avoid heavy filesystem/auth/telemetry setup
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Config: vi.fn().mockImplementation(() => {
      const mockSkillManager = {
        getSkills: vi.fn().mockReturnValue([]),
        addSkills: vi.fn(),
      };
      const mockRegistry = {
        getTool: vi.fn().mockReturnValue(null),
        registerTool: vi.fn(),
        unregisterTool: vi.fn(),
      };
      const mockMessageBus = {};
      const mockClient = {
        resumeChat: vi.fn().mockResolvedValue(undefined),
        getHistory: vi.fn().mockReturnValue([]),
        sendMessageStream: vi.fn().mockReturnValue((async function* () {})()),
        updateSystemInstruction: vi.fn(),
      };
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        refreshAuth: vi.fn().mockResolvedValue(undefined),
        getSkillManager: vi.fn().mockReturnValue(mockSkillManager),
        getToolRegistry: vi.fn().mockReturnValue(mockRegistry),
        getMessageBus: vi.fn().mockReturnValue(mockMessageBus),
        getGeminiClient: vi.fn().mockReturnValue(mockClient),
        getSessionId: vi.fn().mockReturnValue('mock-session-id'),
        getWorkingDir: vi.fn().mockReturnValue('/tmp'),
        setUserMemory: vi.fn(),
      };
    }),
    getAuthTypeFromEnv: vi.fn().mockReturnValue(null),
    AuthType: actual.AuthType,
    PREVIEW_GEMINI_MODEL_AUTO: actual.PREVIEW_GEMINI_MODEL_AUTO,
    GeminiEventType: actual.GeminiEventType,
    scheduleAgentTools: vi.fn().mockResolvedValue([]),
    loadSkillsFromDir: vi.fn().mockResolvedValue([]),
    ActivateSkillTool: class {
      static Name = 'activate_skill';
    },
    PolicyDecision: actual.PolicyDecision,
  };
});

const mockAgent = {} as unknown as GeminiCliAgent;

const baseOptions: GeminiCliAgentOptions = {
  instructions: 'You are a helpful assistant.',
};

describe('GeminiCliSession constructor', () => {
  it('accepts string instructions', () => {
    expect(
      () => new GeminiCliSession(baseOptions, 'session-1', mockAgent),
    ).not.toThrow();
  });

  it('accepts function instructions', () => {
    const options: GeminiCliAgentOptions = {
      instructions: async () => 'dynamic instructions',
    };
    expect(
      () => new GeminiCliSession(options, 'session-2', mockAgent),
    ).not.toThrow();
  });

  it('throws when instructions is an object (not string or function)', () => {
    const options = {
      instructions: { invalid: true },
    } as unknown as GeminiCliAgentOptions;
    expect(() => new GeminiCliSession(options, 'session-3', mockAgent)).toThrow(
      'Instructions must be a string or a function.',
    );
  });

  it('throws when instructions is a number', () => {
    const options = {
      instructions: 42,
    } as unknown as GeminiCliAgentOptions;
    expect(() => new GeminiCliSession(options, 'session-4', mockAgent)).toThrow(
      'Instructions must be a string or a function.',
    );
  });

  it('throws when instructions is an array', () => {
    const options = {
      instructions: ['step1', 'step2'],
    } as unknown as GeminiCliAgentOptions;
    expect(() => new GeminiCliSession(options, 'session-5', mockAgent)).toThrow(
      'Instructions must be a string or a function.',
    );
  });
});

describe('GeminiCliSession id getter', () => {
  it('returns the sessionId passed to the constructor', () => {
    const session = new GeminiCliSession(
      baseOptions,
      'my-session-id',
      mockAgent,
    );
    expect(session.id).toBe('my-session-id');
  });

  it('returns different ids for different sessions', () => {
    const s1 = new GeminiCliSession(baseOptions, 'session-a', mockAgent);
    const s2 = new GeminiCliSession(baseOptions, 'session-b', mockAgent);
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('GeminiCliSession initialize()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes successfully with string instructions', async () => {
    const session = new GeminiCliSession(
      baseOptions,
      'session-init-1',
      mockAgent,
    );
    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('is idempotent — calling initialize() twice does not throw', async () => {
    const session = new GeminiCliSession(
      baseOptions,
      'session-init-2',
      mockAgent,
    );
    await session.initialize();
    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('initializes with empty tools array', async () => {
    const options: GeminiCliAgentOptions = {
      ...baseOptions,
      tools: [],
    };
    const session = new GeminiCliSession(options, 'session-init-3', mockAgent);
    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('initializes with empty skills array', async () => {
    const options: GeminiCliAgentOptions = {
      ...baseOptions,
      skills: [],
    };
    const session = new GeminiCliSession(options, 'session-init-4', mockAgent);
    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('initializes with custom model', async () => {
    const options: GeminiCliAgentOptions = {
      ...baseOptions,
      model: 'gemini-2.0-flash',
    };
    const session = new GeminiCliSession(options, 'session-init-5', mockAgent);
    await expect(session.initialize()).resolves.toBeUndefined();
  });

  it('initializes with custom cwd', async () => {
    const options: GeminiCliAgentOptions = {
      ...baseOptions,
      cwd: '/custom/working/dir',
    };
    const session = new GeminiCliSession(options, 'session-init-6', mockAgent);
    await expect(session.initialize()).resolves.toBeUndefined();
  });
});

describe('GeminiCliSession sendStream()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-initializes if not yet initialized', async () => {
    const session = new GeminiCliSession(
      baseOptions,
      'session-stream-1',
      mockAgent,
    );
    const events = [];
    for await (const event of session.sendStream('Hello')) {
      events.push(event);
    }
    // Empty stream from mock — no events, but no throw either
    expect(events).toHaveLength(0);
  });

  it('completes cleanly when model returns no tool calls', async () => {
    const session = new GeminiCliSession(
      baseOptions,
      'session-stream-2',
      mockAgent,
    );
    await session.initialize();
    const events = [];
    for await (const event of session.sendStream('Hello')) {
      events.push(event);
    }
    expect(events).toHaveLength(0);
  });

  it('accepts an AbortSignal without throwing', async () => {
    const session = new GeminiCliSession(
      baseOptions,
      'session-stream-3',
      mockAgent,
    );
    const controller = new AbortController();
    const events = [];
    for await (const event of session.sendStream('Hello', controller.signal)) {
      events.push(event);
    }
    expect(events).toHaveLength(0);
  });
});
