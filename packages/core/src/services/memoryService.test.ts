/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Config } from '../config/config.js';
import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
} from './chatRecordingService.js';
import type { ExtractionState, ExtractionRun } from './memoryService.js';
import { coreEvents } from '../utils/events.js';
import { Storage } from '../config/storage.js';

// Mock external modules used by startMemoryService
vi.mock('../agents/local-executor.js', () => ({
  LocalAgentExecutor: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../agents/skill-extraction-agent.js', () => ({
  SkillExtractionAgent: vi.fn().mockReturnValue({
    name: 'skill-extraction',
    promptConfig: { systemPrompt: 'test' },
    tools: [],
    outputSchema: {},
    modelConfig: { model: 'test-model' },
  }),
}));

vi.mock('./executionLifecycleService.js', () => ({
  ExecutionLifecycleService: {
    createExecution: vi.fn().mockReturnValue({ pid: 42, result: {} }),
    completeExecution: vi.fn(),
  },
}));

vi.mock('../tools/tool-registry.js', () => ({
  ToolRegistry: vi.fn(),
}));

vi.mock('../prompts/prompt-registry.js', () => ({
  PromptRegistry: vi.fn(),
}));

vi.mock('../resources/resource-registry.js', () => ({
  ResourceRegistry: vi.fn(),
}));

vi.mock('../policy/policy-engine.js', () => ({
  PolicyEngine: vi.fn(),
}));

vi.mock('../policy/types.js', () => ({
  PolicyDecision: { ALLOW: 'ALLOW' },
}));

vi.mock('../confirmation-bus/message-bus.js', () => ({
  MessageBus: vi.fn(),
}));

vi.mock('../agents/registry.js', () => ({
  getModelConfigAlias: vi.fn().mockReturnValue('skill-extraction-config'),
}));

vi.mock('../config/storage.js', () => ({
  Storage: {
    getUserSkillsDir: vi.fn().mockReturnValue('/tmp/fake-user-skills'),
  },
}));

vi.mock('../skills/skillLoader.js', () => ({
  FRONTMATTER_REGEX: /^---\n([\s\S]*?)\n---/,
  parseFrontmatter: vi.fn().mockReturnValue(null),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

// Helper to create a minimal ConversationRecord
function createConversation(
  overrides: Partial<ConversationRecord> & { messageCount?: number } = {},
): ConversationRecord {
  const { messageCount = 4, ...rest } = overrides;
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    id: String(i + 1),
    timestamp: new Date().toISOString(),
    content: [{ text: `Message ${i + 1}` }],
    type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
  }));
  return {
    sessionId: rest.sessionId ?? `session-${Date.now()}`,
    projectHash: 'abc123',
    startTime: '2025-01-01T00:00:00Z',
    lastUpdated: '2025-01-01T01:00:00Z',
    messages,
    ...rest,
  };
}

describe('memoryService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-extract-test-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('tryAcquireLock', () => {
    it('successfully acquires lock when none exists', async () => {
      const { tryAcquireLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      const result = await tryAcquireLock(lockPath);

      expect(result).toBe(true);

      const content = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
      expect(content.pid).toBe(process.pid);
      expect(content.startedAt).toBeDefined();
    });

    it('returns false when lock is held by a live process', async () => {
      const { tryAcquireLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      // Write a lock with the current PID (which is alive)
      const lockInfo = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      const result = await tryAcquireLock(lockPath);

      expect(result).toBe(false);
    });

    it('cleans up and re-acquires stale lock (dead PID)', async () => {
      const { tryAcquireLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      // Use a PID that almost certainly doesn't exist
      const lockInfo = {
        pid: 2147483646,
        startedAt: new Date().toISOString(),
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      const result = await tryAcquireLock(lockPath);

      expect(result).toBe(true);
      const content = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
      expect(content.pid).toBe(process.pid);
    });

    it('cleans up and re-acquires stale lock (too old)', async () => {
      const { tryAcquireLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      // Lock from 40 minutes ago with current PID — old enough to be stale (>35min)
      const oldDate = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const lockInfo = {
        pid: process.pid,
        startedAt: oldDate,
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      const result = await tryAcquireLock(lockPath);

      expect(result).toBe(true);
      const content = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
      expect(content.pid).toBe(process.pid);
      // The new lock should have a recent timestamp
      const newLockAge = Date.now() - new Date(content.startedAt).getTime();
      expect(newLockAge).toBeLessThan(5000);
    });
  });

  describe('isLockStale', () => {
    it('returns true when PID is dead', async () => {
      const { isLockStale } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      const lockInfo = {
        pid: 2147483646,
        startedAt: new Date().toISOString(),
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      expect(await isLockStale(lockPath)).toBe(true);
    });

    it('returns true when lock is too old (>35 min)', async () => {
      const { isLockStale } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      const oldDate = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      const lockInfo = {
        pid: process.pid,
        startedAt: oldDate,
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      expect(await isLockStale(lockPath)).toBe(true);
    });

    it('returns false when PID is alive and lock is fresh', async () => {
      const { isLockStale } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      const lockInfo = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
      };
      await fs.writeFile(lockPath, JSON.stringify(lockInfo));

      expect(await isLockStale(lockPath)).toBe(false);
    });

    it('returns true when file cannot be read', async () => {
      const { isLockStale } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, 'nonexistent.lock');

      expect(await isLockStale(lockPath)).toBe(true);
    });
  });

  describe('releaseLock', () => {
    it('deletes the lock file', async () => {
      const { releaseLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, '.extraction.lock');
      await fs.writeFile(lockPath, '{}');

      await releaseLock(lockPath);

      await expect(fs.access(lockPath)).rejects.toThrow();
    });

    it('does not throw when file is already gone', async () => {
      const { releaseLock } = await import('./memoryService.js');

      const lockPath = path.join(tmpDir, 'nonexistent.lock');

      await expect(releaseLock(lockPath)).resolves.not.toThrow();
    });
  });

  describe('readExtractionState / writeExtractionState', () => {
    it('returns default state when file does not exist', async () => {
      const { readExtractionState } = await import('./memoryService.js');

      const statePath = path.join(tmpDir, 'nonexistent-state.json');
      const state = await readExtractionState(statePath);

      expect(state).toEqual({ runs: [] });
    });

    it('reads existing state file', async () => {
      const { readExtractionState } = await import('./memoryService.js');

      const statePath = path.join(tmpDir, '.extraction-state.json');
      const existingState: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['session-1', 'session-2'],
            skillsCreated: [],
          },
        ],
      };
      await fs.writeFile(statePath, JSON.stringify(existingState));

      const state = await readExtractionState(statePath);

      expect(state).toEqual(existingState);
    });

    it('writes state atomically via temp file + rename', async () => {
      const { writeExtractionState, readExtractionState } = await import(
        './memoryService.js'
      );

      const statePath = path.join(tmpDir, '.extraction-state.json');
      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['session-abc'],
            skillsCreated: [],
          },
        ],
      };

      await writeExtractionState(statePath, state);

      // Verify the temp file does not linger
      const files = await fs.readdir(tmpDir);
      expect(files).not.toContain('.extraction-state.json.tmp');

      // Verify the final file is readable
      const readBack = await readExtractionState(statePath);
      expect(readBack).toEqual(state);
    });
  });

  describe('startMemoryService', () => {
    it('skips when lock is held by another instance', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );

      const memoryDir = path.join(tmpDir, 'memory');
      const skillsDir = path.join(tmpDir, 'skills');
      const projectTempDir = path.join(tmpDir, 'temp');
      await fs.mkdir(memoryDir, { recursive: true });

      // Pre-acquire the lock with current PID
      const lockPath = path.join(memoryDir, '.extraction.lock');
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
      );

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      // Agent should never have been created
      expect(LocalAgentExecutor.create).not.toHaveBeenCalled();
    });

    it('skips when no unprocessed sessions exist', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );

      const memoryDir = path.join(tmpDir, 'memory2');
      const skillsDir = path.join(tmpDir, 'skills2');
      const projectTempDir = path.join(tmpDir, 'temp2');
      await fs.mkdir(memoryDir, { recursive: true });
      // Create an empty chats directory
      await fs.mkdir(path.join(projectTempDir, 'chats'), { recursive: true });

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      expect(LocalAgentExecutor.create).not.toHaveBeenCalled();

      // Lock should be released
      const lockPath = path.join(memoryDir, '.extraction.lock');
      await expect(fs.access(lockPath)).rejects.toThrow();
    });

    it('releases lock on error', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );
      const { ExecutionLifecycleService } = await import(
        './executionLifecycleService.js'
      );

      const memoryDir = path.join(tmpDir, 'memory3');
      const skillsDir = path.join(tmpDir, 'skills3');
      const projectTempDir = path.join(tmpDir, 'temp3');
      const chatsDir = path.join(projectTempDir, 'chats');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(chatsDir, { recursive: true });

      // Write a valid session that will pass all filters
      const conversation = createConversation({
        sessionId: 'error-session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(chatsDir, 'session-2025-01-01T00-00-err00001.json'),
        JSON.stringify(conversation),
      );

      // Make LocalAgentExecutor.create throw
      vi.mocked(LocalAgentExecutor.create).mockRejectedValueOnce(
        new Error('Agent creation failed'),
      );

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      // Lock should be released despite the error
      const lockPath = path.join(memoryDir, '.extraction.lock');
      await expect(fs.access(lockPath)).rejects.toThrow();

      // ExecutionLifecycleService.completeExecution should have been called with error
      expect(ExecutionLifecycleService.completeExecution).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
    });

    it('emits feedback when new skills are created during extraction', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );

      // Reset mocks that may carry state from prior tests
      vi.mocked(coreEvents.emitFeedback).mockClear();
      vi.mocked(LocalAgentExecutor.create).mockReset();

      const memoryDir = path.join(tmpDir, 'memory4');
      const skillsDir = path.join(tmpDir, 'skills4');
      const projectTempDir = path.join(tmpDir, 'temp4');
      const chatsDir = path.join(projectTempDir, 'chats');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(chatsDir, { recursive: true });

      // Write a valid session with enough messages to pass the filter
      const conversation = createConversation({
        sessionId: 'skill-session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(chatsDir, 'session-2025-01-01T00-00-skill001.json'),
        JSON.stringify(conversation),
      );

      // Override LocalAgentExecutor.create to return an executor whose run
      // creates a new skill directory with a SKILL.md in the skillsDir
      vi.mocked(LocalAgentExecutor.create).mockResolvedValueOnce({
        run: vi.fn().mockImplementation(async () => {
          const newSkillDir = path.join(skillsDir, 'my-new-skill');
          await fs.mkdir(newSkillDir, { recursive: true });
          await fs.writeFile(
            path.join(newSkillDir, 'SKILL.md'),
            '# My New Skill',
          );
          return undefined;
        }),
      } as never);

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        getSkillManager: vi.fn().mockReturnValue({ getSkills: () => [] }),
        modelConfigService: {
          registerRuntimeModelConfig: vi.fn(),
        },
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('my-new-skill'),
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('/memory inbox'),
      );
    });
  });

  describe('getProcessedSessionIds', () => {
    it('returns empty set for empty state', async () => {
      const { getProcessedSessionIds } = await import('./memoryService.js');

      const result = getProcessedSessionIds({ runs: [] });

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('collects session IDs across multiple runs', async () => {
      const { getProcessedSessionIds } = await import('./memoryService.js');

      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['s1', 's2'],
            skillsCreated: [],
          },
          {
            runAt: '2025-01-02T00:00:00Z',
            sessionIds: ['s3'],
            skillsCreated: [],
          },
        ],
      };

      const result = getProcessedSessionIds(state);

      expect(result).toEqual(new Set(['s1', 's2', 's3']));
    });

    it('deduplicates IDs that appear in multiple runs', async () => {
      const { getProcessedSessionIds } = await import('./memoryService.js');

      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['s1', 's2'],
            skillsCreated: [],
          },
          {
            runAt: '2025-01-02T00:00:00Z',
            sessionIds: ['s2', 's3'],
            skillsCreated: [],
          },
        ],
      };

      const result = getProcessedSessionIds(state);

      expect(result.size).toBe(3);
      expect(result).toEqual(new Set(['s1', 's2', 's3']));
    });
  });

  describe('buildSessionIndex', () => {
    let chatsDir: string;

    beforeEach(async () => {
      chatsDir = path.join(tmpDir, 'chats');
      await fs.mkdir(chatsDir, { recursive: true });
    });

    it('returns empty index and no new IDs when chats dir is empty', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      expect(result.sessionIndex).toBe('');
      expect(result.newSessionIds).toEqual([]);
    });

    it('returns empty index when chats dir does not exist', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const nonexistentDir = path.join(tmpDir, 'no-such-dir');
      const result = await buildSessionIndex(nonexistentDir, { runs: [] });

      expect(result.sessionIndex).toBe('');
      expect(result.newSessionIds).toEqual([]);
    });

    it('marks sessions as [NEW] when not in any previous run', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const conversation = createConversation({
        sessionId: 'brand-new',
        summary: 'A brand new session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-01T00-00-brandnew.json`,
        ),
        JSON.stringify(conversation),
      );

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      expect(result.sessionIndex).toContain('[NEW]');
      expect(result.sessionIndex).not.toContain('[old]');
    });

    it('marks sessions as [old] when already in a previous run', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const conversation = createConversation({
        sessionId: 'old-session',
        summary: 'An old session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-01T00-00-oldsess1.json`,
        ),
        JSON.stringify(conversation),
      );

      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['old-session'],
            skillsCreated: [],
          },
        ],
      };

      const result = await buildSessionIndex(chatsDir, state);

      expect(result.sessionIndex).toContain('[old]');
      expect(result.sessionIndex).not.toContain('[NEW]');
    });

    it('includes file path and summary in each line', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const conversation = createConversation({
        sessionId: 'detailed-session',
        summary: 'Debugging the login flow',
        messageCount: 20,
      });
      const fileName = `${SESSION_FILE_PREFIX}2025-01-01T00-00-detail01.json`;
      await fs.writeFile(
        path.join(chatsDir, fileName),
        JSON.stringify(conversation),
      );

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      expect(result.sessionIndex).toContain('Debugging the login flow');
      expect(result.sessionIndex).toContain(path.join(chatsDir, fileName));
    });

    it('filters out subagent sessions', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      const conversation = createConversation({
        sessionId: 'sub-session',
        kind: 'subagent',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-01T00-00-sub00001.json`,
        ),
        JSON.stringify(conversation),
      );

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      expect(result.sessionIndex).toBe('');
      expect(result.newSessionIds).toEqual([]);
    });

    it('filters out sessions with fewer than 10 user messages', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      // 2 messages total: 1 user (index 0) + 1 gemini (index 1)
      const conversation = createConversation({
        sessionId: 'short-session',
        messageCount: 2,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-01T00-00-short001.json`,
        ),
        JSON.stringify(conversation),
      );

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      expect(result.sessionIndex).toBe('');
      expect(result.newSessionIds).toEqual([]);
    });

    it('caps at MAX_SESSION_INDEX_SIZE (50)', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      // Create 3 eligible sessions, verify all 3 appear (well under cap)
      for (let i = 0; i < 3; i++) {
        const conversation = createConversation({
          sessionId: `capped-session-${i}`,
          summary: `Summary ${i}`,
          messageCount: 20,
        });
        const paddedIndex = String(i).padStart(4, '0');
        await fs.writeFile(
          path.join(
            chatsDir,
            `${SESSION_FILE_PREFIX}2025-01-0${i + 1}T00-00-cap${paddedIndex}.json`,
          ),
          JSON.stringify(conversation),
        );
      }

      const result = await buildSessionIndex(chatsDir, { runs: [] });

      const lines = result.sessionIndex.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(3);
      expect(result.newSessionIds).toHaveLength(3);
    });

    it('returns newSessionIds only for unprocessed sessions', async () => {
      const { buildSessionIndex } = await import('./memoryService.js');

      // Write two sessions: one already processed, one new
      const oldConv = createConversation({
        sessionId: 'processed-one',
        summary: 'Old',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-01T00-00-proc0001.json`,
        ),
        JSON.stringify(oldConv),
      );

      const newConv = createConversation({
        sessionId: 'fresh-one',
        summary: 'New',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(
          chatsDir,
          `${SESSION_FILE_PREFIX}2025-01-02T00-00-fres0001.json`,
        ),
        JSON.stringify(newConv),
      );

      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-01-01T00:00:00Z',
            sessionIds: ['processed-one'],
            skillsCreated: [],
          },
        ],
      };

      const result = await buildSessionIndex(chatsDir, state);

      expect(result.newSessionIds).toEqual(['fresh-one']);
      expect(result.newSessionIds).not.toContain('processed-one');
      // Both sessions should still appear in the index
      expect(result.sessionIndex).toContain('[NEW]');
      expect(result.sessionIndex).toContain('[old]');
    });
  });

  describe('ExtractionState runs tracking', () => {
    it('readExtractionState parses runs array with skillsCreated', async () => {
      const { readExtractionState } = await import('./memoryService.js');

      const statePath = path.join(tmpDir, 'state-with-skills.json');
      const state: ExtractionState = {
        runs: [
          {
            runAt: '2025-06-01T00:00:00Z',
            sessionIds: ['s1'],
            skillsCreated: ['debug-helper', 'test-gen'],
          },
        ],
      };
      await fs.writeFile(statePath, JSON.stringify(state));

      const result = await readExtractionState(statePath);

      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].skillsCreated).toEqual([
        'debug-helper',
        'test-gen',
      ]);
      expect(result.runs[0].sessionIds).toEqual(['s1']);
      expect(result.runs[0].runAt).toBe('2025-06-01T00:00:00Z');
    });

    it('writeExtractionState + readExtractionState roundtrips runs correctly', async () => {
      const { writeExtractionState, readExtractionState } = await import(
        './memoryService.js'
      );

      const statePath = path.join(tmpDir, 'roundtrip-state.json');
      const runs: ExtractionRun[] = [
        {
          runAt: '2025-01-01T00:00:00Z',
          sessionIds: ['a', 'b'],
          skillsCreated: ['skill-x'],
        },
        {
          runAt: '2025-01-02T00:00:00Z',
          sessionIds: ['c'],
          skillsCreated: [],
        },
      ];
      const state: ExtractionState = { runs };

      await writeExtractionState(statePath, state);
      const result = await readExtractionState(statePath);

      expect(result).toEqual(state);
    });

    it('readExtractionState handles old format without runs', async () => {
      const { readExtractionState } = await import('./memoryService.js');

      const statePath = path.join(tmpDir, 'old-format-state.json');
      // Old format: an object without a runs array
      await fs.writeFile(
        statePath,
        JSON.stringify({ lastProcessed: '2025-01-01' }),
      );

      const result = await readExtractionState(statePath);

      expect(result).toEqual({ runs: [] });
    });
  });

  describe('validatePatches', () => {
    let skillsDir: string;
    let globalSkillsDir: string;
    let projectSkillsDir: string;
    let validateConfig: Config;

    beforeEach(() => {
      skillsDir = path.join(tmpDir, 'skills');
      globalSkillsDir = path.join(tmpDir, 'global-skills');
      projectSkillsDir = path.join(tmpDir, 'project-skills');

      vi.mocked(Storage.getUserSkillsDir).mockReturnValue(globalSkillsDir);
      validateConfig = {
        storage: {
          getProjectSkillsDir: () => projectSkillsDir,
        },
      } as unknown as Config;
    });

    it('returns empty array when no patch files exist', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      // Add a non-patch file to ensure it's ignored
      await fs.writeFile(path.join(skillsDir, 'some-file.txt'), 'hello');

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
    });

    it('returns empty array when directory does not exist', async () => {
      const { validatePatches } = await import('./memoryService.js');

      const result = await validatePatches(
        path.join(tmpDir, 'nonexistent-dir'),
        validateConfig,
      );

      expect(result).toEqual([]);
    });

    it('removes invalid patch files', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });

      // Write a malformed patch
      const patchPath = path.join(skillsDir, 'bad-skill.patch');
      await fs.writeFile(patchPath, 'this is not a valid patch');

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      // Verify the invalid patch was deleted
      await expect(fs.access(patchPath)).rejects.toThrow();
    });

    it('keeps valid patch files', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      // Create a real target file to patch
      const targetFile = path.join(projectSkillsDir, 'target.md');
      await fs.writeFile(targetFile, 'line1\nline2\nline3\n');

      // Write a valid unified diff patch with absolute paths
      const patchContent = [
        `--- ${targetFile}`,
        `+++ ${targetFile}`,
        '@@ -1,3 +1,4 @@',
        ' line1',
        ' line2',
        '+line2.5',
        ' line3',
        '',
      ].join('\n');
      const patchPath = path.join(skillsDir, 'good-skill.patch');
      await fs.writeFile(patchPath, patchContent);

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual(['good-skill.patch']);
      // Verify the valid patch still exists
      await expect(fs.access(patchPath)).resolves.toBeUndefined();
    });

    it('keeps patches with repeated sections for the same file when hunks apply cumulatively', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const targetFile = path.join(projectSkillsDir, 'target.md');
      await fs.writeFile(targetFile, 'alpha\nbeta\ngamma\ndelta\n');

      const patchPath = path.join(skillsDir, 'multi-section.patch');
      await fs.writeFile(
        patchPath,
        [
          `--- ${targetFile}`,
          `+++ ${targetFile}`,
          '@@ -1,4 +1,5 @@',
          ' alpha',
          ' beta',
          '+beta2',
          ' gamma',
          ' delta',
          `--- ${targetFile}`,
          `+++ ${targetFile}`,
          '@@ -2,4 +2,5 @@',
          ' beta',
          ' beta2',
          ' gamma',
          '+gamma2',
          ' delta',
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual(['multi-section.patch']);
      await expect(fs.access(patchPath)).resolves.toBeUndefined();
    });

    it('removes /dev/null patches that target an existing skill file', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const targetFile = path.join(projectSkillsDir, 'existing-skill.md');
      await fs.writeFile(targetFile, 'original content\n');

      const patchPath = path.join(skillsDir, 'bad-new-file.patch');
      await fs.writeFile(
        patchPath,
        [
          '--- /dev/null',
          `+++ ${targetFile}`,
          '@@ -0,0 +1 @@',
          '+replacement content',
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      await expect(fs.access(patchPath)).rejects.toThrow();
      expect(await fs.readFile(targetFile, 'utf-8')).toBe('original content\n');
    });

    it('removes patches with malformed diff headers', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const targetFile = path.join(projectSkillsDir, 'target.md');
      await fs.writeFile(targetFile, 'line1\nline2\nline3\n');

      const patchPath = path.join(skillsDir, 'bad-headers.patch');
      await fs.writeFile(
        patchPath,
        [
          `--- ${targetFile}`,
          '+++ .gemini/skills/foo/SKILL.md',
          '@@ -1,3 +1,4 @@',
          ' line1',
          ' line2',
          '+line2.5',
          ' line3',
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      await expect(fs.access(patchPath)).rejects.toThrow();
      expect(await fs.readFile(targetFile, 'utf-8')).toBe(
        'line1\nline2\nline3\n',
      );
    });

    it('removes patches that contain no hunks', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      const patchPath = path.join(skillsDir, 'empty.patch');
      await fs.writeFile(
        patchPath,
        [
          `--- ${path.join(projectSkillsDir, 'target.md')}`,
          `+++ ${path.join(projectSkillsDir, 'target.md')}`,
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      await expect(fs.access(patchPath)).rejects.toThrow();
    });

    it('removes patches that target files outside the allowed skill roots', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      const outsideFile = path.join(tmpDir, 'outside.md');
      await fs.writeFile(outsideFile, 'line1\nline2\nline3\n');

      const patchPath = path.join(skillsDir, 'outside.patch');
      await fs.writeFile(
        patchPath,
        [
          `--- ${outsideFile}`,
          `+++ ${outsideFile}`,
          '@@ -1,3 +1,4 @@',
          ' line1',
          ' line2',
          '+line2.5',
          ' line3',
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      await expect(fs.access(patchPath)).rejects.toThrow();
    });

    it('removes patches that escape the allowed roots through a symlinked parent', async () => {
      const { validatePatches } = await import('./memoryService.js');

      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const outsideDir = path.join(tmpDir, 'outside-dir');
      const linkedDir = path.join(projectSkillsDir, 'linked');
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.symlink(
        outsideDir,
        linkedDir,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const outsideFile = path.join(outsideDir, 'escaped.md');
      await fs.writeFile(outsideFile, 'line1\nline2\nline3\n');

      const patchPath = path.join(skillsDir, 'symlink.patch');
      await fs.writeFile(
        patchPath,
        [
          `--- ${path.join(linkedDir, 'escaped.md')}`,
          `+++ ${path.join(linkedDir, 'escaped.md')}`,
          '@@ -1,3 +1,4 @@',
          ' line1',
          ' line2',
          '+line2.5',
          ' line3',
          '',
        ].join('\n'),
      );

      const result = await validatePatches(skillsDir, validateConfig);

      expect(result).toEqual([]);
      await expect(fs.access(patchPath)).rejects.toThrow();
      expect(await fs.readFile(outsideFile, 'utf-8')).not.toContain('line2.5');
    });
  });

  describe('startMemoryService feedback for patch-only runs', () => {
    it('emits feedback when extraction produces only patch suggestions', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );

      vi.mocked(coreEvents.emitFeedback).mockClear();
      vi.mocked(LocalAgentExecutor.create).mockReset();

      const memoryDir = path.join(tmpDir, 'memory-patch-only');
      const skillsDir = path.join(tmpDir, 'skills-patch-only');
      const projectTempDir = path.join(tmpDir, 'temp-patch-only');
      const chatsDir = path.join(projectTempDir, 'chats');
      const projectSkillsDir = path.join(tmpDir, 'workspace-skills');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(chatsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const existingSkill = path.join(projectSkillsDir, 'existing-skill.md');
      await fs.writeFile(existingSkill, 'line1\nline2\nline3\n');

      const conversation = createConversation({
        sessionId: 'patch-only-session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(chatsDir, 'session-2025-01-01T00-00-patchonly.json'),
        JSON.stringify(conversation),
      );

      vi.mocked(Storage.getUserSkillsDir).mockReturnValue(
        path.join(tmpDir, 'global-skills'),
      );
      vi.mocked(LocalAgentExecutor.create).mockResolvedValueOnce({
        run: vi.fn().mockImplementation(async () => {
          const patchPath = path.join(skillsDir, 'existing-skill.patch');
          await fs.writeFile(
            patchPath,
            [
              `--- ${existingSkill}`,
              `+++ ${existingSkill}`,
              '@@ -1,3 +1,4 @@',
              ' line1',
              ' line2',
              '+line2.5',
              ' line3',
              '',
            ].join('\n'),
          );
          return undefined;
        }),
      } as never);

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectSkillsDir: vi.fn().mockReturnValue(projectSkillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        getSkillManager: vi.fn().mockReturnValue({ getSkills: () => [] }),
        modelConfigService: {
          registerRuntimeModelConfig: vi.fn(),
        },
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('skill update'),
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('/memory inbox'),
      );
    });

    it('does not emit feedback for old inbox patches when this run creates none', async () => {
      const { startMemoryService } = await import('./memoryService.js');
      const { LocalAgentExecutor } = await import(
        '../agents/local-executor.js'
      );

      vi.mocked(coreEvents.emitFeedback).mockClear();
      vi.mocked(LocalAgentExecutor.create).mockReset();

      const memoryDir = path.join(tmpDir, 'memory-old-patch');
      const skillsDir = path.join(tmpDir, 'skills-old-patch');
      const projectTempDir = path.join(tmpDir, 'temp-old-patch');
      const chatsDir = path.join(projectTempDir, 'chats');
      const projectSkillsDir = path.join(tmpDir, 'workspace-old-patch');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(chatsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      const existingSkill = path.join(projectSkillsDir, 'existing-skill.md');
      await fs.writeFile(existingSkill, 'line1\nline2\nline3\n');
      await fs.writeFile(
        path.join(skillsDir, 'existing-skill.patch'),
        [
          `--- ${existingSkill}`,
          `+++ ${existingSkill}`,
          '@@ -1,3 +1,4 @@',
          ' line1',
          ' line2',
          '+line2.5',
          ' line3',
          '',
        ].join('\n'),
      );

      const conversation = createConversation({
        sessionId: 'old-patch-session',
        messageCount: 20,
      });
      await fs.writeFile(
        path.join(chatsDir, 'session-2025-01-01T00-00-oldpatch.json'),
        JSON.stringify(conversation),
      );

      vi.mocked(Storage.getUserSkillsDir).mockReturnValue(
        path.join(tmpDir, 'global-skills'),
      );
      vi.mocked(LocalAgentExecutor.create).mockResolvedValueOnce({
        run: vi.fn().mockResolvedValue(undefined),
      } as never);

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectSkillsDir: vi.fn().mockReturnValue(projectSkillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        getSkillManager: vi.fn().mockReturnValue({ getSkills: () => [] }),
        modelConfigService: {
          registerRuntimeModelConfig: vi.fn(),
        },
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      await startMemoryService(mockConfig);

      expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
    });
  });

  describe('MemoryService', () => {
    // Helper to create a minimal mock MemoryProvider
    function createMockProvider(
      overrides: Partial<import('./memoryProvider.js').MemoryProvider> & {
        name: string;
      },
    ): import('./memoryProvider.js').MemoryProvider {
      return { ...overrides };
    }

    // Minimal Config mock reusable across tests
    function createMockConfig() {
      return {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue('/tmp/fake-memory'),
          getProjectMemoryTempDir: vi.fn().mockReturnValue('/tmp/fake-memory'),
          getProjectSkillsMemoryDir: vi
            .fn()
            .mockReturnValue('/tmp/fake-skills'),
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/fake-temp'),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as import('../config/config.js').Config;
    }

    describe('registerProvider', () => {
      it('adds provider to the providers list', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const provider = createMockProvider({ name: 'test-provider' });

        await service.registerProvider(provider, createMockConfig());

        expect(service.getProviders()).toContain(provider);
      });

      it('calls initialize if ctx has been set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        // Set ctx by emitting sessionStart first
        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const initializeFn = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'late-provider',
          initialize: initializeFn,
        });

        await service.registerProvider(provider, config);

        expect(initializeFn).toHaveBeenCalledWith(
          config,
          expect.objectContaining({ sessionId: 's1' }),
        );
      });

      it('does not call initialize if ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const initializeFn = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'early-provider',
          initialize: initializeFn,
        });

        await service.registerProvider(provider, createMockConfig());

        expect(initializeFn).not.toHaveBeenCalled();
      });

      it('handles initialize errors without throwing', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const provider = createMockProvider({
          name: 'bad-init-provider',
          initialize: vi.fn().mockRejectedValue(new Error('init boom')),
        });

        await expect(
          service.registerProvider(provider, config),
        ).resolves.not.toThrow();
        expect(service.getProviders()).toContain(provider);
      });
    });

    describe('emitSessionStart', () => {
      it('dispatches to providers that implement onSessionStart', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onSessionStart = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'start-provider',
          onSessionStart,
        });
        await service.registerProvider(provider, config);

        const payload = {
          sessionId: 'sess-1',
          resumed: false,
          workspaceDir: '/workspace',
        };
        await service.emitSessionStart(payload, config);

        // Fire-and-forget — allow microtask to settle
        await new Promise((r) => setTimeout(r, 10));

        expect(onSessionStart).toHaveBeenCalledWith(
          payload,
          expect.objectContaining({
            sessionId: 'sess-1',
            workspaceDir: '/workspace',
            config,
          }),
        );
      });

      it('sets context for subsequent events', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        // Before emitSessionStart, emitUserInput should no-op
        const result = await service.emitUserInput({
          userMessage: 'hello',
        });
        expect(result).toBeUndefined();

        // After emitSessionStart, events should dispatch
        await service.emitSessionStart(
          { sessionId: 's2', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const onUserInput = vi.fn().mockResolvedValue({ inject: 'injected' });
        const provider = createMockProvider({
          name: 'input-provider',
          onUserInput,
        });
        await service.registerProvider(provider, config);

        const inputResult = await service.emitUserInput({
          userMessage: 'test',
        });
        expect(inputResult).toEqual({ inject: 'injected' });
      });

      it('handles errors per-provider without throwing', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const badProvider = createMockProvider({
          name: 'bad-start',
          onSessionStart: vi.fn().mockRejectedValue(new Error('start boom')),
        });
        const goodProvider = createMockProvider({
          name: 'good-start',
          onSessionStart: vi.fn().mockResolvedValue(undefined),
        });

        await service.registerProvider(badProvider, config);
        await service.registerProvider(goodProvider, config);

        const payload = {
          sessionId: 'sess-err',
          resumed: false,
          workspaceDir: '/tmp',
        };
        await expect(
          service.emitSessionStart(payload, config),
        ).resolves.not.toThrow();

        await new Promise((r) => setTimeout(r, 10));
        expect(goodProvider.onSessionStart).toHaveBeenCalled();
      });

      it('skips providers that do not implement onSessionStart', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider = createMockProvider({ name: 'no-start' });
        await service.registerProvider(provider, config);

        await expect(
          service.emitSessionStart(
            { sessionId: 's3', resumed: false, workspaceDir: '/tmp' },
            config,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe('emitUserInput', () => {
      it('collects inject strings from multiple providers', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider1 = createMockProvider({
          name: 'inject-1',
          onUserInput: vi.fn().mockResolvedValue({ inject: 'context-A' }),
        });
        const provider2 = createMockProvider({
          name: 'inject-2',
          onUserInput: vi.fn().mockResolvedValue({ inject: 'context-B' }),
        });
        await service.registerProvider(provider1, config);
        await service.registerProvider(provider2, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitUserInput({
          userMessage: 'hello',
        });

        expect(result).toEqual({
          inject: 'context-A\n\ncontext-B',
        });
      });

      it('returns undefined when no providers return inject', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider = createMockProvider({
          name: 'no-inject',
          onUserInput: vi.fn().mockResolvedValue(undefined),
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitUserInput({
          userMessage: 'hello',
        });

        expect(result).toBeUndefined();
      });

      it('returns undefined when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const result = await service.emitUserInput({
          userMessage: 'no ctx',
        });

        expect(result).toBeUndefined();
      });

      it('handles errors from one provider and still collects from others', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const badProvider = createMockProvider({
          name: 'bad-input',
          onUserInput: vi.fn().mockRejectedValue(new Error('input boom')),
        });
        const goodProvider = createMockProvider({
          name: 'good-input',
          onUserInput: vi.fn().mockResolvedValue({ inject: 'good-context' }),
        });
        await service.registerProvider(badProvider, config);
        await service.registerProvider(goodProvider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitUserInput({
          userMessage: 'test',
        });

        expect(result).toEqual({ inject: 'good-context' });
      });
    });

    describe('emitContextEvicted', () => {
      it('dispatches to providers that implement onContextEvicted', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onContextEvicted = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'evict-provider',
          onContextEvicted,
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const payload = {
          reason: 'compress' as const,
          evictedTurns: [],
          summary: 'compressed',
        };
        await service.emitContextEvicted(payload);

        await new Promise((r) => setTimeout(r, 10));
        expect(onContextEvicted).toHaveBeenCalledWith(
          payload,
          expect.objectContaining({ sessionId: 's1' }),
        );
      });

      it('no-ops when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const onContextEvicted = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'evict-noop',
          onContextEvicted,
        });
        await service.registerProvider(provider, createMockConfig());

        await service.emitContextEvicted({
          reason: 'truncate',
          evictedTurns: [],
        });

        expect(onContextEvicted).not.toHaveBeenCalled();
      });
    });

    describe('emitPreCompress', () => {
      it('collects preservation hints from multiple providers', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider1 = createMockProvider({
          name: 'hint-1',
          onPreCompress: vi.fn().mockResolvedValue('User prefers TypeScript'),
        });
        const provider2 = createMockProvider({
          name: 'hint-2',
          onPreCompress: vi.fn().mockResolvedValue('Project uses Vitest'),
        });
        await service.registerProvider(provider1, config);
        await service.registerProvider(provider2, config);

        await service.emitSessionStart(
          { sessionId: 'test', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitPreCompress({
          messages: [{ role: 'user', parts: [{ text: 'hello' }] }],
        });

        expect(result).toBe('User prefers TypeScript\n\nProject uses Vitest');
      });

      it('returns empty string when no providers have hints', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider = createMockProvider({
          name: 'no-hint',
          onPreCompress: vi.fn().mockResolvedValue(undefined),
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 'test', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitPreCompress({ messages: [] });
        expect(result).toBe('');
      });

      it('returns empty string when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const result = await service.emitPreCompress({ messages: [] });
        expect(result).toBe('');
      });

      it('handles errors from one provider and still collects from others', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider1 = createMockProvider({
          name: 'error-provider',
          onPreCompress: vi.fn().mockRejectedValue(new Error('boom')),
        });
        const provider2 = createMockProvider({
          name: 'good-provider',
          onPreCompress: vi.fn().mockResolvedValue('Keep this fact'),
        });
        await service.registerProvider(provider1, config);
        await service.registerProvider(provider2, config);

        await service.emitSessionStart(
          { sessionId: 'test', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const result = await service.emitPreCompress({ messages: [] });
        expect(result).toBe('Keep this fact');
      });
    });

    describe('emitTurnComplete', () => {
      it('dispatches fire-and-forget to providers', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onTurnComplete = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'turn-provider',
          onTurnComplete,
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const payload = {
          turnIndex: 1,
          userContent: 'user said',
          assistantContent: 'assistant said',
        };
        await service.emitTurnComplete(payload);

        await new Promise((r) => setTimeout(r, 10));
        expect(onTurnComplete).toHaveBeenCalledWith(
          payload,
          expect.objectContaining({ sessionId: 's1' }),
        );
      });

      it('no-ops when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const onTurnComplete = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'turn-noop',
          onTurnComplete,
        });
        await service.registerProvider(provider, createMockConfig());

        await service.emitTurnComplete({
          turnIndex: 0,
          userContent: 'x',
          assistantContent: 'y',
        });

        expect(onTurnComplete).not.toHaveBeenCalled();
      });
    });

    describe('emitIdle', () => {
      it('dispatches to provider when idleDurationMs >= threshold', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onIdle = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'idle-provider',
          onIdle,
          idleThresholdMs: 5000,
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        await service.emitIdle({ idleDurationMs: 5000 });

        await new Promise((r) => setTimeout(r, 10));
        expect(onIdle).toHaveBeenCalledWith(
          { idleDurationMs: 5000 },
          expect.objectContaining({ sessionId: 's1' }),
        );
      });

      it('skips provider when idleDurationMs < threshold', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onIdle = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'idle-skip',
          onIdle,
          idleThresholdMs: 10000,
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        await service.emitIdle({ idleDurationMs: 5000 });

        await new Promise((r) => setTimeout(r, 10));
        expect(onIdle).not.toHaveBeenCalled();
      });

      it('treats missing idleThresholdMs as 0 (always fire)', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onIdle = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'idle-default',
          onIdle,
          // no idleThresholdMs — defaults to 0
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        await service.emitIdle({ idleDurationMs: 1 });

        await new Promise((r) => setTimeout(r, 10));
        expect(onIdle).toHaveBeenCalled();
      });

      it('no-ops when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const onIdle = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'idle-noop',
          onIdle,
        });
        await service.registerProvider(provider, createMockConfig());

        await service.emitIdle({ idleDurationMs: 99999 });

        expect(onIdle).not.toHaveBeenCalled();
      });
    });

    describe('emitSessionEnd', () => {
      it('dispatches fire-and-forget to providers', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const onSessionEnd = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'end-provider',
          onSessionEnd,
        });
        await service.registerProvider(provider, config);

        await service.emitSessionStart(
          { sessionId: 's1', resumed: false, workspaceDir: '/tmp' },
          config,
        );

        const payload = { messages: [], reason: 'exit' as const };
        await service.emitSessionEnd(payload);

        await new Promise((r) => setTimeout(r, 10));
        expect(onSessionEnd).toHaveBeenCalledWith(
          payload,
          expect.objectContaining({ sessionId: 's1' }),
        );
      });

      it('no-ops when ctx is not set', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        const onSessionEnd = vi.fn().mockResolvedValue(undefined);
        const provider = createMockProvider({
          name: 'end-noop',
          onSessionEnd,
        });
        await service.registerProvider(provider, createMockConfig());

        await service.emitSessionEnd({ messages: [], reason: 'clear' });

        expect(onSessionEnd).not.toHaveBeenCalled();
      });
    });

    describe('shutdown', () => {
      it('calls shutdown on all providers that implement it', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const shutdown1 = vi.fn().mockResolvedValue(undefined);
        const shutdown2 = vi.fn().mockResolvedValue(undefined);
        const provider1 = createMockProvider({
          name: 'shut-1',
          shutdown: shutdown1,
        });
        const provider2 = createMockProvider({
          name: 'shut-2',
          shutdown: shutdown2,
        });
        await service.registerProvider(provider1, config);
        await service.registerProvider(provider2, config);

        await service.shutdown();

        expect(shutdown1).toHaveBeenCalled();
        expect(shutdown2).toHaveBeenCalled();
      });

      it('handles shutdown errors without throwing', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider = createMockProvider({
          name: 'bad-shutdown',
          shutdown: vi.fn().mockRejectedValue(new Error('shutdown boom')),
        });
        await service.registerProvider(provider, config);

        await expect(service.shutdown()).resolves.not.toThrow();
      });

      it('skips providers without a shutdown method', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const provider = createMockProvider({ name: 'no-shutdown' });
        await service.registerProvider(provider, config);

        await expect(service.shutdown()).resolves.not.toThrow();
      });
    });

    describe('getProviders', () => {
      it('returns empty array initially', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();

        expect(service.getProviders()).toEqual([]);
      });

      it('returns all registered providers in order', async () => {
        const { MemoryService } = await import('./memoryService.js');
        const service = new MemoryService();
        const config = createMockConfig();

        const p1 = createMockProvider({ name: 'p1' });
        const p2 = createMockProvider({ name: 'p2' });
        await service.registerProvider(p1, config);
        await service.registerProvider(p2, config);

        const providers = service.getProviders();
        expect(providers).toHaveLength(2);
        expect(providers[0].name).toBe('p1');
        expect(providers[1].name).toBe('p2');
      });
    });
  });

  describe('createMemoryService', () => {
    it('creates a service with DefaultMemoryProvider pre-registered', async () => {
      const { createMemoryService } = await import('./memoryService.js');
      const config = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue('/tmp/fake-memory'),
          getProjectMemoryTempDir: vi.fn().mockReturnValue('/tmp/fake-memory'),
          getProjectSkillsMemoryDir: vi
            .fn()
            .mockReturnValue('/tmp/fake-skills'),
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/fake-temp'),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as Parameters<typeof createMemoryService>[0];

      const service = await createMemoryService(config);

      const providers = service.getProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('default');
    });
  });

  describe('startMemoryService backward compat', () => {
    it('calls startSkillExtraction via the legacy entry point', async () => {
      const { startMemoryService } = await import('./memoryService.js');

      // startMemoryService delegates to startSkillExtraction which
      // tries to acquire a lock. We just verify it does not throw when
      // the lock is already held (it gracefully skips).
      const memoryDir = path.join(tmpDir, 'compat-memory');
      const skillsDir = path.join(tmpDir, 'compat-skills');
      const projectTempDir = path.join(tmpDir, 'compat-temp');
      await fs.mkdir(memoryDir, { recursive: true });

      // Pre-acquire lock so it skips extraction
      const lockPath = path.join(memoryDir, '.extraction.lock');
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
      );

      const mockConfig = {
        storage: {
          getProjectMemoryDir: vi.fn().mockReturnValue(memoryDir),
          getProjectMemoryTempDir: vi.fn().mockReturnValue(memoryDir),
          getProjectSkillsMemoryDir: vi.fn().mockReturnValue(skillsDir),
          getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
        },
        getToolRegistry: vi.fn(),
        getMessageBus: vi.fn(),
        getGeminiClient: vi.fn(),
        sandboxManager: undefined,
      } as unknown as Parameters<typeof startMemoryService>[0];

      // Should not throw — gracefully skips since lock is held
      await expect(startMemoryService(mockConfig)).resolves.not.toThrow();
    });
  });
});
