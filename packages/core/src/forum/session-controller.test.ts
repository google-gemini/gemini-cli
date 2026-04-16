/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { LocalAgentDefinition } from '../agents/types.js';
import type {
  ForumMemberRoundResult,
  ForumPreset,
  ForumSessionSnapshot,
  ForumTranscriptEntry,
} from './types.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const mockSessions = new Map<
  string,
  {
    runRound: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    seedMainConversationHistory: ReturnType<typeof vi.fn>;
  }
>();

vi.mock('./member-session.js', () => ({
  PersistentForumMemberSession: {
    create: vi.fn(async (memberId: string) => {
      const session = mockSessions.get(memberId);
      if (!session) {
        throw new Error(`Missing mock session for ${memberId}`);
      }
      return session;
    }),
  },
}));

import { ForumSessionController } from './session-controller.js';

function makeBaseAgentDefinition(name: string): LocalAgentDefinition {
  return {
    kind: 'local',
    name,
    description: `Test agent ${name}`,
    inputConfig: {
      inputSchema: {
        type: 'object',
      },
    },
    promptConfig: {
      systemPrompt: 'Test system prompt',
      query: '${query}',
    },
    modelConfig: {
      model: 'inherit',
      generateContentConfig: {},
    },
    runConfig: {
      maxTimeMinutes: 1,
      maxTurns: 4,
    },
  };
}

function makeConfig(
  definition: LocalAgentDefinition,
  mainHistory: readonly Content[] = [],
): Config {
  return {
    getAgentRegistry: () =>
      ({
        getDefinitionForExplicitUse: () => definition,
      }) as const,
    getGeminiClient: () =>
      ({
        isInitialized: () => mainHistory.length > 0,
        getChat: () => ({
          getHistory: () => mainHistory,
        }),
      }) as never,
    getModel: () => 'gemini-3-flash-preview',
    getSessionId: () => 'test-session',
    getToolRegistry: () => ({}) as never,
    getPromptRegistry: () => ({}) as never,
    getResourceRegistry: () => ({}) as never,
    messageBus: {} as never,
    sandboxManager: {} as never,
    modelConfigService: {
      registerRuntimeModelConfig: vi.fn(),
      registerRuntimeModelOverride: vi.fn(),
    },
  } as unknown as Config;
}

describe('ForumSessionController', () => {
  beforeEach(() => {
    mockSessions.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockSessions.clear();
  });

  it('routes new public posts into member mailboxes and resumes discussion asynchronously', async () => {
    const architectRound1 = createDeferred<ForumMemberRoundResult>();
    const architectRound2 = createDeferred<ForumMemberRoundResult>();
    const skepticRound1 = createDeferred<ForumMemberRoundResult>();
    const skepticRound2 = createDeferred<ForumMemberRoundResult>();

    const architectRun = vi
      .fn()
      .mockImplementationOnce((prompt: string) => {
        expect(prompt).toContain('[user task]\ninvestigate loops');
        return architectRound1.promise;
      })
      .mockImplementationOnce((prompt: string) => {
        expect(prompt).toContain('[Skeptic]\nSkeptic post 1');
        expect(prompt).not.toContain('[Architect]\nArchitect post 1');
        return architectRound2.promise;
      });

    const skepticRun = vi
      .fn()
      .mockImplementationOnce((prompt: string) => {
        expect(prompt).toContain('[user task]\ninvestigate loops');
        return skepticRound1.promise;
      })
      .mockImplementationOnce((prompt: string) => {
        expect(prompt).toContain('[Architect]\nArchitect post 1');
        expect(prompt).not.toContain('[Skeptic]\nSkeptic post 1');
        return skepticRound2.promise;
      });

    const synthesizerRun = vi.fn().mockResolvedValue({
      memberId: 'synthesizer',
      label: 'Synthesizer',
      post: {
        message: 'Final answer',
        readyToConclude: true,
      },
    } satisfies ForumMemberRoundResult);

    mockSessions.set('architect', {
      runRound: architectRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('skeptic', {
      runRound: skepticRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('synthesizer', {
      runRound: synthesizerRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });

    const entries: ForumTranscriptEntry[] = [];
    const snapshots: ForumSessionSnapshot[] = [];
    const preset: ForumPreset = {
      name: 'design-forum',
      maxRounds: 2,
      minDiscussionRounds: 2,
      members: [
        {
          memberId: 'architect',
          agentName: 'generalist',
          label: 'Architect',
        },
        {
          memberId: 'skeptic',
          agentName: 'generalist',
          label: 'Skeptic',
        },
        {
          memberId: 'synthesizer',
          agentName: 'generalist',
          label: 'Synthesizer',
          role: 'synthesizer',
        },
      ],
    };

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist')),
      preset,
      {
        onSnapshot: (snapshot) => snapshots.push(snapshot),
        onTranscriptEntry: (entry) => entries.push(entry),
      },
    );

    await controller.startTask('investigate loops');

    await vi.waitFor(() => {
      expect(architectRun).toHaveBeenCalledTimes(1);
      expect(skepticRun).toHaveBeenCalledTimes(1);
    });

    architectRound1.resolve({
      memberId: 'architect',
      label: 'Architect',
      post: {
        message: 'Architect post 1',
        readyToConclude: false,
      },
    });

    await vi.waitFor(() => {
      expect(
        entries.some(
          (entry) =>
            entry.kind === 'agent' &&
            entry.memberId === 'architect' &&
            entry.text === 'Architect post 1',
        ),
      ).toBe(true);
    });

    skepticRound1.resolve({
      memberId: 'skeptic',
      label: 'Skeptic',
      post: {
        message: 'Skeptic post 1',
        readyToConclude: false,
      },
    });

    await vi.waitFor(() => {
      expect(architectRun).toHaveBeenCalledTimes(2);
      expect(skepticRun).toHaveBeenCalledTimes(2);
    });

    architectRound2.resolve({
      memberId: 'architect',
      label: 'Architect',
      post: {
        message: 'Architect post 2',
        readyToConclude: true,
      },
    });
    skepticRound2.resolve({
      memberId: 'skeptic',
      label: 'Skeptic',
      post: {
        message: 'Skeptic post 2',
        readyToConclude: true,
      },
    });

    await vi.waitFor(() => {
      expect(
        entries.some(
          (entry) => entry.kind === 'final' && entry.text === 'Final answer',
        ),
      ).toBe(true);
    });

    expect(
      snapshots.some((snapshot) =>
        snapshot.members.some(
          (member) =>
            member.memberId === 'architect' && member.status === 'waiting',
        ),
      ),
    ).toBe(true);
  });

  it('triggers synthesis as soon as everyone is ready after the minimum discussion depth', async () => {
    const architectRun = vi.fn().mockResolvedValue({
      memberId: 'architect',
      label: 'Architect',
      post: {
        message: 'Architect ready',
        readyToConclude: true,
      },
    } satisfies ForumMemberRoundResult);

    const skepticRun = vi.fn().mockResolvedValue({
      memberId: 'skeptic',
      label: 'Skeptic',
      post: {
        message: 'Skeptic ready',
        readyToConclude: true,
      },
    } satisfies ForumMemberRoundResult);

    const synthesizerRun = vi
      .fn()
      .mockImplementation(async (prompt: string) => {
        expect(prompt).toContain('[Architect]\nArchitect ready');
        expect(prompt).toContain('[Skeptic]\nSkeptic ready');
        return {
          memberId: 'synthesizer',
          label: 'Synthesizer',
          post: {
            message: 'Final synthesis',
            readyToConclude: true,
          },
        } satisfies ForumMemberRoundResult;
      });

    mockSessions.set('architect', {
      runRound: architectRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('skeptic', {
      runRound: skepticRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('synthesizer', {
      runRound: synthesizerRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });

    const entries: ForumTranscriptEntry[] = [];
    const preset: ForumPreset = {
      name: 'design-forum',
      maxRounds: 3,
      minDiscussionRounds: 1,
      members: [
        {
          memberId: 'architect',
          agentName: 'generalist',
          label: 'Architect',
        },
        {
          memberId: 'skeptic',
          agentName: 'generalist',
          label: 'Skeptic',
        },
        {
          memberId: 'synthesizer',
          agentName: 'generalist',
          label: 'Synthesizer',
          role: 'synthesizer',
        },
      ],
    };

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist')),
      preset,
      {
        onTranscriptEntry: (entry) => entries.push(entry),
      },
    );

    await controller.startTask('summarize the best design');

    await vi.waitFor(() => {
      expect(
        entries.some(
          (entry) => entry.kind === 'final' && entry.text === 'Final synthesis',
        ),
      ).toBe(true);
    });

    expect(architectRun).toHaveBeenCalledTimes(1);
    expect(skepticRun).toHaveBeenCalledTimes(1);
    expect(synthesizerRun).toHaveBeenCalledTimes(1);
  });

  it('seeds forum members with the current main chat history before the first discussion post', async () => {
    const mainHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'We were discussing loop detection.' }],
      },
      {
        role: 'model',
        parts: [
          { text: 'The current design uses repeated tool-call heuristics.' },
        ],
      },
    ];

    const architectSeed = vi.fn();
    const skepticSeed = vi.fn();
    const synthesizerSeed = vi.fn();

    mockSessions.set('architect', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'architect',
        label: 'Architect',
        post: {
          message: 'Architect post',
          readyToConclude: false,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: architectSeed,
    });
    mockSessions.set('skeptic', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'skeptic',
        label: 'Skeptic',
        post: {
          message: 'Skeptic post',
          readyToConclude: false,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: skepticSeed,
    });
    mockSessions.set('synthesizer', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'synthesizer',
        label: 'Synthesizer',
        post: {
          message: 'Final synthesis',
          readyToConclude: true,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: synthesizerSeed,
    });

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist'), mainHistory),
      {
        name: 'design-forum',
        maxRounds: 1,
        minDiscussionRounds: 1,
        members: [
          {
            memberId: 'architect',
            agentName: 'generalist',
            label: 'Architect',
          },
          {
            memberId: 'skeptic',
            agentName: 'generalist',
            label: 'Skeptic',
          },
          {
            memberId: 'synthesizer',
            agentName: 'generalist',
            label: 'Synthesizer',
            role: 'synthesizer',
          },
        ],
      },
    );

    await controller.startTask('continue the discussion');

    expect(architectSeed).toHaveBeenCalledWith(mainHistory);
    expect(skepticSeed).toHaveBeenCalledWith(mainHistory);
    expect(synthesizerSeed).toHaveBeenCalledWith(mainHistory);
  });

  it('does not seed main chat history when the forum starts in incognito mode', async () => {
    const mainHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'Prior main conversation context.' }],
      },
    ];

    const architectSeed = vi.fn();
    const skepticSeed = vi.fn();
    const synthesizerSeed = vi.fn();
    const entries: ForumTranscriptEntry[] = [];

    mockSessions.set('architect', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'architect',
        label: 'Architect',
        post: {
          message: 'Architect post',
          readyToConclude: false,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: architectSeed,
    });
    mockSessions.set('skeptic', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'skeptic',
        label: 'Skeptic',
        post: {
          message: 'Skeptic post',
          readyToConclude: false,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: skepticSeed,
    });
    mockSessions.set('synthesizer', {
      runRound: vi.fn().mockResolvedValue({
        memberId: 'synthesizer',
        label: 'Synthesizer',
        post: {
          message: 'Final synthesis',
          readyToConclude: true,
        },
      } satisfies ForumMemberRoundResult),
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: synthesizerSeed,
    });

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist'), mainHistory),
      {
        name: 'design-forum',
        maxRounds: 1,
        minDiscussionRounds: 1,
        members: [
          {
            memberId: 'architect',
            agentName: 'generalist',
            label: 'Architect',
          },
          {
            memberId: 'skeptic',
            agentName: 'generalist',
            label: 'Skeptic',
          },
          {
            memberId: 'synthesizer',
            agentName: 'generalist',
            label: 'Synthesizer',
            role: 'synthesizer',
          },
        ],
      },
      {
        onTranscriptEntry: (entry) => entries.push(entry),
      },
      {
        includeMainConversationContext: false,
      },
    );

    await controller.startTask('continue the discussion');

    expect(architectSeed).not.toHaveBeenCalled();
    expect(skepticSeed).not.toHaveBeenCalled();
    expect(synthesizerSeed).not.toHaveBeenCalled();
    expect(
      entries.some(
        (entry) =>
          entry.kind === 'system' &&
          entry.text ===
            'Forum started in incognito mode without main conversation context.',
      ),
    ).toBe(true);
  });

  it('keeps a member active after a transient error and re-runs them next round', async () => {
    let flakyCalls = 0;
    const flakyRun = vi.fn().mockImplementation(() => {
      flakyCalls += 1;
      if (flakyCalls === 1) {
        return Promise.resolve({
          memberId: 'flaky',
          label: 'Flaky',
          error: 'network blip',
        } satisfies ForumMemberRoundResult);
      }
      return Promise.resolve({
        memberId: 'flaky',
        label: 'Flaky',
        post: { message: 'recovered post', readyToConclude: true },
      } satisfies ForumMemberRoundResult);
    });

    const steadyRun = vi.fn().mockResolvedValue({
      memberId: 'steady',
      label: 'Steady',
      post: { message: 'steady post', readyToConclude: true },
    } satisfies ForumMemberRoundResult);

    const synthesizerRun = vi.fn().mockResolvedValue({
      memberId: 'synthesizer',
      label: 'Synthesizer',
      post: { message: 'final', readyToConclude: true },
    } satisfies ForumMemberRoundResult);

    mockSessions.set('flaky', {
      runRound: flakyRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('steady', {
      runRound: steadyRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('synthesizer', {
      runRound: synthesizerRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });

    const entries: ForumTranscriptEntry[] = [];
    const preset: ForumPreset = {
      name: 'recovery-forum',
      maxRounds: 3,
      minDiscussionRounds: 2,
      members: [
        { memberId: 'flaky', agentName: 'generalist', label: 'Flaky' },
        { memberId: 'steady', agentName: 'generalist', label: 'Steady' },
        {
          memberId: 'synthesizer',
          agentName: 'generalist',
          label: 'Synthesizer',
          role: 'synthesizer',
        },
      ],
    };

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist')),
      preset,
      { onTranscriptEntry: (entry) => entries.push(entry) },
    );

    await controller.startTask('recovery test');

    await vi.waitFor(() => {
      expect(
        entries.some(
          (entry) =>
            entry.kind === 'agent' &&
            entry.memberId === 'flaky' &&
            entry.text === 'recovered post',
        ),
      ).toBe(true);
    });

    expect(flakyRun.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      entries.some(
        (entry) =>
          entry.kind === 'system' &&
          entry.text.startsWith('Flaky failed (attempt 1/3)'),
      ),
    ).toBe(true);
    expect(
      entries.some(
        (entry) => entry.kind === 'system' && /retired after/.test(entry.text),
      ),
    ).toBe(false);
  });

  it('retires a member after the maximum consecutive errors', async () => {
    const failingRun = vi.fn().mockResolvedValue({
      memberId: 'always_broken',
      label: 'Broken',
      error: 'persistent failure',
    } satisfies ForumMemberRoundResult);

    const steadyRun = vi.fn().mockImplementation(() =>
      Promise.resolve({
        memberId: 'steady',
        label: 'Steady',
        post: { message: 'steady post', readyToConclude: true },
      } satisfies ForumMemberRoundResult),
    );

    const synthesizerRun = vi.fn().mockResolvedValue({
      memberId: 'synthesizer',
      label: 'Synthesizer',
      post: { message: 'final', readyToConclude: true },
    } satisfies ForumMemberRoundResult);

    mockSessions.set('always_broken', {
      runRound: failingRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('steady', {
      runRound: steadyRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });
    mockSessions.set('synthesizer', {
      runRound: synthesizerRun,
      dispose: vi.fn().mockResolvedValue(undefined),
      seedMainConversationHistory: vi.fn(),
    });

    const entries: ForumTranscriptEntry[] = [];
    const preset: ForumPreset = {
      name: 'retire-forum',
      maxRounds: 5,
      minDiscussionRounds: 2,
      members: [
        {
          memberId: 'always_broken',
          agentName: 'generalist',
          label: 'Broken',
        },
        { memberId: 'steady', agentName: 'generalist', label: 'Steady' },
        {
          memberId: 'synthesizer',
          agentName: 'generalist',
          label: 'Synthesizer',
          role: 'synthesizer',
        },
      ],
    };

    const controller = await ForumSessionController.create(
      makeConfig(makeBaseAgentDefinition('generalist')),
      preset,
      { onTranscriptEntry: (entry) => entries.push(entry) },
    );

    await controller.startTask('retire test');

    await vi.waitFor(
      () => {
        expect(failingRun).toHaveBeenCalledTimes(3);
      },
      { timeout: 2000 },
    );

    expect(
      entries.some(
        (entry) =>
          entry.kind === 'system' &&
          entry.text.startsWith('Broken retired after 3 consecutive errors'),
      ),
    ).toBe(true);

    // After retirement, steady can still post and the forum continues.
    expect(steadyRun.mock.calls.length).toBeGreaterThan(0);
  });
});
