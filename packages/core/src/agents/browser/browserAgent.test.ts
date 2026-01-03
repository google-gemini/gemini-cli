/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { BrowserAgent } from './browserAgent.js';
import type { Config } from '../../config/config.js';
import type { ContentGenerator } from '../../core/contentGenerator.js';
import type { BrowserManager } from './browserManager.js';

import type { McpClient } from '../../tools/mcp-client.js';

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
  },
}));

// Mock BrowserManager and BrowserTools classes (not instances, but the module exports if needed)
// Mock BrowserManager and BrowserTools classes (not instances, but the module exports if needed)
// But BrowserAgent instantiates them. We should mock the modules so the constructor returns mocks.
vi.mock('./browserManager.js', () => ({
  BrowserManager: vi.fn().mockImplementation(() => ({
    getMcpClient: vi.fn(),
    ensureConnection: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('./browserTools.js', () => ({
  BrowserTools: vi.fn().mockImplementation(() => ({
    showOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    updateBorderOverlay: vi.fn(),
    navigate: vi.fn(),
    // Add other methods as needed by runTask logic
  })),
}));

// Mock GeminiChat
const mockSendMessageStream = vi.fn();
const mockGetHistory = vi.fn().mockReturnValue([]);

vi.mock('../../core/geminiChat.js', () => ({
  GeminiChat: vi.fn().mockImplementation(() => ({
    sendMessageStream: mockSendMessageStream,
    getHistory: mockGetHistory,
  })),
  StreamEventType: { CHUNK: 'chunk' },
}));

describe('BrowserAgent', () => {
  let browserAgent: BrowserAgent;
  let mockGenerator: ContentGenerator;
  let mockConfig: Config;
  // Access mocked instances
  let mockBrowserManagerInstance: BrowserManager;
  let mockMcpClient: McpClient;

  beforeEach(async () => {
    mockConfig = {
      getActiveModel: vi.fn().mockReturnValue('gemini-2.0-flash-exp'),
      browserAgentSettings: { model: 'gemini-2.0-flash-exp' },
    } as unknown as Config;

    mockGenerator = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    mockMcpClient = {
      callTool: vi.fn().mockResolvedValue({ content: [] }),
    } as unknown as McpClient;

    // Instantiate agent
    browserAgent = new BrowserAgent(mockGenerator, mockConfig);

    // Retrieve the mocked instances created by the constructor
    mockBrowserManagerInstance = (
      browserAgent as unknown as { browserManager: BrowserManager }
    ).browserManager;

    // Setup default behavior
    (mockBrowserManagerInstance.getMcpClient as Mock).mockResolvedValue(
      mockMcpClient,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should run task and call tools using streaming', async () => {
    // Mock streaming response: Call 'navigate'
    const mockStream = (async function* () {
      yield {
        type: 'chunk',
        value: {
          functionCalls: [
            {
              name: 'navigate',
              args: { url: 'https://example.com' },
            },
          ],
          candidates: [
            {
              content: {
                parts: [{ text: 'Okay, navigating.' }],
              },
            },
          ],
        },
      };
    })();

    mockSendMessageStream.mockReturnValue(mockStream);

    // Mock tool result
    // Navigate is now direct MCP call, mocked at client level

    await browserAgent.runTask(
      'Go to example.com',
      new AbortController().signal,
    );

    expect(mockBrowserManagerInstance.ensureConnection).toHaveBeenCalled();
    expect(mockMcpClient.callTool).toHaveBeenCalledWith('navigate_page', {
      url: 'https://example.com',
    });
  });

  it('should captures DOM snapshot but NOT screenshot by default', async () => {
    // Mock streaming response (done)
    const mockStream = (async function* () {
      yield {
        type: 'chunk',
        value: {
          candidates: [{ content: { parts: [{ text: 'Done' }] } }],
        },
      };
    })();
    mockSendMessageStream.mockReturnValue(mockStream);

    await browserAgent.runTask('Check page', new AbortController().signal);

    // Should call take_snapshot (DOM)
    expect(mockMcpClient.callTool).toHaveBeenCalledWith('take_snapshot', {
      verbose: false,
    });

    // Should NOT call take_screenshot (unless fallback fallback logic was triggered, but we shouldn't see it if we don't delegate)
    expect(mockMcpClient.callTool).not.toHaveBeenCalledWith(
      'take_screenshot',
      expect.anything(),
    );
  });

  it('should auto-recover from stale snapshot errors', async () => {
    // 1. First model call: Click something
    // 2. Tool returns "stale snapshot"
    // 3. Agent should catch this, call take_snapshot, append it, and continue (or just return it as tool result)

    const mockStream = (async function* () {
      yield {
        type: 'chunk',
        value: {
          functionCalls: [
            {
              name: 'click',
              args: { uid: '123' },
            },
          ],
        },
      };
    })();
    mockSendMessageStream.mockReturnValueOnce(mockStream);

    // Mock click returning stale error
    (mockMcpClient.callTool as Mock).mockImplementation(
      async (name: string) => {
        if (name === 'click') {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: This uid is coming from a stale snapshot.',
              },
            ],
          };
        }
        if (name === 'take_snapshot') {
          return {
            content: [
              {
                type: 'text',
                text: '## Latest page snapshot\nuid=124 button "New Login"',
              },
            ],
          };
        }
        return { content: [] };
      },
    );

    await browserAgent.runTask('Click login', new AbortController().signal);

    // Verify click was called
    expect(mockMcpClient.callTool).toHaveBeenCalledWith(
      'click',
      expect.anything(),
    );

    // Verify take_snapshot was called AUTOMATICALLY
    expect(mockMcpClient.callTool).toHaveBeenCalledWith('take_snapshot', {
      verbose: false,
    });
  });
});
