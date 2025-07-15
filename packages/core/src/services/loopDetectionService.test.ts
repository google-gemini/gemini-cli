/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopDetectionService } from './loopDetectionService.js';
import {
  GeminiEventType,
  ServerGeminiContentEvent,
  ServerGeminiToolCallRequestEvent,
} from '../core/turn.js';
import { ServerGeminiStreamEvent } from '../core/turn.js';
import { Config } from '../config/config.js';
import * as loggers from '../telemetry/loggers.js';

vi.mock('../telemetry/loggers.js', () => ({
  logLoopDetected: vi.fn(),
}));

const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;

describe('LoopDetectionService', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTelemetryEnabled: () => true,
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
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

  describe('Tool Call Loop Detection', () => {
    it(`should not detect a loop for fewer than TOOL_CALL_LOOP_THRESHOLD identical calls`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`should detect a loop on the TOOL_CALL_LOOP_THRESHOLD-th identical call`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('should detect a loop on subsequent identical calls', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(2);
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
        expect(service.addAndCheck(event1)).toBe(false);
        expect(service.addAndCheck(event2)).toBe(false);
        expect(service.addAndCheck(event3)).toBe(false);
      }
    });
  });

  describe('Content Loop Detection', () => {
    it(`should not detect a loop for fewer than CONTENT_LOOP_THRESHOLD identical content strings`, () => {
      const event = createContentEvent('This is a test sentence.');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`should detect a loop on the CONTENT_LOOP_THRESHOLD-th identical content string`, () => {
      const event = createContentEvent('This is a test sentence.');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('should not detect a loop for different content strings', () => {
      const event1 = createContentEvent('Sentence A');
      const event2 = createContentEvent('Sentence B');
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 2; i++) {
        expect(service.addAndCheck(event1)).toBe(false);
        expect(service.addAndCheck(event2)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });
  });

  describe('Sentence Extraction and Punctuation', () => {
    it('should not check for loops when content has no sentence-ending punctuation', () => {
      const eventNoPunct = createContentEvent('This has no punctuation');
      expect(service.addAndCheck(eventNoPunct)).toBe(false);

      const eventWithPunct = createContentEvent('This has punctuation!');
      expect(service.addAndCheck(eventWithPunct)).toBe(false);
    });

    it('should not treat function calls or method calls as sentence endings', () => {
      // These should not trigger sentence detection, so repeating them many times should never cause a loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(service.addAndCheck(createContentEvent('console.log()'))).toBe(
          false,
        );
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(service.addAndCheck(createContentEvent('obj.method()'))).toBe(
          false,
        );
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(
          service.addAndCheck(createContentEvent('arr.filter().map()')),
        ).toBe(false);
      }

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD + 2; i++) {
        expect(
          service.addAndCheck(
            createContentEvent('if (condition) { return true; }'),
          ),
        ).toBe(false);
      }
    });

    it('should correctly identify actual sentence endings and trigger loop detection', () => {
      // These should trigger sentence detection, so repeating them should eventually cause a loop
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('This is a sentence.')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('This is a sentence.')),
      ).toBe(true);

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('Is this a question? ')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('Is this a question? ')),
      ).toBe(true);

      service.reset();
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        expect(
          service.addAndCheck(createContentEvent('What excitement!\n')),
        ).toBe(false);
      }
      expect(
        service.addAndCheck(createContentEvent('What excitement!\n')),
      ).toBe(true);
    });

    it('should handle content with mixed punctuation', () => {
      service.addAndCheck(createContentEvent('Question?'));
      service.addAndCheck(createContentEvent('Exclamation!'));
      service.addAndCheck(createContentEvent('Period.'));

      // Repeat one of them multiple times
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent('Period.'));
      }
      expect(service.addAndCheck(createContentEvent('Period.'))).toBe(true);
    });

    it('should handle empty sentences after trimming', () => {
      service.addAndCheck(createContentEvent('   .'));
      expect(service.addAndCheck(createContentEvent('Normal sentence.'))).toBe(
        false,
      );
    });

    it('should require at least two sentences for loop detection', () => {
      const event = createContentEvent('Only one sentence.');
      expect(service.addAndCheck(event)).toBe(false);

      // Even repeating the same single sentence shouldn't trigger detection
      for (let i = 0; i < 5; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
    });
  });

  describe('Performance Optimizations', () => {
    it('should cache sentence extraction and only re-extract when content grows significantly', () => {
      // Add initial content
      service.addAndCheck(createContentEvent('First sentence.'));
      service.addAndCheck(createContentEvent('Second sentence.'));

      // Add small amounts of content (shouldn't trigger re-extraction)
      for (let i = 0; i < 10; i++) {
        service.addAndCheck(createContentEvent('X'));
      }
      service.addAndCheck(createContentEvent('.'));

      // Should still work correctly
      expect(service.addAndCheck(createContentEvent('Test.'))).toBe(false);
    });

    it('should re-extract sentences when content grows by more than 100 characters', () => {
      service.addAndCheck(createContentEvent('Initial sentence.'));

      // Add enough content to trigger re-extraction
      const longContent = 'X'.repeat(101);
      service.addAndCheck(createContentEvent(longContent + '.'));

      // Should work correctly after re-extraction
      expect(service.addAndCheck(createContentEvent('Test.'))).toBe(false);
    });

    it('should use indexOf for efficient counting instead of regex', () => {
      const repeatedSentence = 'This is a repeated sentence.';

      // Build up content with the sentence repeated
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(createContentEvent(repeatedSentence));
      }

      // The threshold should be reached
      expect(service.addAndCheck(createContentEvent(repeatedSentence))).toBe(
        true,
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const event = createContentEvent('');
      expect(service.addAndCheck(event)).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('tool call should reset content count', () => {
      const contentEvent = createContentEvent('Some content.');
      const toolEvent = createToolCallRequestEvent('testTool', {
        param: 'value',
      });
      for (let i = 0; i < 9; i++) {
        service.addAndCheck(contentEvent);
      }

      service.addAndCheck(toolEvent);

      // Should start fresh
      expect(service.addAndCheck(createContentEvent('Fresh content.'))).toBe(
        false,
      );
    });
  });

  describe('General Behavior', () => {
    it('should return false for unhandled event types', () => {
      const otherEvent = {
        type: 'unhandled_event',
      } as unknown as ServerGeminiStreamEvent;
      expect(service.addAndCheck(otherEvent)).toBe(false);
      expect(service.addAndCheck(otherEvent)).toBe(false);
    });
  });
});
