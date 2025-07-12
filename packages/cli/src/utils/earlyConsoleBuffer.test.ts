/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { earlyConsoleBuffer } from './earlyConsoleBuffer.js';

describe('earlyConsoleBuffer', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Always stop and clear any existing buffer state first
    earlyConsoleBuffer.stop();
    earlyConsoleBuffer.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Always stop the buffer
    earlyConsoleBuffer.stop();
  });

  describe('basic buffer functionality', () => {
    it('should start and stop buffering', () => {
      earlyConsoleBuffer.start();

      // Messages with MCP STDERR should be buffered
      console.log('MCP STDERR: buffered message');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('MCP STDERR: buffered message');

      earlyConsoleBuffer.stop();
    });

    it('should clear the buffer', () => {
      earlyConsoleBuffer.start();
      console.log('MCP STDERR: test message');

      let messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(1);

      earlyConsoleBuffer.clear();
      messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(0);

      earlyConsoleBuffer.stop();
    });
  });

  describe('console method interception', () => {
    it('should intercept all console methods', () => {
      earlyConsoleBuffer.start();

      // Messages with MCP STDERR should be buffered (not passed to console)
      console.log('MCP STDERR: log message');
      console.warn('MCP STDERR: warn message');
      console.error('MCP STDERR: error message');
      console.debug('MCP STDERR: debug message');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(4);
      expect(messages[0]).toEqual({
        type: 'log',
        content: 'MCP STDERR: log message',
        count: 1,
      });
      expect(messages[1]).toEqual({
        type: 'warn',
        content: 'MCP STDERR: warn message',
        count: 1,
      });
      expect(messages[2]).toEqual({
        type: 'error',
        content: 'MCP STDERR: error message',
        count: 1,
      });
      expect(messages[3]).toEqual({
        type: 'debug',
        content: 'MCP STDERR: debug message',
        count: 1,
      });

      earlyConsoleBuffer.stop();
    });
  });

  describe('message routing based on patterns', () => {
    it('should buffer messages containing "MCP STDERR"', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR: This should be buffered');
      console.log('This is MCP STDERR in the middle');
      console.log('At the end: MCP STDERR');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('MCP STDERR: This should be buffered');
      expect(messages[1].content).toBe('This is MCP STDERR in the middle');
      expect(messages[2].content).toBe('At the end: MCP STDERR');

      earlyConsoleBuffer.stop();
    });

    it('should not buffer messages without "MCP STDERR"', () => {
      earlyConsoleBuffer.start();

      // These should pass through to console
      console.log('Regular log message');
      console.log('Another normal message');
      console.log('MCP but not STDERR');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(0);

      earlyConsoleBuffer.stop();
    });

    it('should handle mixed message routing correctly', () => {
      earlyConsoleBuffer.start();

      console.log('Normal message 1');
      console.log('MCP STDERR: Buffered message 1');
      console.error('Error without pattern');
      console.error('MCP STDERR: Buffered error');
      console.log('Normal message 2');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        type: 'log',
        content: 'MCP STDERR: Buffered message 1',
        count: 1,
      });
      expect(messages[1]).toEqual({
        type: 'error',
        content: 'MCP STDERR: Buffered error',
        count: 1,
      });

      earlyConsoleBuffer.stop();
    });
  });

  describe('getBufferedMessages and buffer clearing', () => {
    it('should return buffered messages and clear the buffer', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR: Message 1');
      console.warn('MCP STDERR: Message 2');

      const firstBatch = earlyConsoleBuffer.getBufferedMessages();
      expect(firstBatch).toHaveLength(2);

      // Buffer should be cleared after getting messages
      const secondBatch = earlyConsoleBuffer.getBufferedMessages();
      expect(secondBatch).toHaveLength(0);

      earlyConsoleBuffer.stop();
    });

    it('should maintain message order', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR: First');
      console.error('MCP STDERR: Second');
      console.warn('MCP STDERR: Third');
      console.debug('MCP STDERR: Fourth');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(4);
      expect(messages[0].content).toBe('MCP STDERR: First');
      expect(messages[1].content).toBe('MCP STDERR: Second');
      expect(messages[2].content).toBe('MCP STDERR: Third');
      expect(messages[3].content).toBe('MCP STDERR: Fourth');

      earlyConsoleBuffer.stop();
    });
  });

  describe('message formatting', () => {
    it('should format messages with util.format', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR: %s %d %j', 'string', 42, { key: 'value' });
      console.error('MCP STDERR: Multiple', 'arguments', 'concatenated');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('MCP STDERR: string 42 {"key":"value"}');
      expect(messages[1].content).toBe(
        'MCP STDERR: Multiple arguments concatenated',
      );

      earlyConsoleBuffer.stop();
    });

    it('should handle various argument types', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR:', undefined);
      console.log('MCP STDERR:', null);
      console.log('MCP STDERR:', true, false);
      console.log('MCP STDERR:', { obj: 'test' });
      console.log('MCP STDERR:', [1, 2, 3]);

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(5);
      expect(messages[0].content).toBe('MCP STDERR: undefined');
      expect(messages[1].content).toBe('MCP STDERR: null');
      expect(messages[2].content).toBe('MCP STDERR: true false');
      expect(messages[3].content).toBe("MCP STDERR: { obj: 'test' }");
      expect(messages[4].content).toBe('MCP STDERR: [ 1, 2, 3 ]');

      earlyConsoleBuffer.stop();
    });
  });

  describe('singleton behavior', () => {
    it('should use the same instance across imports', () => {
      // This is already tested implicitly, but we can verify the instance
      expect(earlyConsoleBuffer).toBeDefined();
      expect(typeof earlyConsoleBuffer.start).toBe('function');
      expect(typeof earlyConsoleBuffer.stop).toBe('function');
      expect(typeof earlyConsoleBuffer.clear).toBe('function');
      expect(typeof earlyConsoleBuffer.getBufferedMessages).toBe('function');
    });

    it('should maintain state across multiple uses', () => {
      earlyConsoleBuffer.start();
      console.log('MCP STDERR: First');

      // Simulate another part of code using the buffer
      const sameBuffer = earlyConsoleBuffer;
      console.log('MCP STDERR: Second');

      const messages = sameBuffer.getBufferedMessages();
      expect(messages).toHaveLength(2);

      earlyConsoleBuffer.stop();
    });
  });

  describe('edge cases', () => {
    it('should handle empty console calls', () => {
      earlyConsoleBuffer.start();

      console.log();
      console.log('MCP STDERR:');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('MCP STDERR:');

      earlyConsoleBuffer.stop();
    });
  });

  describe('target string routing', () => {
    it('should correctly route non-MCP STDERR messages to console', () => {
      earlyConsoleBuffer.start();

      // Test strings that are close but not exact matches
      console.log('MCP');
      console.log('STDERR');
      console.log('MCP_STDERR');
      console.log('MCPSTDERR');
      console.log('Regular message');

      // These messages should pass through (not be buffered)
      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(0);

      earlyConsoleBuffer.stop();
    });

    it('should handle messages from different console methods correctly', () => {
      earlyConsoleBuffer.start();

      // MCP STDERR messages from different methods
      console.log('MCP STDERR: from log');
      console.warn('MCP STDERR: from warn');
      console.error('MCP STDERR: from error');
      console.debug('MCP STDERR: from debug');

      // Regular messages from different methods (should pass through)
      console.log('Regular from log');
      console.warn('Regular from warn');
      console.error('Regular from error');
      console.debug('Regular from debug');

      // Check that MCP STDERR messages were buffered
      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(4);
      expect(messages.filter((m) => m.type === 'log')).toHaveLength(1);
      expect(messages.filter((m) => m.type === 'warn')).toHaveLength(1);
      expect(messages.filter((m) => m.type === 'error')).toHaveLength(1);
      expect(messages.filter((m) => m.type === 'debug')).toHaveLength(1);

      earlyConsoleBuffer.stop();
    });

    it('should verify MCP STDERR messages are sent to buffer only', () => {
      earlyConsoleBuffer.start();

      // These should go to buffer
      console.log('MCP STDERR: Important message');
      console.log('Another MCP STDERR message');

      // These should go to console (not buffered)
      console.log('Normal log');
      console.log('MCP without STDERR');
      console.log('STDERR without MCP');

      // Verify buffer content
      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('MCP STDERR: Important message');
      expect(messages[1].content).toBe('Another MCP STDERR message');

      earlyConsoleBuffer.stop();
    });

    it('should handle pattern anywhere in the message', () => {
      earlyConsoleBuffer.start();

      console.log('Start: MCP STDERR at beginning');
      console.log('Middle has MCP STDERR in it');
      console.log('At the very end is MCP STDERR');
      console.log('MCP STDERR'); // Just the pattern
      console.error('Error: MCP STDERR detected');

      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(5);
      expect(messages.every((m) => m.content.includes('MCP STDERR'))).toBe(
        true,
      );

      earlyConsoleBuffer.stop();
    });
  });

  describe('buffer lifecycle', () => {
    it('should handle start-stop-start cycles correctly', () => {
      // First cycle
      earlyConsoleBuffer.start();
      console.log('MCP STDERR: First cycle');
      console.log('Normal first');

      let messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('MCP STDERR: First cycle');

      earlyConsoleBuffer.stop();

      // Second cycle
      earlyConsoleBuffer.start();
      console.log('MCP STDERR: Second cycle');
      console.log('Normal second');

      messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('MCP STDERR: Second cycle');

      earlyConsoleBuffer.stop();
    });

    it('should not lose messages when stopping without reading', () => {
      earlyConsoleBuffer.start();

      console.log('MCP STDERR: Message 1');
      console.log('MCP STDERR: Message 2');

      // Stop without reading
      earlyConsoleBuffer.stop();

      // Messages should still be available
      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(2);
    });

    it('should handle rapid start/stop cycles', () => {
      for (let i = 0; i < 5; i++) {
        earlyConsoleBuffer.start();
        console.log(`MCP STDERR: Cycle ${i}`);
        earlyConsoleBuffer.stop();
      }

      // Should have accumulated all messages
      const messages = earlyConsoleBuffer.getBufferedMessages();
      expect(messages).toHaveLength(5);
    });
  });
});
