/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockInstance } from 'vitest';
import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationRecord } from './chatRecordingService.js';
import { ChatRecordingService } from './chatRecordingService.js';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('node:fs');
vi.mock('node:path');
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'mocked-hash'),
    })),
  })),
}));
vi.mock('../utils/paths.js');

describe('ChatRecordingService Repro', () => {
  let chatRecordingService: ChatRecordingService;
  let mockConfig: Config;

  let mkdirSyncSpy: MockInstance<typeof fs.mkdirSync>;
  let writeFileSyncSpy: MockInstance<typeof fs.writeFileSync>;

  beforeEach(() => {
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi
          .fn()
          .mockReturnValue('/test/project/root/.gemini/tmp'),
      },
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn().mockReturnValue({
          displayName: 'Test Tool',
          description: 'A test tool',
          isOutputMarkdown: false,
        }),
      }),
    } as unknown as Config;

    vi.mocked(getProjectHash).mockReturnValue('test-project-hash');
    vi.mocked(randomUUID).mockReturnValue('this-is-a-test-uuid');
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    vi.mocked(path.dirname).mockImplementation((p) =>
      p.split('/').slice(0, -1).join('/'),
    );

    chatRecordingService = new ChatRecordingService(mockConfig);

    mkdirSyncSpy = vi
      .spyOn(fs, 'mkdirSync')
      .mockImplementation(() => undefined);

    writeFileSyncSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should ensure directory exists before writing conversation file when resuming session', () => {
    const _readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        sessionId: 'old-session-id',
        projectHash: 'test-project-hash',
        messages: [],
      }),
    );

    // Initialize with resumed session
    chatRecordingService.initialize({
      filePath: '/test/project/root/.gemini/tmp/chats/session.json',
      conversation: {
        sessionId: 'old-session-id',
      } as ConversationRecord,
    });

    // mkdirSync should NOT be called during initialization for resumed session
    expect(mkdirSyncSpy).not.toHaveBeenCalled();

    // Reset mocks to clear calls from initialize (although mkdirSync wasn't called)
    mkdirSyncSpy.mockClear();
    writeFileSyncSpy.mockClear();

    // Record a message which triggers writeConversation
    chatRecordingService.recordMessage({
      type: 'user',
      content: 'Hello',
      model: 'gemini-pro',
    });

    // EXPECTATION: mkdirSync SHOULD be called to ensure directory exists before writing
    expect(mkdirSyncSpy).toHaveBeenCalledWith(
      '/test/project/root/.gemini/tmp/chats',
      { recursive: true },
    );

    expect(writeFileSyncSpy).toHaveBeenCalled();
  });
});
