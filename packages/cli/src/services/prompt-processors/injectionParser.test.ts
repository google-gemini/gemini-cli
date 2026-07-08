/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractInjections } from './injectionParser.js';

describe('extractInjections', () => {
  const SHELL_TRIGGER = '!{';
  const AT_FILE_TRIGGER = '@{';

  describe('Basic Functionality', () => {
    it('should return an empty array if no trigger is present', () => {
      const prompt = 'This is a simple prompt without injections.';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([]);
    });

    it('should extract a single, simple injection', () => {
      const prompt = 'Run this command: !{ls -la}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([
        {
          content: 'ls -la',
          startIndex: 18,
          endIndex: 27,
        },
      ]);
    });

    it('should extract multiple injections', () => {
      const prompt = 'First: !{cmd1}, Second: !{cmd2}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        content: 'cmd1',
        startIndex: 7,
        endIndex: 14,
      });
      expect(result[1]).toEqual({
        content: 'cmd2',
        startIndex: 24,
        endIndex: 31,
      });
    });

    it('should handle different triggers (e.g., @{)', () => {
      const prompt = 'Read this file: @{path/to/file.txt}';
      const result = extractInjections(prompt, AT_FILE_TRIGGER);
      expect(result).toEqual([
        {
          content: 'path/to/file.txt',
          startIndex: 16,
          endIndex: 35,
        },
      ]);
    });
  });

  describe('Positioning and Edge Cases', () => {
    it('should handle injections at the start and end of the prompt', () => {
      const prompt = '!{start} middle text !{end}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        content: 'start',
        startIndex: 0,
        endIndex: 8,
      });
      expect(result[1]).toEqual({
        content: 'end',
        startIndex: 21,
        endIndex: 27,
      });
    });

    it('should handle adjacent injections', () => {
      const prompt = '!{A}!{B}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ content: 'A', startIndex: 0, endIndex: 4 });
      expect(result[1]).toEqual({ content: 'B', startIndex: 4, endIndex: 8 });
    });

    it('should handle empty injections', () => {
      const prompt = 'Empty: !{}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([
        {
          content: '',
          startIndex: 7,
          endIndex: 10,
        },
      ]);
    });

    it('should trim whitespace within the content', () => {
      const prompt = '!{  \n command with space  \t }';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([
        {
          content: 'command with space',
          startIndex: 0,
          endIndex: 29,
        },
      ]);
    });

    it('should ignore similar patterns that are not the exact trigger', () => {
      const prompt = 'Not a trigger: !(cmd) or {cmd} or ! {cmd}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([]);
    });

    it('should ignore extra closing braces before the trigger', () => {
      const prompt = 'Ignore this } then !{run}';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([
        {
          content: 'run',
          startIndex: 19,
          endIndex: 25,
        },
      ]);
    });

    it('should stop parsing at the first balanced closing brace (non-greedy)', () => {
      // This tests that the parser doesn't greedily consume extra closing braces
      const prompt = 'Run !{ls -l}} extra braces';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toEqual([
        {
          content: 'ls -l',
          startIndex: 4,
          endIndex: 12,
        },
      ]);
    });
  });

  describe('Nested Braces (Balanced)', () => {
    it('should correctly parse content with simple nested braces (e.g., JSON)', () => {
      const prompt = `Send JSON: !{curl -d '{"key": "value"}'}`;
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(`curl -d '{"key": "value"}'`);
    });

    it('should correctly parse content with shell constructs (e.g., awk)', () => {
      const prompt = `Process text: !{awk '{print $1}' file.txt}`;
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(`awk '{print $1}' file.txt`);
    });

    it('should correctly parse multiple levels of nesting', () => {
      const prompt = `!{level1 {level2 {level3}} suffix}`;
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(`level1 {level2 {level3}} suffix`);
      expect(result[0].endIndex).toBe(prompt.length);
    });

    it('should correctly parse paths containing balanced braces', () => {
      const prompt = 'Analyze @{path/with/{braces}/file.txt}';
      const result = extractInjections(prompt, AT_FILE_TRIGGER);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('path/with/{braces}/file.txt');
    });

    it('should correctly handle an injection containing the trigger itself', () => {
      // This works because the parser counts braces, it doesn't look for the trigger again until the current one is closed.
      const prompt = '!{echo "The trigger is !{ confusing }"}';
      const expectedContent = 'echo "The trigger is !{ confusing }"';
      const result = extractInjections(prompt, SHELL_TRIGGER);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(expectedContent);
    });
  });

  describe('Error Handling (Unbalanced/Unclosed)', () => {
    it('should throw an error for a simple unclosed injection', () => {
      const prompt = 'This prompt has !{an unclosed trigger';
      expect(() => extractInjections(prompt, SHELL_TRIGGER)).toThrow(
        /Invalid syntax: Unclosed injection starting at index 16 \('!{'\)/,
      );
    });

    it('should throw an error if the prompt ends inside a nested block', () => {
      const prompt = 'This fails: !{outer {inner';
      expect(() => extractInjections(prompt, SHELL_TRIGGER)).toThrow(
        /Invalid syntax: Unclosed injection starting at index 12 \('!{'\)/,
      );
    });

    it('should include the context name in the error message if provided', () => {
      const prompt = 'Failing !{command';
      const contextName = 'test-command';
      expect(() =>
        extractInjections(prompt, SHELL_TRIGGER, contextName),
      ).toThrow(
        /Invalid syntax in command 'test-command': Unclosed injection starting at index 8/,
      );
    });

    it('should throw if content contains unbalanced braces (e.g., missing closing)', () => {
      // This is functionally the same as an unclosed injection from the parser's perspective.
      const prompt = 'Analyze @{path/with/braces{example.txt}';
      expect(() => extractInjections(prompt, AT_FILE_TRIGGER)).toThrow(
        /Invalid syntax: Unclosed injection starting at index 8 \('@{'\)/,
      );
    });

    it('should clearly state that unbalanced braces in content are not supported in the error', () => {
      const prompt = 'Analyze @{path/with/braces{example.txt}';
      expect(() => extractInjections(prompt, AT_FILE_TRIGGER)).toThrow(
        /Paths or commands with unbalanced braces are not supported directly/,
      );
    });
  });
});
