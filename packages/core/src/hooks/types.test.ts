/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createHookOutput,
  DefaultHookOutput,
  BeforeModelHookOutput,
  BeforeToolSelectionHookOutput,
  AfterModelHookOutput,
  HookEventName,
  HookType,
  BeforeToolHookOutput,
} from './types.js';
import { defaultHookTranslator } from './hookTranslator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  ToolConfig,
} from '@google/genai';
import type { LLMRequest, LLMResponse } from './hookTranslator.js';
import type { HookDecision } from './types.js';

vi.mock('./hookTranslator.js', () => ({
  defaultHookTranslator: {
    fromHookLLMResponse: vi.fn(
      (response: LLMResponse) => response as unknown as GenerateContentResponse,
    ),
    fromHookLLMRequest: vi.fn(
      (request: LLMRequest, target: GenerateContentParameters) => ({
        ...target,
        ...request,
      }),
    ),
    fromHookToolConfig: vi.fn((config: ToolConfig) => config),
  },
}));

describe('Hook Types', () => {
  describe('HookEventName', () => {
    it('should contain all required event names', () => {
      const expectedEvents = [
        'BeforeTool',
        'AfterTool',
        'BeforeAgent',
        'Notification',
        'AfterAgent',
        'SessionStart',
        'SessionEnd',
        'PreCompress',
        'BeforeModel',
        'AfterModel',
        'BeforeToolSelection',
      ];

      for (const event of expectedEvents) {
        expect(Object.values(HookEventName)).toContain(event);
      }
    });
  });

  describe('HookType', () => {
    it('should contain command type', () => {
      expect(HookType.Command).toBe('command');
    });
  });
});

describe('Hook Output Classes', () => {
  describe('createHookOutput', () => {
    it('should return DefaultHookOutput for unknown event names', () => {
      const output = createHookOutput('UnknownEvent', {});
      expect(output).toBeInstanceOf(DefaultHookOutput);
      expect(output).not.toBeInstanceOf(BeforeModelHookOutput);
      expect(output).not.toBeInstanceOf(AfterModelHookOutput);
      expect(output).not.toBeInstanceOf(BeforeToolSelectionHookOutput);
    });

    it('should return BeforeModelHookOutput for BeforeModel event', () => {
      const output = createHookOutput(HookEventName.BeforeModel, {});
      expect(output).toBeInstanceOf(BeforeModelHookOutput);
    });

    it('should return AfterModelHookOutput for AfterModel event', () => {
      const output = createHookOutput(HookEventName.AfterModel, {});
      expect(output).toBeInstanceOf(AfterModelHookOutput);
    });

    it('should return BeforeToolSelectionHookOutput for BeforeToolSelection event', () => {
      const output = createHookOutput(HookEventName.BeforeToolSelection, {});
      expect(output).toBeInstanceOf(BeforeToolSelectionHookOutput);
    });

    it('should return BeforeToolHookOutput for BeforeTool event', () => {
      const output = createHookOutput(HookEventName.BeforeTool, {});
      expect(output).toBeInstanceOf(BeforeToolHookOutput);
    });
  });

  describe('DefaultHookOutput', () => {
    it('should construct with provided data', () => {
      const data = {
        continue: false,
        stopReason: 'test stop',
        suppressOutput: true,
        systemMessage: 'test system message',
        decision: 'block' as HookDecision,
        reason: 'test reason',
        hookSpecificOutput: { key: 'value' },
      };
      const output = new DefaultHookOutput(data);
      expect(output.continue).toBe(data.continue);
      expect(output.stopReason).toBe(data.stopReason);
      expect(output.suppressOutput).toBe(data.suppressOutput);
      expect(output.systemMessage).toBe(data.systemMessage);
      expect(output.decision).toBe(data.decision);
      expect(output.reason).toBe(data.reason);
      expect(output.hookSpecificOutput).toEqual(data.hookSpecificOutput);
    });

    it('should return false for isBlockingDecision if decision is not block or deny', () => {
      const output1 = new DefaultHookOutput({ decision: 'approve' });
      expect(output1.isBlockingDecision()).toBe(false);
      const output2 = new DefaultHookOutput({ decision: undefined });
      expect(output2.isBlockingDecision()).toBe(false);
    });

    it('should return true for isBlockingDecision if decision is block or deny', () => {
      const output1 = new DefaultHookOutput({ decision: 'block' });
      expect(output1.isBlockingDecision()).toBe(true);
      const output2 = new DefaultHookOutput({ decision: 'deny' });
      expect(output2.isBlockingDecision()).toBe(true);
    });

    it('should return true for shouldStopExecution if continue is false', () => {
      const output = new DefaultHookOutput({ continue: false });
      expect(output.shouldStopExecution()).toBe(true);
    });

    it('should return false for shouldStopExecution if continue is true or undefined', () => {
      const output1 = new DefaultHookOutput({ continue: true });
      expect(output1.shouldStopExecution()).toBe(false);
      const output2 = new DefaultHookOutput({});
      expect(output2.shouldStopExecution()).toBe(false);
    });

    it('should return reason if available', () => {
      const output = new DefaultHookOutput({ reason: 'specific reason' });
      expect(output.getEffectiveReason()).toBe('specific reason');
    });

    it('should return stopReason if reason is not available', () => {
      const output = new DefaultHookOutput({ stopReason: 'stop reason' });
      expect(output.getEffectiveReason()).toBe('stop reason');
    });

    it('should return "No reason provided" if neither reason nor stopReason are available', () => {
      const output = new DefaultHookOutput({});
      expect(output.getEffectiveReason()).toBe('No reason provided');
    });

    it('applyLLMRequestModifications should return target unchanged', () => {
      const target: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [],
      };
      const output = new DefaultHookOutput({});
      expect(output.applyLLMRequestModifications(target)).toBe(target);
    });

    it('applyToolConfigModifications should return target unchanged', () => {
      const target = { toolConfig: {}, tools: [] };
      const output = new DefaultHookOutput({});
      expect(output.applyToolConfigModifications(target)).toBe(target);
    });

    it('getAdditionalContext should return additionalContext if present', () => {
      const output = new DefaultHookOutput({
        hookSpecificOutput: { additionalContext: 'some context' },
      });
      expect(output.getAdditionalContext()).toBe('some context');
    });

    it('getAdditionalContext should return undefined if additionalContext is not present', () => {
      const output = new DefaultHookOutput({
        hookSpecificOutput: { other: 'value' },
      });
      expect(output.getAdditionalContext()).toBeUndefined();
    });

    it('getAdditionalContext should return undefined if hookSpecificOutput is undefined', () => {
      const output = new DefaultHookOutput({});
      expect(output.getAdditionalContext()).toBeUndefined();
    });

    it('getBlockingError should return blocked: true and reason if blocking decision', () => {
      const output = new DefaultHookOutput({
        decision: 'block',
        reason: 'blocked by hook',
      });
      expect(output.getBlockingError()).toEqual({
        blocked: true,
        reason: 'blocked by hook',
      });
    });

    it('getBlockingError should return blocked: false if not blocking decision', () => {
      const output = new DefaultHookOutput({ decision: 'approve' });
      expect(output.getBlockingError()).toEqual({ blocked: false, reason: '' });
    });
  });

  describe('BeforeModelHookOutput', () => {
    it('getSyntheticResponse should return synthetic response if llm_response is present', () => {
      const mockResponse: LLMResponse = { candidates: [] };
      const output = new BeforeModelHookOutput({
        hookSpecificOutput: { llm_response: mockResponse },
      });
      expect(output.getSyntheticResponse()).toEqual(mockResponse);
      expect(defaultHookTranslator.fromHookLLMResponse).toHaveBeenCalledWith(
        mockResponse,
      );
    });

    it('getSyntheticResponse should return undefined if llm_response is not present', () => {
      const output = new BeforeModelHookOutput({});
      expect(output.getSyntheticResponse()).toBeUndefined();
    });

    it('applyLLMRequestModifications should apply modifications if llm_request is present', () => {
      const target: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [{ parts: [{ text: 'original' }] }],
      };
      const mockRequest: Partial<LLMRequest> = {
        messages: [{ role: 'user', content: 'modified' }],
      };
      const output = new BeforeModelHookOutput({
        hookSpecificOutput: { llm_request: mockRequest },
      });
      const result = output.applyLLMRequestModifications(target);
      expect(result).toEqual({ ...target, ...mockRequest });
      expect(defaultHookTranslator.fromHookLLMRequest).toHaveBeenCalledWith(
        mockRequest,
        target,
      );
    });

    it('applyLLMRequestModifications should return target unchanged if llm_request is not present', () => {
      const target: GenerateContentParameters = {
        model: 'gemini-pro',
        contents: [],
      };
      const output = new BeforeModelHookOutput({});
      expect(output.applyLLMRequestModifications(target)).toBe(target);
    });
  });

  describe('BeforeToolSelectionHookOutput', () => {
    it('applyToolConfigModifications should apply modifications if toolConfig is present', () => {
      const target = { tools: [{ functionDeclarations: [] }] };
      const mockToolConfig = { functionCallingConfig: { mode: 'ANY' } };
      const output = new BeforeToolSelectionHookOutput({
        hookSpecificOutput: { toolConfig: mockToolConfig },
      });
      const result = output.applyToolConfigModifications(target);
      expect(result).toEqual({ ...target, toolConfig: mockToolConfig });
      expect(defaultHookTranslator.fromHookToolConfig).toHaveBeenCalledWith(
        mockToolConfig,
      );
    });

    it('applyToolConfigModifications should return target unchanged if toolConfig is not present', () => {
      const target = { toolConfig: {}, tools: [] };
      const output = new BeforeToolSelectionHookOutput({});
      expect(output.applyToolConfigModifications(target)).toBe(target);
    });

    it('applyToolConfigModifications should initialize tools array if not present', () => {
      const target = {};
      const mockToolConfig = { functionCallingConfig: { mode: 'ANY' } };
      const output = new BeforeToolSelectionHookOutput({
        hookSpecificOutput: { toolConfig: mockToolConfig },
      });
      const result = output.applyToolConfigModifications(target);
      expect(result).toEqual({ tools: [], toolConfig: mockToolConfig });
    });
  });

  describe('AfterModelHookOutput', () => {
    it('getModifiedResponse should return modified response if llm_response is present and has content', () => {
      const mockResponse: LLMResponse = {
        candidates: [{ content: { role: 'model', parts: ['modified'] } }],
      };
      const output = new AfterModelHookOutput({
        hookSpecificOutput: { llm_response: mockResponse },
      });
      expect(output.getModifiedResponse()).toEqual(mockResponse);
      expect(defaultHookTranslator.fromHookLLMResponse).toHaveBeenCalledWith(
        mockResponse,
      );
    });

    it('getModifiedResponse should return undefined if llm_response is present but no content', () => {
      const mockResponse: LLMResponse = {
        candidates: [{ content: { role: 'model', parts: [] } }],
      };
      const output = new AfterModelHookOutput({
        hookSpecificOutput: { llm_response: mockResponse },
      });
      expect(output.getModifiedResponse()).toBeUndefined();
    });

    it('getModifiedResponse should return undefined if llm_response is not present', () => {
      const output = new AfterModelHookOutput({});
      expect(output.getModifiedResponse()).toBeUndefined();
    });

    it('getModifiedResponse should return undefined if shouldStopExecution is true', () => {
      const output = new AfterModelHookOutput({
        continue: false,
        stopReason: 'stopped by hook',
      });
      expect(output.getModifiedResponse()).toBeUndefined();
    });

    it('getModifiedResponse should return undefined if shouldStopExecution is true and no stopReason', () => {
      const output = new AfterModelHookOutput({ continue: false });
      expect(output.getModifiedResponse()).toBeUndefined();
    });
  });
});
