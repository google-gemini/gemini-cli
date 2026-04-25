/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import open from 'open';
import path from 'node:path';
import { bugCommand } from './bugCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { getVersion, type Config } from '@google/gemini-cli-core';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatBytes } from '../utils/formatters.js';
import { MessageType } from '../types.js';
import { captureHeapSnapshot } from '../utils/memorySnapshot.js';

const { memoryUsageMock } = vi.hoisted(() => ({
  memoryUsageMock: vi.fn(() => ({
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
  })),
}));

// Mock dependencies
vi.mock('open');
vi.mock('../utils/formatters.js');
vi.mock('../utils/memorySnapshot.js', () => ({
  captureHeapSnapshot: vi.fn(),
  MEMORY_SNAPSHOT_AUTO_THRESHOLD_BYTES: 2 * 1024 * 1024 * 1024,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: vi.fn().mockResolvedValue({ size: 4096 }),
  };
});
vi.mock('../utils/historyExportUtils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/historyExportUtils.js')>();
  return {
    ...actual,
    exportHistoryToFile: vi.fn(),
  };
});
import { exportHistoryToFile } from '../utils/historyExportUtils.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: () => ({
        getDetectedIdeDisplayName: vi.fn().mockReturnValue('VSCode'),
      }),
    },
    sessionId: 'test-session-id',
    getVersion: vi.fn(),
    INITIAL_HISTORY_LENGTH: 1,
    debugLogger: {
      error: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
  };
});
vi.mock('node:process', () => ({
  default: {
    platform: 'test-platform',
    version: 'v20.0.0',
    // Keep other necessary process properties if needed by other parts of the code
    env: process.env,
    memoryUsage: memoryUsageMock,
  },
}));

vi.mock('../utils/terminalCapabilityManager.js', () => ({
  terminalCapabilityManager: {
    getTerminalName: vi.fn().mockReturnValue('Test Terminal'),
    getTerminalBackgroundColor: vi.fn().mockReturnValue('#000000'),
    isKittyProtocolEnabled: vi.fn().mockReturnValue(true),
  },
}));

describe('bugCommand', () => {
  beforeEach(() => {
    vi.mocked(getVersion).mockResolvedValue('0.1.0');
    vi.mocked(formatBytes).mockReturnValue('100 MB');
    memoryUsageMock.mockReturnValue({
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
    vi.stubEnv('SANDBOX', 'gemini-test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should generate the default GitHub issue URL', async () => {
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getModel: () => 'gemini-pro',
            getBugCommand: () => undefined,
            getIdeMode: () => true,
            getContentGeneratorConfig: () => ({ authType: 'oauth-personal' }),
            getSessionId: vi.fn().mockReturnValue('test-session-id'),
          } as unknown as Config,
          geminiClient: {
            getChat: () => ({
              getHistory: () => [],
            }),
          },
        },
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A test bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Session ID:** test-session-id
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Auth Type:** oauth-personal
* **Memory Usage:** 100 MB
* **Terminal Name:** Test Terminal
* **Terminal Background:** #000000
* **Kitty Keyboard Protocol:** Supported
* **IDE Client:** VSCode
`;
    const expectedUrl = `https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title=A%20test%20bug&info=${encodeURIComponent(expectedInfo)}&problem=A%20test%20bug`;

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  it('should export chat history if available', async () => {
    const history = [
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi' }] },
    ];
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getModel: () => 'gemini-pro',
            getBugCommand: () => undefined,
            getIdeMode: () => true,
            getContentGeneratorConfig: () => ({ authType: 'vertex-ai' }),
            storage: {
              getProjectTempDir: () => '/tmp/gemini',
            },
            getSessionId: vi.fn().mockReturnValue('test-session-id'),
          } as unknown as Config,
          geminiClient: {
            getChat: () => ({
              getHistory: () => history,
            }),
          },
        },
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'Bug with history');

    const expectedPath = path.join(
      '/tmp/gemini',
      'bug-report-history-1704067200000.json',
    );
    expect(exportHistoryToFile).toHaveBeenCalledWith({
      history,
      filePath: expectedPath,
    });

    const addItemCall = vi.mocked(mockContext.ui.addItem).mock.calls[0];
    const messageText = addItemCall[0].text;
    expect(messageText).toContain(expectedPath);
    expect(messageText).toContain('📄 **Chat History Exported**');
    expect(messageText).toContain('Privacy Disclaimer:');
    expect(messageText).not.toContain('additional-context=');
    expect(messageText).toContain('problem=');
    const reminder =
      '\n\n[ACTION REQUIRED] 📎 PLEASE ATTACH THE EXPORTED CHAT HISTORY JSON FILE TO THIS ISSUE IF YOU FEEL COMFORTABLE SHARING IT.';
    expect(messageText).toContain(encodeURIComponent(reminder));
  });

  it('should use a custom URL template from config if provided', async () => {
    const customTemplate =
      'https://internal.bug-tracker.com/new?desc={title}&details={info}';
    const mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getModel: () => 'gemini-pro',
            getBugCommand: () => ({ urlTemplate: customTemplate }),
            getIdeMode: () => true,
            getContentGeneratorConfig: () => ({ authType: 'vertex-ai' }),
            getSessionId: vi.fn().mockReturnValue('test-session-id'),
          } as unknown as Config,
          geminiClient: {
            getChat: () => ({
              getHistory: () => [],
            }),
          },
        },
      },
    });

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(mockContext, 'A custom bug');

    const expectedInfo = `
* **CLI Version:** 0.1.0
* **Git Commit:** ${GIT_COMMIT_INFO}
* **Session ID:** test-session-id
* **Operating System:** test-platform v20.0.0
* **Sandbox Environment:** test
* **Model Version:** gemini-pro
* **Auth Type:** vertex-ai
* **Memory Usage:** 100 MB
* **Terminal Name:** Test Terminal
* **Terminal Background:** #000000
* **Kitty Keyboard Protocol:** Supported
* **IDE Client:** VSCode
`;
    const expectedUrl = customTemplate
      .replace('{title}', encodeURIComponent('A custom bug'))
      .replace('{info}', encodeURIComponent(expectedInfo));

    expect(open).toHaveBeenCalledWith(expectedUrl);
  });

  const buildHighMemoryContext = (tempDir: string | undefined) =>
    createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getModel: () => 'gemini-pro',
            getBugCommand: () => undefined,
            getIdeMode: () => false,
            getContentGeneratorConfig: () => ({ authType: 'oauth-personal' }),
            storage: tempDir ? { getProjectTempDir: () => tempDir } : undefined,
            getSessionId: vi.fn().mockReturnValue('test-session-id'),
          } as unknown as Config,
          geminiClient: { getChat: () => ({ getHistory: () => [] }) },
        },
      },
    });

  it('captures a heap snapshot AFTER opening the bug URL when RSS exceeds 2 GB', async () => {
    memoryUsageMock.mockReturnValue({
      rss: 3 * 1024 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
    vi.mocked(captureHeapSnapshot).mockResolvedValueOnce(undefined);

    const tempDir = path.join('/tmp', 'gemini-test');
    const context = buildHighMemoryContext(tempDir);

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(context, 'A memory bug');

    const now = new Date('2024-01-01T00:00:00Z').getTime();
    const expectedSnapshotPath = path.join(
      tempDir,
      `bug-memory-${now}.heapsnapshot`,
    );
    expect(captureHeapSnapshot).toHaveBeenCalledWith(expectedSnapshotPath);

    const addItem = vi.mocked(context.ui.addItem);
    const callOrder = addItem.mock.invocationCallOrder;
    const openOrder = vi.mocked(open).mock.invocationCallOrder[0];
    // The URL message must precede the "capturing" message so the user sees
    // the URL before the 20+ second snapshot starts.
    expect(callOrder[0]).toBeLessThan(openOrder);
    expect(callOrder[1]).toBeGreaterThan(openOrder);
    expect(addItem.mock.calls[1][0].text).toContain('High memory usage');
    expect(addItem.mock.calls[2][0].text).toContain('Heap snapshot saved');
    expect(addItem.mock.calls[2][0].text).toContain(expectedSnapshotPath);
    expect(addItem.mock.calls[2][0].type).toBe(MessageType.INFO);
  });

  it('skips auto-capture when RSS is below the 2 GB threshold', async () => {
    memoryUsageMock.mockReturnValue({
      rss: 1 * 1024 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
    const context = buildHighMemoryContext('/tmp/gemini-test');

    if (!bugCommand.action) throw new Error('Action is not defined');
    await bugCommand.action(context, 'A light bug');

    expect(captureHeapSnapshot).not.toHaveBeenCalled();
  });

  it('reports an error if the auto-capture fails but does not throw', async () => {
    memoryUsageMock.mockReturnValue({
      rss: 3 * 1024 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
    vi.mocked(captureHeapSnapshot).mockRejectedValueOnce(
      new Error('inspector failure'),
    );
    const context = buildHighMemoryContext('/tmp/gemini-test');

    if (!bugCommand.action) throw new Error('Action is not defined');
    await expect(
      bugCommand.action(context, 'A memory bug'),
    ).resolves.toBeUndefined();

    const addItem = vi.mocked(context.ui.addItem).mock.calls;
    const lastCall = addItem[addItem.length - 1][0];
    expect(lastCall.type).toBe(MessageType.ERROR);
    expect(lastCall.text).toContain('inspector failure');
  });
});
