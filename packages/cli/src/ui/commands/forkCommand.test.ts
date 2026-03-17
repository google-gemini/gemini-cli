/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { forkCommand } from './forkCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config, ConversationRecord } from '@google/gemini-cli-core';

// Mock fs module
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

import * as fs from 'node:fs/promises';

describe('forkCommand', () => {
  let mockConfig: Config;
  const testSessionId = 'abc12345-1234-1234-1234-abcdef123456';
  const testShortId = testSessionId.slice(0, 8);

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock config
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue(testSessionId),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/test-project'),
      },
    } as unknown as Config;
  });

  it('should return error when config is null', async () => {
    const nullConfigContext = createMockCommandContext({
      services: {
        config: null,
      },
    });

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(nullConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Cannot fork: No active session.',
    });
  });

  it('should return error when no session files are found', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    vi.mocked(fs.readdir).mockResolvedValue([]);

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Cannot fork: No active session file found.',
    });
  });

  it('should successfully fork a session and return success message', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    const mockConversation: ConversationRecord = {
      sessionId: testSessionId,
      projectHash: 'test-project-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages: [],
      kind: 'main',
    };

    vi.mocked(fs.readdir).mockResolvedValue([
      `session-2025-03-17T12-00-00-${testShortId}.json`,
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.stat).mockResolvedValue({
      mtimeMs: Date.now(),
    } as Awaited<ReturnType<typeof fs.stat>>);

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConversation));

    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(mockContext, '');

    expect(result).toBeDefined();
    if (result && typeof result === 'object' && 'type' in result) {
      expect(result.type).toBe('message');
      if ('messageType' in result) {
        expect(result.messageType).toBe('info');
      }
      if ('content' in result && typeof result.content === 'string') {
        expect(result.content).toMatch(/^Fork saved \([a-f0-9]{8}\)\./);
        expect(result.content).toMatch(
          /Resume with: gemini --resume [a-f0-9]{8}/,
        );
        expect(result.content).toMatch(/Or browse sessions with: \/chat/);
      }
    }

    // Verify write was called
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should handle multiple session files by selecting the most recent', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    const mockConversation: ConversationRecord = {
      sessionId: testSessionId,
      projectHash: 'test-project-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages: [],
      kind: 'main',
    };

    const now = Date.now();
    const olderFile = `session-2025-03-17T10-00-00-${testShortId}.json`;
    const newerFile = `session-2025-03-17T12-00-00-${testShortId}.json`;

    vi.mocked(fs.readdir).mockResolvedValue([
      olderFile,
      newerFile,
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.stat).mockImplementation(async (filePath) => {
      if (filePath.toString().includes('10-00-00')) {
        return { mtimeMs: now - 3600000 } as Awaited<
          ReturnType<typeof fs.stat>
        >;
      }
      return { mtimeMs: now } as Awaited<ReturnType<typeof fs.stat>>;
    });

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConversation));

    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(mockContext, '');

    expect(result).toBeDefined();
    if (result && typeof result === 'object' && 'type' in result) {
      expect(result.type).toBe('message');
    }

    // Verify it read the newer file
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('12-00-00'),
      'utf8',
    );
  });

  it('should return error message when file read fails', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    vi.mocked(fs.readdir).mockResolvedValue([
      `session-2025-03-17T12-00-00-${testShortId}.json`,
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.stat).mockResolvedValue({
      mtimeMs: Date.now(),
    } as Awaited<ReturnType<typeof fs.stat>>);

    vi.mocked(fs.readFile).mockRejectedValue(
      new Error('EACCES: permission denied'),
    );

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to fork session: EACCES: permission denied',
    });
  });

  it('should return error message when file write fails', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    const mockConversation: ConversationRecord = {
      sessionId: testSessionId,
      projectHash: 'test-project-hash',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages: [],
      kind: 'main',
    };

    vi.mocked(fs.readdir).mockResolvedValue([
      `session-2025-03-17T12-00-00-${testShortId}.json`,
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.stat).mockResolvedValue({
      mtimeMs: Date.now(),
    } as Awaited<ReturnType<typeof fs.stat>>);

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConversation));

    vi.mocked(fs.writeFile).mockRejectedValue(
      new Error('ENOSPC: no space left on device'),
    );

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    const result = await forkCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to fork session: ENOSPC: no space left on device',
    });
  });

  it('should create forked conversation with new session ID and updated timestamp', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    const mockConversation: ConversationRecord = {
      sessionId: testSessionId,
      projectHash: 'test-project-hash',
      startTime: '2025-03-17T10:00:00.000Z',
      lastUpdated: '2025-03-17T12:00:00.000Z',
      messages: [],
      kind: 'main',
    };

    vi.mocked(fs.readdir).mockResolvedValue([
      `session-2025-03-17T12-00-00-${testShortId}.json`,
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.stat).mockResolvedValue({
      mtimeMs: Date.now(),
    } as Awaited<ReturnType<typeof fs.stat>>);

    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConversation));

    let writtenConversation: ConversationRecord | null = null;
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      writtenConversation = JSON.parse(content as string);
    });

    if (!forkCommand.action) {
      throw new Error('forkCommand must have an action.');
    }

    await forkCommand.action(mockContext, '');

    expect(writtenConversation).not.toBeNull();
    expect(writtenConversation!.sessionId).not.toBe(testSessionId);
    expect(writtenConversation!.sessionId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
    expect(writtenConversation!.projectHash).toBe(mockConversation.projectHash);
    expect(writtenConversation!.startTime).toBe(mockConversation.startTime);
    expect(writtenConversation!.lastUpdated).not.toBe(
      mockConversation.lastUpdated,
    );
  });
});
