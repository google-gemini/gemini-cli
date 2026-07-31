/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { existsSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  type Config,
  debugLogger,
  TOOL_OUTPUTS_DIR,
  Storage,
} from '@google/gemini-cli-core';
import type { Settings } from '../config/settings.js';
import {
  cleanupExpiredSessions,
  cleanupToolOutputFiles,
} from './sessionCleanup.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('Session Cleanup (Refactored)', () => {
  let testTempDir: string;
  let chatsDir: string;
  let logsDir: string;
  let toolOutputsDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    testTempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-cli-cleanup-test-'),
    );
    chatsDir = path.join(testTempDir, 'chats');
    logsDir = path.join(testTempDir, 'logs');
    toolOutputsDir = path.join(testTempDir, TOOL_OUTPUTS_DIR);

    await fs.mkdir(chatsDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(toolOutputsDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (testTempDir && existsSync(testTempDir)) {
      await fs.rm(testTempDir, { recursive: true, force: true });
    }
  });

  function createMockConfig(overrides: Partial<Config> = {}): Config {
    return {
      storage: {
        getProjectTempDir: () => testTempDir,
      },
      getSessionId: () => 'current123',
      getDebugMode: () => false,
      getExperimentalGemma: () => false,
      initialize: async () => {},
      ...overrides,
    } as unknown as Config;
  }

  async function writeSessionFile(session: {
    id: string;
    fileName: string;
    lastUpdated: string;
  }) {
    const filePath = path.join(chatsDir, session.fileName);
    await fs.writeFile(
      filePath,
      JSON.stringify({
        sessionId: session.id,
        lastUpdated: session.lastUpdated,
        startTime: session.lastUpdated,
        messages: [{ type: 'user', content: 'hello' }],
      }),
    );
  }

  async function writeArtifacts(sessionId: string) {
    // Log file
    await fs.writeFile(
      path.join(logsDir, `session-${sessionId}.jsonl`),
      'log content',
    );
    // Tool output directory
    const sessionOutputDir = path.join(toolOutputsDir, `session-${sessionId}`);
    await fs.mkdir(sessionOutputDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionOutputDir, 'output.txt'),
      'tool output',
    );
    // Session directory
    await fs.mkdir(path.join(testTempDir, sessionId), { recursive: true });
    // Subagent chats directory
    await fs.mkdir(path.join(chatsDir, sessionId), { recursive: true });
  }

  async function seedSessions() {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sessions = [
      {
        id: 'current123',
        fileName: 'session-20250101-current1.json',
        lastUpdated: now.toISOString(),
      },
      {
        id: 'old789abc',
        fileName: 'session-20250110-old789ab.json',
        lastUpdated: twoWeeksAgo.toISOString(),
      },
      {
        id: 'ancient12',
        fileName: 'session-20241225-ancient1.json',
        lastUpdated: oneMonthAgo.toISOString(),
      },
    ];

    for (const session of sessions) {
      await writeSessionFile(session);
      await writeArtifacts(session.id);
    }
    return sessions;
  }

  describe('Configuration boundaries & early exits', () => {
    it('should return early when cleanup is disabled', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: false } },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return early when sessionRetention is not configured', async () => {
      const config = createMockConfig();
      const settings: Settings = { general: {} };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should require either maxAge or maxCount', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true } },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified'),
      );
    });

    it.each([0, -1, -5])(
      'should validate maxCount range (rejecting %i)',
      async (invalidCount) => {
        const config = createMockConfig();
        const settings: Settings = {
          general: {
            sessionRetention: { enabled: true, maxCount: invalidCount },
          },
        };
        const result = await cleanupExpiredSessions(config, settings);
        expect(result.disabled).toBe(true);
        expect(debugLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('maxCount must be at least 1'),
        );
      },
    );

    it('should reject if both maxAge and maxCount are invalid', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: { enabled: true, maxAge: 'invalid', maxCount: 0 },
        },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid retention period format'),
      );
    });

    it('should reject if maxAge is invalid even when maxCount is valid', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: { enabled: true, maxAge: 'invalid', maxCount: 5 },
        },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid retention period format'),
      );
    });
  });

  describe('Logging and Debug Mode', () => {
    it('should log debug information when enabled', async () => {
      await seedSessions();
      const config = createMockConfig({
        getDebugMode: vi.fn().mockReturnValue(true),
      });
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxCount: 1 } },
      };

      const debugSpy = vi
        .spyOn(debugLogger, 'debug')
        .mockImplementation(() => {});
      await cleanupExpiredSessions(config, settings);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session cleanup: deleted'),
      );
      debugSpy.mockRestore();
    });
  });

  describe('Basic retention rules', () => {
    it('should delete sessions older than maxAge', async () => {
      const sessions = await seedSessions();
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '10d',
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(3);
      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
      expect(existsSync(path.join(chatsDir, sessions[0].fileName))).toBe(true);
      expect(existsSync(path.join(chatsDir, sessions[1].fileName))).toBe(false);
      expect(existsSync(path.join(chatsDir, sessions[2].fileName))).toBe(false);

      // Verify artifacts for an old session are gone
      expect(
        existsSync(path.join(logsDir, `session-${sessions[1].id}.jsonl`)),
      ).toBe(false);
      expect(
        existsSync(path.join(toolOutputsDir, `session-${sessions[1].id}`)),
      ).toBe(false);
      expect(existsSync(path.join(testTempDir, sessions[1].id))).toBe(false); // Session directory should be deleted
      expect(existsSync(path.join(chatsDir, sessions[1].id))).toBe(false); // Subagent chats directory should be deleted
    });

    it('should delete legacy pretty-printed session files and their artifacts', async () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const sessionId = 'legacy-uuid';
      const shortId = 'legacy12';
      const fileName = `session-20250110-${shortId}.json`;
      const filePath = path.join(chatsDir, fileName);

      // Write pretty-printed JSON
      await fs.writeFile(
        filePath,
        JSON.stringify(
          {
            sessionId,
            lastUpdated: twoWeeksAgo.toISOString(),
            startTime: twoWeeksAgo.toISOString(),
            messages: [{ type: 'user', content: 'hello legacy' }],
          },
          null,
          2,
        ),
      );

      await writeArtifacts(sessionId);

      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '10d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(existsSync(filePath)).toBe(false);
      // Artifacts should be gone because we extracted sessionId from legacy JSON
      expect(
        existsSync(path.join(toolOutputsDir, `session-${sessionId}`)),
      ).toBe(false);
    });

    it('should delete expired JSONL session files and their artifacts', async () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const sessionId = 'jsonl-uuid';
      const shortId = 'jsonl123';
      const fileName = `session-20250110-${shortId}.jsonl`;
      const filePath = path.join(chatsDir, fileName);

      // Write JSONL
      const metadata = {
        sessionId,
        lastUpdated: twoWeeksAgo.toISOString(),
        startTime: twoWeeksAgo.toISOString(),
        kind: 'main',
      };
      const message = { id: '1', type: 'user', content: 'hello jsonl' };
      await fs.writeFile(
        filePath,
        JSON.stringify(metadata) + '\n' + JSON.stringify(message) + '\n',
      );

      await writeArtifacts(sessionId);

      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '10d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(existsSync(filePath)).toBe(false);
      // Artifacts should be gone because we extracted sessionId from JSONL first line
      expect(
        existsSync(path.join(toolOutputsDir, `session-${sessionId}`)),
      ).toBe(false);
    });

    it('should delete corrupted session files even if sessionId cannot be extracted', async () => {
      const shortId = 'corrupt1';
      const fileName = `session-20250110-${shortId}.json`;
      const filePath = path.join(chatsDir, fileName);

      await fs.writeFile(filePath, 'completely invalid json');

      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '10d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should NOT delete sessions within the cutoff date', async () => {
      const sessions = await seedSessions(); // [current, 14d, 30d]
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '60d' } },
      };

      // 60d cutoff should keep everything that was seeded
      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(3);
      for (const session of sessions) {
        expect(existsSync(path.join(chatsDir, session.fileName))).toBe(true);
      }
    });

    it('should handle count-based retention (keeping N most recent)', async () => {
      const sessions = await seedSessions(); // [current, 14d, 30d]

      // Seed two additional granular files to prove sorting works
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      await writeSessionFile({
        id: 'recent3',
        fileName: 'session-20250117-recent3.json',
        lastUpdated: threeDaysAgo.toISOString(),
      });
      await writeArtifacts('recent3');
      await writeSessionFile({
        id: 'recent5',
        fileName: 'session-20250115-recent5.json',
        lastUpdated: fiveDaysAgo.toISOString(),
      });
      await writeArtifacts('recent5');

      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 3, // Keep current + 2 most recent (which should be 3d and 5d)
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(5);
      expect(result.deleted).toBe(2); // Should only delete the 14d and 30d old sessions
      expect(result.skipped).toBe(3);
      expect(result.failed).toBe(0);

      // Verify specifically WHICH files survived
      expect(existsSync(path.join(chatsDir, sessions[0].fileName))).toBe(true); // current
      expect(
        existsSync(path.join(chatsDir, 'session-20250117-recent3.json')),
      ).toBe(true); // 3d
      expect(
        existsSync(path.join(chatsDir, 'session-20250115-recent5.json')),
      ).toBe(true); // 5d

      // Verify the older ones were deleted
      expect(existsSync(path.join(chatsDir, sessions[1].fileName))).toBe(false); // 14d
      expect(existsSync(path.join(chatsDir, sessions[2].fileName))).toBe(false); // 30d
    });

    it('should delete subagent files sharing the same shortId', async () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // Parent session (expired)
      await writeSessionFile({
        id: 'parent-uuid',
        fileName: 'session-20250110-abc12345.json',
        lastUpdated: twoWeeksAgo.toISOString(),
      });
      await writeArtifacts('parent-uuid');

      // Subagent session (different UUID, same shortId)
      await writeSessionFile({
        id: 'sub-uuid',
        fileName: 'session-20250110-subagent-abc12345.json',
        lastUpdated: twoWeeksAgo.toISOString(),
      });
      await writeArtifacts('sub-uuid');

      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '10d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(2); // Both files should be deleted
      expect(
        existsSync(path.join(chatsDir, 'session-20250110-abc12345.json')),
      ).toBe(false);
      expect(
        existsSync(
          path.join(chatsDir, 'session-20250110-subagent-abc12345.json'),
        ),
      ).toBe(false);

      // Artifacts for both should be gone
      expect(existsSync(path.join(logsDir, 'session-parent-uuid.jsonl'))).toBe(
        false,
      );
      expect(existsSync(path.join(logsDir, 'session-sub-uuid.jsonl'))).toBe(
        false,
      );
    });

    it('should delete corrupted session files', async () => {
      // Write a corrupted file (invalid JSON)
      const corruptPath = path.join(chatsDir, 'session-corrupt.json');
      await fs.writeFile(corruptPath, 'invalid json');

      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '10d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(existsSync(corruptPath)).toBe(false);
    });

    it('should safely delete 8-character sessions containing invalid JSON', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      const badJsonPath = path.join(chatsDir, 'session-20241225-badjson1.json');
      await fs.writeFile(badJsonPath, 'This is raw text, not JSON');

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(existsSync(badJsonPath)).toBe(false);
    });

    it('should safely delete legacy non-8-character sessions', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      const legacyPath = path.join(chatsDir, 'session-20241225-legacy.json');
      // Create valid JSON so the parser succeeds, but shortId derivation fails
      await fs.writeFile(
        legacyPath,
        JSON.stringify({
          sessionId: 'legacy-session-id',
          lastUpdated: '2024-12-25T00:00:00.000Z',
          messages: [],
        }),
      );

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(existsSync(legacyPath)).toBe(false);
    });

    it('should silently ignore ENOENT if file is already deleted before unlink', async () => {
      await seedSessions(); // Seeds older 2024 and 2025 sessions
      const targetFile = path.join(chatsDir, 'session-20241225-ancient1.json');
      let getSessionIdCalls = 0;

      const config = createMockConfig({
        getSessionId: () => {
          getSessionIdCalls++;
          // First call is for `getAllSessionFiles`.
          // Subsequent calls are right before `fs.unlink`!
          if (getSessionIdCalls > 1) {
            try {
              unlinkSync(targetFile);
            } catch {
              /* ignore */
            }
          }
          return 'mock-session-id';
        },
      });
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      // `failed` should not increment because ENOENT is silently swallowed
      expect(result.failed).toBe(0);
    });

    it('should respect minRetention configuration', async () => {
      await seedSessions();
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '12h', // Less than 1 day minRetention
            minRetention: '1d',
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      // Should return early and not delete anything
      expect(result.disabled).toBe(true);
      expect(result.deleted).toBe(0);
    });

    it('should handle combined maxAge and maxCount (most restrictive wins)', async () => {
      const sessions = await seedSessions(); // [current, 14d, 30d]

      // Seed 3d and 5d to mirror the granular sorting test
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      await writeSessionFile({
        id: 'recent3',
        fileName: 'session-20250117-recent3.json',
        lastUpdated: threeDaysAgo.toISOString(),
      });
      await writeArtifacts('recent3');
      await writeSessionFile({
        id: 'recent5',
        fileName: 'session-20250115-recent5.json',
        lastUpdated: fiveDaysAgo.toISOString(),
      });
      await writeArtifacts('recent5');

      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            // 20d deletes 30d.
            // maxCount: 2 keeps current and 3d.
            // Restrictive wins: 30d deleted by maxAge. 14d, 5d deleted by maxCount.
            maxAge: '20d',
            maxCount: 2,
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.scanned).toBe(5);
      expect(result.deleted).toBe(3); // deletes 5d, 14d, 30d
      expect(result.skipped).toBe(2); // keeps current, 3d
      expect(result.failed).toBe(0);

      // Assert kept
      expect(existsSync(path.join(chatsDir, sessions[0].fileName))).toBe(true); // current
      expect(
        existsSync(path.join(chatsDir, 'session-20250117-recent3.json')),
      ).toBe(true); // 3d

      // Assert deleted
      expect(
        existsSync(path.join(chatsDir, 'session-20250115-recent5.json')),
      ).toBe(false); // 5d
      expect(existsSync(path.join(chatsDir, sessions[1].fileName))).toBe(false); // 14d
      expect(existsSync(path.join(chatsDir, sessions[2].fileName))).toBe(false); // 30d
    });

    it('should handle empty sessions directory', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '30d' } },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('Error handling & resilience', () => {
    it.skipIf(process.platform === 'win32')(
      'should handle file system errors gracefully (e.g., EACCES)',
      async () => {
        const sessions = await seedSessions();
        const config = createMockConfig();
        const settings: Settings = {
          general: { sessionRetention: { enabled: true, maxAge: '1d' } },
        };

        // Make one of the files read-only and its parent directory read-only to simulate EACCES during unlink
        const targetFile = path.join(chatsDir, sessions[1].fileName);
        await fs.chmod(targetFile, 0o444);
        // Wait we want unlink to fail, so we make the directory read-only temporarily
        await fs.chmod(chatsDir, 0o555);

        try {
          const result = await cleanupExpiredSessions(config, settings);

          // It shouldn't crash
          expect(result.disabled).toBe(false);
          // It should have tried and failed to delete the old session
          expect(result.failed).toBeGreaterThan(0);
        } finally {
          // Restore permissions so cleanup can proceed in afterEach
          await fs.chmod(chatsDir, 0o777);
          await fs.chmod(targetFile, 0o666);
        }
      },
    );

    it.skipIf(process.platform === 'win32')(
      'should handle global read errors gracefully',
      async () => {
        const config = createMockConfig();
        const settings: Settings = {
          general: { sessionRetention: { enabled: true, maxAge: '1d' } },
        };

        // Make the chats directory unreadable
        await fs.chmod(chatsDir, 0o000);

        try {
          const result = await cleanupExpiredSessions(config, settings);

          // It shouldn't crash, but it should fail
          expect(result.disabled).toBe(false);
          expect(result.failed).toBe(1);
          expect(debugLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Session cleanup failed'),
          );
        } finally {
          await fs.chmod(chatsDir, 0o777);
        }
      },
    );

    it('should NOT delete tempDir if safeSessionId is empty', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      const sessions = await seedSessions();
      const targetFile = path.join(chatsDir, sessions[1].fileName);

      // Write a session ID that sanitizeFilenamePart will turn into an empty string ""
      await fs.writeFile(targetFile, JSON.stringify({ sessionId: '../../..' }));

      const tempDir = config.storage.getProjectTempDir();
      expect(existsSync(tempDir)).toBe(true);

      await cleanupExpiredSessions(config, settings);

      // It must NOT delete the tempDir root
      expect(existsSync(tempDir)).toBe(true);
    });

    it('should handle unexpected errors without throwing (e.g. string errors)', async () => {
      await seedSessions();
      const config = createMockConfig({
        getSessionId: () => {
          const stringError = 'String error' as unknown as Error;
          throw stringError; // Throw a non-Error string without triggering no-restricted-syntax
        },
      });
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxCount: 1 } },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(false);
      expect(result.failed).toBeGreaterThan(0);
    });

    it('should never run on the current session', async () => {
      await seedSessions();
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 1, // Keep only 1 session (which will be the current one)
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(1); // The current session
      const currentSessionFile = (await fs.readdir(chatsDir)).find((f) =>
        f.includes('current1'),
      );
      expect(currentSessionFile).toBeDefined();
    });
  });

  describe('Format parsing & validation', () => {
    // Valid formats
    it.each([
      ['1h'],
      ['24h'],
      ['168h'],
      ['1d'],
      ['7d'],
      ['30d'],
      ['365d'],
      ['1w'],
      ['2w'],
      ['4w'],
      ['52w'],
      ['1m'],
      ['3m'],
      ['12m'],
      ['9999d'],
    ])('should accept valid maxAge format %s', async (input) => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: input,
            minRetention: '1h',
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
      expect(result.failed).toBe(0);
    });

    it('should accept maxAge equal to minRetention', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: { enabled: true, maxAge: '1d', minRetention: '1d' },
        },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
    });

    it('should accept maxCount = 1000 (maximum valid)', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxCount: 1000 } },
      };
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
    });

    it('should reject maxAge less than default minRetention (1d)', async () => {
      await seedSessions();
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '12h',
            // Note: No minRetention provided here, should default to 1d
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);

      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('maxAge cannot be less than minRetention'),
      );
    });

    it('should reject maxAge less than custom minRetention', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '2d',
            minRetention: '3d', // maxAge < minRetention
          },
        },
      };

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('maxAge cannot be less than minRetention (3d)'),
      );
    });

    it('should reject zero value with a specific error message', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '0d' } },
      };

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Value must be greater than 0'),
      );
    });

    // Invalid formats
    it.each([
      ['30'],
      ['30x'],
      ['d'],
      ['1.5d'],
      ['-5d'],
      ['1 d'],
      ['1dd'],
      ['abc'],
      ['30s'],
      ['30y'],
    ])('should reject invalid maxAge format %s', async (input) => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: input } },
      };

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Invalid retention period format: ${input}`),
      );
    });

    it('should reject empty string for maxAge', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '' } },
      };

      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(true);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Either maxAge or maxCount must be specified'),
      );
    });

    it('should validate minRetention format', async () => {
      const config = createMockConfig();
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '5d',
            minRetention: 'invalid-format',
          },
        },
      };

      // Should fall back to default minRetention and proceed
      const result = await cleanupExpiredSessions(config, settings);
      expect(result.disabled).toBe(false);
    });
  });

  describe('Tool Output Cleanup', () => {
    let toolOutputDir: string;

    beforeEach(async () => {
      toolOutputDir = path.join(testTempDir, TOOL_OUTPUTS_DIR);
      await fs.mkdir(toolOutputDir, { recursive: true });
    });

    async function seedToolOutputs() {
      const now = new Date();
      const oldTime = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      const file1 = path.join(toolOutputDir, 'output1.json');
      await fs.writeFile(file1, '{}');

      const file2 = path.join(toolOutputDir, 'output2.json');
      await fs.writeFile(file2, '{}');

      // Manually backdate file1
      await fs.utimes(file1, oldTime, oldTime);

      // Create an old session subdirectory
      const oldSubdir = path.join(toolOutputDir, 'session-old');
      await fs.mkdir(oldSubdir);
      await fs.utimes(oldSubdir, oldTime, oldTime);

      return { file1, file2, oldSubdir };
    }

    it('should return early if cleanup is disabled', async () => {
      const settings: Settings = {
        general: { sessionRetention: { enabled: false } },
      };
      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should gracefully handle missing tool-outputs directory', async () => {
      await fs.rm(toolOutputDir, { recursive: true, force: true });
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(0);
    });

    it('should delete flat files and subdirectories based on maxAge', async () => {
      const { file1, file2, oldSubdir } = await seedToolOutputs();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '5d' } },
      };

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      // file1 and oldSubdir should be deleted.
      expect(result.deleted).toBe(2);
      expect(existsSync(file1)).toBe(false);
      expect(existsSync(oldSubdir)).toBe(false);
      expect(existsSync(file2)).toBe(true);
    });

    it('should delete oldest-first flat files based on maxCount when maxAge does not hit', async () => {
      const { file1, file2 } = await seedToolOutputs();
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxCount: 1 } },
      };

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      // Excess is 1. Oldest is file1. So file1 is deleted.
      expect(result.deleted).toBe(1);
      expect(existsSync(file1)).toBe(false);
      expect(existsSync(file2)).toBe(true);
    });

    it('should skip tool-output subdirectories with unsafe names', async () => {
      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };

      // Create a directory with a name that is semantically unsafe for sanitization rules
      const unsafeSubdir = path.join(toolOutputDir, 'session-unsafe@name');
      await fs.mkdir(unsafeSubdir);

      // Backdate it so it WOULD be deleted if it were safely named
      const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await fs.utimes(unsafeSubdir, oldTime, oldTime);

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      // Must be scanned but actively skipped from deletion due to sanitization mismatch
      expect(result.deleted).toBe(0);
      expect(existsSync(unsafeSubdir)).toBe(true);
    });

    it('should initialize Storage when projectTempDir is not explicitly provided', async () => {
      const getProjectTempDirSpy = vi
        .spyOn(Storage.prototype, 'getProjectTempDir')
        .mockReturnValue(testTempDir);
      const initializeSpy = vi
        .spyOn(Storage.prototype, 'initialize')
        .mockResolvedValue(undefined);

      const settings: Settings = {
        general: { sessionRetention: { enabled: true, maxAge: '1d' } },
      };
      const { oldSubdir } = await seedToolOutputs();

      // Call explicitly without third parameter
      const result = await cleanupToolOutputFiles(settings, false);

      expect(initializeSpy).toHaveBeenCalled();
      expect(result.deleted).toBeGreaterThan(0);
      expect(existsSync(oldSubdir)).toBe(false);

      getProjectTempDirSpy.mockRestore();
      initializeSpy.mockRestore();
    });
  });
});
