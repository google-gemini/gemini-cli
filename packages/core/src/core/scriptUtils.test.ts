/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  mockGenerateContentStreamText,
  mockGenerateContentText,
  userText,
  isFakeResponse,
  isFakeRequest,
  extractUserPrompts,
  extractFakeResponses,
  type ScriptItem,
} from './scriptUtils.js';

describe('scriptUtils', () => {
  describe('mockGenerateContentStreamText', () => {
    it('creates a valid FakeResponse for generateContentStream', () => {
      const result = mockGenerateContentStreamText('hello stream');
      expect(result.method).toBe('generateContentStream');
      expect(Array.isArray(result.response)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseArray = result.response as any[];
      expect(responseArray[0].candidates[0].content.parts[0].text).toBe(
        'hello stream',
      );
      expect(responseArray[0].candidates[0].finishReason).toBe('STOP');
    });
  });

  describe('mockGenerateContentText', () => {
    it('creates a valid FakeResponse for generateContent', () => {
      const result = mockGenerateContentText('hello block');
      expect(result.method).toBe('generateContent');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseObj = result.response as any;
      expect(responseObj.candidates[0].content.parts[0].text).toBe(
        'hello block',
      );
      expect(responseObj.candidates[0].finishReason).toBe('STOP');
    });
  });

  describe('userText', () => {
    it('creates a valid FakeRequest', () => {
      const result = userText('user input');
      expect(result.method).toBe('userText');
      expect(result.text).toBe('user input');
    });
  });

  describe('Type Guards', () => {
    it('correctly identifies FakeResponse vs FakeRequest', () => {
      const fakeRes = mockGenerateContentText('test');
      const fakeReq = userText('test');

      expect(isFakeResponse(fakeRes)).toBe(true);
      expect(isFakeResponse(fakeReq)).toBe(false);

      expect(isFakeRequest(fakeReq)).toBe(true);
      expect(isFakeRequest(fakeRes)).toBe(false);
    });
  });

  describe('extractUserPrompts and extractFakeResponses', () => {
    it('correctly partitions a mixed script array', () => {
      const script: ScriptItem[] = [
        userText('prompt 1'),
        mockGenerateContentText('response 1'),
        userText('prompt 2'),
        mockGenerateContentStreamText('response 2'),
      ];

      const prompts = extractUserPrompts(script);
      expect(prompts).toEqual(['prompt 1', 'prompt 2']);

      const responses = extractFakeResponses(script);
      expect(responses).toHaveLength(2);
      expect(responses[0].method).toBe('generateContent');
      expect(responses[1].method).toBe('generateContentStream');
    });

    it('handles empty scripts', () => {
      expect(extractUserPrompts([])).toEqual([]);
      expect(extractFakeResponses([])).toEqual([]);
    });

    it('handles scripts with only one type', () => {
      const justPrompts = [userText('a'), userText('b')];
      expect(extractUserPrompts(justPrompts)).toEqual(['a', 'b']);
      expect(extractFakeResponses(justPrompts)).toEqual([]);

      const justResponses = [
        mockGenerateContentText('a'),
        mockGenerateContentText('b'),
      ];
      expect(extractUserPrompts(justResponses)).toEqual([]);
      expect(extractFakeResponses(justResponses)).toHaveLength(2);
    });
  });
});
