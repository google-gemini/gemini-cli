/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { MockTool } from './mock-tool.js';
import { Kind } from '../tools/tools.js';

describe('MockTool', () => {
  describe('constructor', () => {
    it('should create tool with minimal options', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool).toBeDefined();
      expect(tool.name).toBe('test-tool');
    });

    it('should use name as displayName by default', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool.displayName).toBe('test-tool');
    });

    it('should use custom displayName when provided', () => {
      const tool = new MockTool({
        name: 'test-tool',
        displayName: 'Test Tool Display',
      });
      expect(tool.displayName).toBe('Test Tool Display');
    });

    it('should use name as description by default', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool.description).toBe('test-tool');
    });

    it('should use custom description when provided', () => {
      const tool = new MockTool({
        name: 'test-tool',
        description: 'A test tool for testing',
      });
      expect(tool.description).toBe('A test tool for testing');
    });

    it('should set kind to Other', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool.kind).toBe(Kind.Other);
    });

    it('should set isOutputMarkdown to false by default', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool.isOutputMarkdown).toBe(false);
    });

    it('should use custom isOutputMarkdown value', () => {
      const tool = new MockTool({
        name: 'test-tool',
        isOutputMarkdown: true,
      });
      expect(tool.isOutputMarkdown).toBe(true);
    });

    it('should set canUpdateOutput to false by default', () => {
      const tool = new MockTool({ name: 'test-tool' });
      expect(tool.canUpdateOutput).toBe(false);
    });

    it('should use custom canUpdateOutput value', () => {
      const tool = new MockTool({
        name: 'test-tool',
        canUpdateOutput: true,
      });
      expect(tool.canUpdateOutput).toBe(true);
    });

    it('should accept custom params schema', () => {
      const params = { type: 'object', properties: {} };
      const tool = new MockTool({ name: 'test-tool', params });
      expect(tool).toBeDefined();
    });
  });

  describe('execute method', () => {
    it('should use default execute function', async () => {
      const tool = new MockTool({ name: 'test-tool' });
      const signal = new AbortController().signal;
      const result = await tool.execute({}, signal);

      expect(result).toHaveProperty('llmContent');
      expect(result).toHaveProperty('returnDisplay');
    });

    it('should return success message by default', async () => {
      const tool = new MockTool({ name: 'test-tool' });
      const signal = new AbortController().signal;
      const result = await tool.execute({}, signal);

      expect(result.llmContent).toContain('test-tool');
      expect(result.llmContent).toContain('executed successfully');
    });

    it('should use custom execute function', async () => {
      const customExecute = vi.fn().mockResolvedValue({
        llmContent: 'Custom result',
        returnDisplay: 'Custom display',
      });

      const tool = new MockTool({
        name: 'test-tool',
        execute: customExecute,
      });

      const signal = new AbortController().signal;
      const params = { key: 'value' };
      const result = await tool.execute(params, signal);

      expect(result.llmContent).toBe('Custom result');
      expect(result.returnDisplay).toBe('Custom display');
    });

    it('should pass updateOutput callback to execute', async () => {
      const customExecute = vi.fn().mockResolvedValue({
        llmContent: 'Result',
        returnDisplay: 'Display',
      });

      const tool = new MockTool({
        name: 'test-tool',
        execute: customExecute,
      });

      const signal = new AbortController().signal;
      const updateOutput = vi.fn();
      await tool.execute({}, signal, updateOutput);

      expect(customExecute).toHaveBeenCalledWith({}, signal, updateOutput);
    });

    it('should handle async execute functions', async () => {
      const customExecute = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          llmContent: 'Async result',
          returnDisplay: 'Async display',
        };
      });

      const tool = new MockTool({
        name: 'test-tool',
        execute: customExecute,
      });

      const signal = new AbortController().signal;
      const result = await tool.execute({}, signal);

      expect(result.llmContent).toBe('Async result');
    });

    it('should pass params to execute function', async () => {
      const customExecute = vi.fn((params) =>
        Promise.resolve({
          llmContent: `Received: ${JSON.stringify(params)}`,
          returnDisplay: 'Display',
        }),
      );

      const tool = new MockTool({
        name: 'test-tool',
        execute: customExecute,
      });

      const signal = new AbortController().signal;
      const params = { input: 'test-data', count: 5 };
      const result = await tool.execute(params, signal);

      expect(result.llmContent).toContain('test-data');
      expect(result.llmContent).toContain('5');
    });
  });

  describe('shouldConfirmExecute method', () => {
    it('should return false by default', async () => {
      const tool = new MockTool({ name: 'test-tool' });
      const signal = new AbortController().signal;
      const result = await tool.shouldConfirmExecute({}, signal);

      expect(result).toBe(false);
    });

    it('should use custom shouldConfirmExecute function', async () => {
      const customShouldConfirm = vi.fn().mockResolvedValue({
        message: 'Confirm action?',
      });

      const tool = new MockTool({
        name: 'test-tool',
        shouldConfirmExecute: customShouldConfirm,
      });

      const signal = new AbortController().signal;
      const params = { key: 'value' };
      await tool.shouldConfirmExecute(params, signal);

      expect(customShouldConfirm).toHaveBeenCalledWith(params, signal);
    });

    it('should return confirmation details when required', async () => {
      const confirmDetails = { message: 'Are you sure?' };
      const customShouldConfirm = vi.fn().mockResolvedValue(confirmDetails);

      const tool = new MockTool({
        name: 'test-tool',
        shouldConfirmExecute: customShouldConfirm,
      });

      const signal = new AbortController().signal;
      const result = await tool.shouldConfirmExecute({}, signal);

      expect(result).toEqual(confirmDetails);
    });

    it('should pass abort signal to shouldConfirmExecute', async () => {
      const customShouldConfirm = vi.fn().mockResolvedValue(false);

      const tool = new MockTool({
        name: 'test-tool',
        shouldConfirmExecute: customShouldConfirm,
      });

      const controller = new AbortController();
      await tool.shouldConfirmExecute({}, controller.signal);

      expect(customShouldConfirm).toHaveBeenCalledWith({}, controller.signal);
    });
  });

  describe('createInvocation', () => {
    it('should create tool invocation', () => {
      const tool = new MockTool({ name: 'test-tool' });
      const invocation = tool['createInvocation']({ param: 'value' });

      expect(invocation).toBeDefined();
    });

    it('should create invocation with params', () => {
      const tool = new MockTool({ name: 'test-tool' });
      const params = { key: 'value', count: 10 };
      const invocation = tool['createInvocation'](params);

      expect(invocation).toBeDefined();
    });
  });

  describe('tool integration', () => {
    it('should work as a complete tool', async () => {
      const tool = new MockTool({
        name: 'integration-tool',
        displayName: 'Integration Tool',
        description: 'A tool for testing',
        execute: async (params) => ({
          llmContent: `Executed with ${JSON.stringify(params)}`,
          returnDisplay: 'Done',
        }),
      });

      const signal = new AbortController().signal;
      const result = await tool.execute({ test: 'data' }, signal);

      expect(result.llmContent).toContain('test');
      expect(result.llmContent).toContain('data');
    });

    it('should handle confirmation and execution flow', async () => {
      const tool = new MockTool({
        name: 'confirm-tool',
        shouldConfirmExecute: async () => ({ message: 'Confirm?' }),
        execute: async () => ({
          llmContent: 'Executed',
          returnDisplay: 'Done',
        }),
      });

      const signal = new AbortController().signal;
      const confirmation = await tool.shouldConfirmExecute({}, signal);
      expect(confirmation).toBeTruthy();

      const result = await tool.execute({}, signal);
      expect(result.llmContent).toBe('Executed');
    });
  });
});
