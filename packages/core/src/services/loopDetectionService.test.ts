/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { GeminiClient } from '../core/client.js';
import {
  GeminiEventType,
  type ServerGeminiContentEvent,
  type ServerGeminiStreamEvent,
  type ServerGeminiToolCallRequestEvent,
} from '../core/turn.js';
import * as loggers from '../telemetry/loggers.js';
import { LoopType } from '../telemetry/types.js';
import { LoopDetectionService } from './loopDetectionService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';

vi.mock('../telemetry/loggers.js', () => ({
  logLoopDetected: vi.fn(),
  logLoopDetectionDisabled: vi.fn(),
  logLlmLoopCheck: vi.fn(),
}));

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const CONTENT_CHUNK_SIZE = 50;

describe('LoopDetectionService', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      isInteractive: () => false,
      getDisableLoopDetection: () => false,
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt-id');
    vi.clearAllMocks();
  });

  const createToolCallRequestEvent = (
    name: string,
    args: Record<string, unknown>,
  ): ServerGeminiToolCallRequestEvent => ({
    type: GeminiEventType.ToolCallRequest,
    value: {
      name,
      args,
      callId: 'test-id',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    },
  });

  const createContentEvent = (content: string): ServerGeminiContentEvent => ({
    type: GeminiEventType.Content,
    value: content,
  });

  const createRepetitiveContent = (id: number, length: number): string => {
    const baseString = `This is a unique sentence, id=${id}. `;
    let content = '';
    while (content.length < length) {
      content += baseString;
    }
    return content.slice(0, length);
  };

  describe('Tool Call Loop Detection', () => {
    it(`should not detect a loop for fewer than TOOL_CALL_LOOP_THRESHOLD identical calls`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event).count).toBe(0);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`should detect a loop on the TOOL_CALL_LOOP_THRESHOLD-th identical call`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event).count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          'event.name': 'loop_detected',
          loop_type: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          count: 1,
        }),
      );
    });

    it('should detect a loop on subsequent identical calls', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event).count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          'event.name': 'loop_detected',
          loop_type: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          count: 1,
        }),
      );
    });

    it('should not detect a loop for different tool calls', () => {
      const event1 = createToolCallRequestEvent('testTool', {
        param: 'value1',
      });
      const event2 = createToolCallRequestEvent('testTool', {
        param: 'value2',
      });
      const event3 = createToolCallRequestEvent('anotherTool', {
        param: 'value1',
      });

      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 2; i++) {
        expect(service.addAndCheck(event1).count).toBe(0);
        expect(service.addAndCheck(event2).count).toBe(0);
        expect(service.addAndCheck(event3).count).toBe(0);
      }
    });

    it('should not reset tool call counter for other event types', () => {
      const toolCallEvent = createToolCallRequestEvent('testTool', {
        param: 'value',
      });
      const otherEvent = {
        type: 'thought',
      } as unknown as ServerGeminiStreamEvent;

      // Send events just below the threshold
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(toolCallEvent).count).toBe(0);
      }

      // Send a different event type
      expect(service.addAndCheck(otherEvent).count).toBe(0);

      // Send the tool call event again, which should now trigger the loop
      expect(service.addAndCheck(toolCallEvent).count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          'event.name': 'loop_detected',
          loop_type: LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          count: 1,
        }),
      );
    });

    it('should not detect a loop when disabled for session', () => {
      service.disableForSession();
      expect(loggers.logLoopDetectionDisabled).toHaveBeenCalledTimes(1);
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        expect(service.addAndCheck(event).count).toBe(0);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should stop reporting a loop if disabled after detection', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event).count).toBeGreaterThan(0);

      service.disableForSession();

      // Should now return 0 even though a loop was previously detected
      expect(service.addAndCheck(event).count).toBe(0);
    });

    it('should skip loop detection if disabled in config', () => {
      vi.spyOn(mockConfig, 'getDisableLoopDetection').mockReturnValue(true);
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD + 2; i++) {
        expect(service.addAndCheck(event).count).toBe(0);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });
  });

  describe('Content Loop Detection', () => {
    const generateRandomString = (length: number) => {
      let result = '';
      const characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(
          Math.floor(Math.random() * charactersLength),
        );
      }
      return result;
    };

    it('should not detect a loop for random content', () => {
      service.reset('test-prompt-id');
      for (let i = 0; i < 1000; i++) {
        const content = generateRandomString(10);
        const result = service.addAndCheck(createContentEvent(content));
        expect(result.count).toBe(0);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should detect a loop when a chunk of content repeats consecutively', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        result = service.addAndCheck(createContentEvent(repeatedContent));
      }
      expect(result.count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          'event.name': 'loop_detected',
          loop_type: LoopType.CONTENT_CHANTING_LOOP,
          count: 1,
        }),
      );
    });

    it('should not detect a loop for a list with a long shared prefix', () => {
      service.reset('test-prompt-id');
      const longPrefix =
        'projects/my-google-cloud-project-12345/locations/us-central1/services/';

      let listContent = '';
      for (let i = 0; i < 15; i++) {
        listContent += `- ${longPrefix}${i}\n`;
      }

      const result = service.addAndCheck(createContentEvent(listContent));

      expect(result.count).toBe(0);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should not detect a loop if repetitions are very far apart', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);
      const fillerContent = generateRandomString(2000);

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
        result = service.addAndCheck(createContentEvent(fillerContent));
      }
      expect(result.count).toBe(0);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should detect a loop with longer repeating patterns (e.g. ~150 chars)', () => {
      service.reset('test-prompt-id');
      const longPattern = createRepetitiveContent(1, 150);
      expect(longPattern.length).toBe(150);

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 20; i++) {
        result = service.addAndCheck(createContentEvent(longPattern));
        if (result.count > 0) break;
      }
      expect(result.count).toBe(1);
    });

    it('should detect the specific user-provided loop example', () => {
      service.reset('test-prompt-id');
      const userPattern = `I will not output any text.
  I will just end the turn.
  I am done.
  I will not do anything else.
  I will wait for the user's next command.
`;

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 20; i++) {
        result = service.addAndCheck(createContentEvent(userPattern));
        if (result.count > 0) break;
      }
      expect(result.count).toBe(1);
    });

    it('should detect the second specific user-provided loop example', () => {
      service.reset('test-prompt-id');
      const userPattern =
        'I have added all the requested logs and verified the test file. I will now mark the task as complete.\n  ';

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 20; i++) {
        result = service.addAndCheck(createContentEvent(userPattern));
        if (result.count > 0) break;
      }
      expect(result.count).toBe(1);
    });

    it('should detect a loop of alternating short phrases', () => {
      service.reset('test-prompt-id');
      const alternatingPattern = 'Thinking... Done. ';

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD * 10; i++) {
        result = service.addAndCheck(createContentEvent(alternatingPattern));
        if (result.count > 0) break;
      }
      expect(result.count).toBe(1);
    });

    it('should detect a loop of repeated complex thought processes', () => {
      service.reset('test-prompt-id');
      const thoughtPattern =
        'I need to check the file. The file does not exist. I will create the file. ';

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 20; i++) {
        result = service.addAndCheck(createContentEvent(thoughtPattern));
        if (result.count > 0) break;
      }
      expect(result.count).toBe(1);
    });
  });

  describe('Content Loop Detection with Code Blocks', () => {
    it('should not detect a loop when repetitive content is inside a code block', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      // Start a code block
      service.addAndCheck(createContentEvent('```\n'));

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }

      const result = service.addAndCheck(createContentEvent('\n```'));
      expect(result.count).toBe(0);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should not detect loops when content transitions into a code block', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      // Add repeated content almost to the threshold
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 2; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // Enter a code block
      const codeBlockStart = '```javascript\n';
      const result = service.addAndCheck(createContentEvent(codeBlockStart));
      expect(result.count).toBe(0);

      // Add the same repeated content inside the code block - should not trigger a loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        const resultInside = service.addAndCheck(
          createContentEvent(repeatedContent),
        );
        expect(resultInside.count).toBe(0);
      }

      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should skip loop detection when already inside a code block', () => {
      service.reset('test-prompt-id');
      service.addAndCheck(createContentEvent('Here is some code:\n```\n'));

      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 5; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }

      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should correctly track inCodeBlock state with multiple fence transitions', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      service.addAndCheck(createContentEvent('Normal text '));

      // Enter code block
      const enterResult = service.addAndCheck(createContentEvent('```\n'));
      expect(enterResult.count).toBe(0);

      for (let i = 0; i < 5; i++) {
        const insideResult = service.addAndCheck(
          createContentEvent(repeatedContent),
        );
        expect(insideResult.count).toBe(0);
      }

      // Exit code block
      const exitResult = service.addAndCheck(createContentEvent('```\n'));
      expect(exitResult.count).toBe(0);

      // Re-enter code block
      const reenterResult = service.addAndCheck(
        createContentEvent('```python\n'),
      );
      expect(reenterResult.count).toBe(0);

      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should detect a loop when repetitive content is outside a code block', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      // Content inside a code block
      service.addAndCheck(createContentEvent('```'));
      service.addAndCheck(createContentEvent('\nsome code\n'));
      service.addAndCheck(createContentEvent('```'));

      // Now add repeated content outside the code block
      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        result = service.addAndCheck(createContentEvent(repeatedContent));
      }
      expect(result.count).toBe(1);
    });

    it('should handle content with multiple code blocks and no loops', () => {
      service.reset('test-prompt-id');
      service.addAndCheck(createContentEvent('```\ncode1\n```'));
      service.addAndCheck(createContentEvent('\nsome text\n'));
      const result = service.addAndCheck(createContentEvent('```\ncode2\n```'));

      expect(result.count).toBe(0);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should handle content with mixed code blocks and looping text', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      service.addAndCheck(createContentEvent('```'));
      service.addAndCheck(createContentEvent('\ncode1\n'));
      service.addAndCheck(createContentEvent('```'));

      let result = { count: 0 };
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        result = service.addAndCheck(createContentEvent(repeatedContent));
      }

      expect(result.count).toBe(1);
    });

    it('should not detect a loop for a long code block with some repeating tokens', () => {
      service.reset('test-prompt-id');
      const repeatingTokens =
        'for (let i = 0; i < 10; i++) { console.log(i); }';

      service.addAndCheck(createContentEvent('```\n'));

      for (let i = 0; i < 20; i++) {
        const result = service.addAndCheck(createContentEvent(repeatingTokens));
        expect(result.count).toBe(0);
      }

      const result = service.addAndCheck(createContentEvent('\n```'));
      expect(result.count).toBe(0);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should reset tracking when a code fence is found', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // This should reset tracking and not trigger a loop
      service.addAndCheck(createContentEvent('```'));

      // Add more repeated content after code fence - should not trigger loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }

      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should reset tracking when a table is detected', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // This should reset tracking and not trigger a loop
      service.addAndCheck(createContentEvent('| Column 1 | Column 2 |'));

      // Add more repeated content after table - should not trigger loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }
    });

    it('should reset tracking when a list item is detected', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // This should reset tracking and not trigger a loop
      service.addAndCheck(createContentEvent('* List item'));

      // Add more repeated content after list - should not trigger loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }
    });

    it('should reset tracking when a heading is detected', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // This should reset tracking and not trigger a loop
      service.addAndCheck(createContentEvent('## Heading'));

      // Add more repeated content after heading - should not trigger loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }
    });

    it('should reset tracking when a blockquote is detected', () => {
      service.reset('test-prompt-id');
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);

      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedContent));
      }

      // This should reset tracking and not trigger a loop
      service.addAndCheck(createContentEvent('> Quote text'));

      // Add more repeated content after blockquote - should not trigger loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        const result = service.addAndCheck(createContentEvent(repeatedContent));
        expect(result.count).toBe(0);
      }
    });

    it('should reset tracking for various list item formats', () => {
      const repeatedContent = createRepetitiveContent(1, CONTENT_CHUNK_SIZE);
      const listFormats = ['* item', '- item', '+ item', '1. item', '42. item'];

      listFormats.forEach((listFormat, index) => {
        service.reset('test-prompt-id');

        // Build up to near threshold
        for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
          service.addAndCheck(createContentEvent(repeatedContent));
        }

        // Reset should occur with list item
        service.addAndCheck(createContentEvent('\n' + listFormat));

        // Should not trigger loop after reset
        const newContent = createRepetitiveContent(
          index + 100,
          CONTENT_CHUNK_SIZE,
        );
        for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
          expect(
            service.addAndCheck(createContentEvent(newContent)).count,
          ).toBe(0);
        }
      });
    });
  });

  describe('Reset Functionality', () => {
    it('tool call should reset content count', () => {
      const contentEvent = createContentEvent('Some content.');
      const toolEvent = createToolCallRequestEvent('testTool', {});
      for (let i = 0; i < 9; i++) {
        service.addAndCheck(contentEvent);
      }
      service.addAndCheck(toolEvent);
      expect(
        service.addAndCheck(createContentEvent('Fresh content.')).count,
      ).toBe(0);
    });
  });

  describe('Divider Content Detection', () => {
    it('should not detect a loop for repeating divider-like content', () => {
      service.reset('test-prompt-id');
      const dividerContent = '-'.repeat(CONTENT_CHUNK_SIZE);
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 5; i++) {
        expect(
          service.addAndCheck(createContentEvent(dividerContent)).count,
        ).toBe(0);
      }
    });
  });

  describe('Iterative Loop State', () => {
    it('should correctly transition from Strike 1 to Strike 2', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });

      // Trigger Strike 1
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      const strike1 = service.addAndCheck(event);
      expect(strike1.count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ count: 1 }),
      );

      // Simulate recovery (clearDetection)
      service.clearDetection();

      // Trigger Strike 2
      // For tool calls, the internal counter for that specific key remains,
      // so the VERY NEXT call of the same tool should trigger Strike 2.
      const strike2 = service.addAndCheck(event);
      expect(strike2.count).toBe(2);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ count: 2 }),
      );
    });
  });

  describe('LoopDetectionService LLM Checks', () => {
    let mockGeminiClient: GeminiClient;
    let mockBaseLlmClient: BaseLlmClient;
    let abortController: AbortController;

    beforeEach(() => {
      mockGeminiClient = {
        getHistory: vi.fn().mockReturnValue([]),
      } as unknown as GeminiClient;
      mockBaseLlmClient = { generateJson: vi.fn() } as unknown as BaseLlmClient;
      const mockAvailability = createAvailabilityServiceMock();
      vi.mocked(mockAvailability.snapshot).mockImplementation(() => ({
        available: true,
      }));

      mockConfig = {
        getGeminiClient: () => mockGeminiClient,
        getBaseLlmClient: () => mockBaseLlmClient,
        getDisableLoopDetection: () => false,
        getTelemetryEnabled: () => true,
        getDebugMode: () => false,
        getModel: vi.fn().mockReturnValue('cognitive-loop-v1'),
        modelConfigService: {
          getResolvedConfig: vi.fn().mockImplementation((key) => ({
            model: key.model === 'loop-detection' ? 'flash' : 'main',
            generateContentConfig: {},
          })),
        },
        getModelAvailabilityService: vi.fn().mockReturnValue(mockAvailability),
      } as unknown as Config;

      service = new LoopDetectionService(mockConfig);
      service.reset('test-prompt-id');
      abortController = new AbortController();
    });

    const advanceTurns = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await service.turnStarted(abortController.signal);
      }
    };

    it('should not trigger LLM check before LLM_CHECK_AFTER_TURNS', async () => {
      await advanceTurns(29);
      expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
    });

    it('should trigger LLM check on the 30th turn', async () => {
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValue({ unproductive_state_confidence: 0.1 });
      await advanceTurns(30);
      expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
    });

    it('should detect a cognitive loop when confidence is high', async () => {
      mockBaseLlmClient.generateJson = vi.fn().mockResolvedValue({
        unproductive_state_confidence: 0.95,
        unproductive_state_analysis: 'Looping',
      });
      await advanceTurns(30);
      const result = await service.turnStarted(abortController.signal);
      expect(result.count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          'event.name': 'loop_detected',
          loop_type: LoopType.LLM_DETECTED_LOOP,
          count: 1,
        }),
      );
    });

    it('should not detect a loop when confidence is low', async () => {
      mockBaseLlmClient.generateJson = vi.fn().mockResolvedValue({
        unproductive_state_confidence: 0.5,
        unproductive_state_analysis: 'Ok',
      });
      await advanceTurns(30);
      const result = await service.turnStarted(abortController.signal);
      expect(result.count).toBe(0);
    });

    it('should adjust the check interval based on confidence', async () => {
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValue({ unproductive_state_confidence: 0.0 });
      await advanceTurns(30);
      expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
      await advanceTurns(14);
      expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
      await service.turnStarted(abortController.signal);
      expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(2);
    });

    it('should handle errors from generateJson gracefully', async () => {
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockRejectedValue(new Error('API error'));
      await advanceTurns(30);
      const result = await service.turnStarted(abortController.signal);
      expect(result.count).toBe(0);
    });

    it('should not trigger LLM check when disabled for session', async () => {
      service.disableForSession();
      await advanceTurns(30);
      const result = await service.turnStarted(abortController.signal);
      expect(result.count).toBe(0);
      expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
    });

    it('should prepend user message if history starts with a function call', async () => {
      const history: Content[] = [
        { role: 'model', parts: [{ functionCall: { name: 't', args: {} } }] },
      ];
      vi.mocked(mockGeminiClient.getHistory).mockReturnValue(history);
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValue({ unproductive_state_confidence: 0.1 });
      await advanceTurns(30);
      const calledArg = vi.mocked(mockBaseLlmClient.generateJson).mock
        .calls[0][0];
      expect(calledArg.contents[0].role).toBe('user');
    });

    it('should detect a loop when confidence is exactly equal to the threshold (0.9)', async () => {
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValueOnce({
          unproductive_state_confidence: 0.9,
          unproductive_state_analysis: 'F',
        })
        .mockResolvedValueOnce({
          unproductive_state_confidence: 0.9,
          unproductive_state_analysis: 'M',
        });
      await advanceTurns(30);
      expect((await service.turnStarted(abortController.signal)).count).toBe(1);
      expect(loggers.logLoopDetected).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ count: 1 }),
      );
    });

    it('should not detect a loop when Flash is confident (0.9) but Main model is not (0.89)', async () => {
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValueOnce({
          unproductive_state_confidence: 0.9,
          unproductive_state_analysis: 'F',
        })
        .mockResolvedValueOnce({
          unproductive_state_confidence: 0.89,
          unproductive_state_analysis: 'M',
        });
      await advanceTurns(30);
      expect((await service.turnStarted(abortController.signal)).count).toBe(0);
    });

    it('should only call Flash model if main model is unavailable', async () => {
      const availability = mockConfig.getModelAvailabilityService();
      vi.mocked(availability.snapshot).mockImplementation((model) => ({
        available: model === 'flash',
      }));
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValueOnce({
          unproductive_state_confidence: 0.9,
          unproductive_state_analysis: 'F',
        });
      await advanceTurns(30);
      expect((await service.turnStarted(abortController.signal)).count).toBe(1);
      expect(mockBaseLlmClient.generateJson).toHaveBeenCalledTimes(1);
    });

    it('should include user prompt in LLM check contents when provided', async () => {
      service.reset('test-prompt-id', 'User prompt');
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValue({ unproductive_state_confidence: 0.1 });
      await advanceTurns(30);
      const calledArg = vi.mocked(mockBaseLlmClient.generateJson).mock
        .calls[0][0];
      const hasUserPrompt = calledArg.contents.some(
        (c) =>
          c.role === 'user' &&
          c.parts!.some((p) => p.text?.includes('User prompt')),
      );
      expect(hasUserPrompt).toBe(true);

      // Verify the task prompt itself is correct
      const hasTaskPrompt = calledArg.contents.some(
        (c) =>
          c.role === 'user' &&
          c.parts!.some((p) =>
            p.text?.includes('Consider the original user request'),
          ),
      );
      expect(hasTaskPrompt).toBe(true);
    });

    it('should not include user prompt in contents when not provided', async () => {
      service.reset('test-prompt-id');
      const history: Content[] = [{ role: 'model', parts: [{ text: 'R' }] }];
      vi.mocked(mockGeminiClient.getHistory).mockReturnValue(history);
      mockBaseLlmClient.generateJson = vi
        .fn()
        .mockResolvedValue({ unproductive_state_confidence: 0.1 });
      await advanceTurns(30);
      const calledArg = vi.mocked(mockBaseLlmClient.generateJson).mock
        .calls[0][0];
      expect(calledArg.contents[0].parts![0].text).toBe('R');
    });
  });
});
