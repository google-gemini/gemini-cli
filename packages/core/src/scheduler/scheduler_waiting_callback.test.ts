/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler } from './scheduler.js';
import { resolveConfirmation } from './confirmation.js';
import { checkPolicy } from './policy.js';
import { PolicyDecision } from '../policy/types.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { MockTool } from '../test-utils/mock-tool.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { Config } from '../config/config.js';
import type { ToolCallRequestInfo } from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

vi.mock('./confirmation.js');
vi.mock('./policy.js');

describe('Scheduler waiting callback', () => {
  let mockConfig: Config;
  let messageBus: MessageBus;
  let toolRegistry: ToolRegistry;
  let mockTool: MockTool;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    mockConfig = makeFakeConfig();

    // Override methods to use our mocks
    vi.spyOn(mockConfig, 'getMessageBus').mockReturnValue(messageBus);

    mockTool = new MockTool({ name: 'test_tool' });
    toolRegistry = new ToolRegistry(mockConfig, messageBus);
    vi.spyOn(mockConfig, 'getToolRegistry').mockReturnValue(toolRegistry);
    toolRegistry.registerTool(mockTool);

    vi.mocked(checkPolicy).mockResolvedValue({
      decision: PolicyDecision.ASK_USER,
      rule: undefined,
    });
  });

  it('should trigger onWaitingForConfirmation callback', async () => {
    const onWaitingForConfirmation = vi.fn();
    const scheduler = new Scheduler({
      config: mockConfig,
      messageBus,
      getPreferredEditor: () => undefined,
      schedulerId: 'test-scheduler',
      onWaitingForConfirmation,
    });

    vi.mocked(resolveConfirmation).mockResolvedValue({
      outcome: ToolConfirmationOutcome.ProceedOnce,
    });

    const req: ToolCallRequestInfo = {
      callId: 'call-1',
      name: 'test_tool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'test-prompt',
    };

    await scheduler.schedule(req, new AbortController().signal);

    expect(resolveConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        onWaitingForConfirmation,
      }),
    );
  });
});
