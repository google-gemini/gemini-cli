/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DeclarativeTool,
  hasCycleInSchema,
  Kind,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';

class TestToolInvocation implements ToolInvocation<object, ToolResult> {
  constructor(
    readonly params: object,
    private readonly executeFn: () => Promise<ToolResult>,
  ) {}

  getDescription(): string {
    return 'A test invocation';
  }

  toolLocations() {
    return [];
  }

  shouldConfirmExecute(): Promise<false> {
    return Promise.resolve(false);
  }

  execute(): Promise<ToolResult> {
    return this.executeFn();
  }
}

class TestTool extends DeclarativeTool<object, ToolResult> {
  private readonly buildFn: (params: object) => TestToolInvocation;

  constructor(buildFn: (params: object) => TestToolInvocation) {
    super('test-tool', 'Test Tool', 'A tool for testing', Kind.Other, {});
    this.buildFn = buildFn;
  }

  build(params: object): ToolInvocation<object, ToolResult> {
    return this.buildFn(params);
  }
}

describe('DeclarativeTool', () => {
  describe('validateBuildAndExecute', () => {
    const abortSignal = new AbortController().signal;

    it('should return INVALID_TOOL_PARAMS error if build fails', async () => {
      const buildError = new Error('Invalid build parameters');
      const buildFn = vi.fn().mockImplementation(() => {
        throw buildError;
      });
      const tool = new TestTool(buildFn);
      const params = { foo: 'bar' };

      const result = await tool.validateBuildAndExecute(params, abortSignal);

      expect(buildFn).toHaveBeenCalledWith(params);
      expect(result).toEqual({
        llmContent: `Error: Invalid parameters provided. Reason: ${buildError.message}`,
        returnDisplay: buildError.message,
        error: {
          message: buildError.message,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      });
    });

    it('should return EXECUTION_FAILED error if execute fails', async () => {
      const executeError = new Error('Execution failed');
      const executeFn = vi.fn().mockRejectedValue(executeError);
      const invocation = new TestToolInvocation({}, executeFn);
      const buildFn = vi.fn().mockReturnValue(invocation);
      const tool = new TestTool(buildFn);
      const params = { foo: 'bar' };

      const result = await tool.validateBuildAndExecute(params, abortSignal);

      expect(buildFn).toHaveBeenCalledWith(params);
      expect(executeFn).toHaveBeenCalled();
      expect(result).toEqual({
        llmContent: `Error: Tool call execution failed. Reason: ${executeError.message}`,
        returnDisplay: executeError.message,
        error: {
          message: executeError.message,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      });
    });

    it('should return the result of execute on success', async () => {
      const successResult: ToolResult = {
        llmContent: 'Success!',
        returnDisplay: 'Success!',
        summary: 'Tool executed successfully',
      };
      const executeFn = vi.fn().mockResolvedValue(successResult);
      const invocation = new TestToolInvocation({}, executeFn);
      const buildFn = vi.fn().mockReturnValue(invocation);
      const tool = new TestTool(buildFn);
      const params = { foo: 'bar' };

      const result = await tool.validateBuildAndExecute(params, abortSignal);

      expect(buildFn).toHaveBeenCalledWith(params);
      expect(executeFn).toHaveBeenCalled();
      expect(result).toEqual(successResult);
    });
  });
});

describe('hasCycleInSchema', () => {
  it('should detect a simple direct cycle', () => {
    const schema = {
      properties: {
        data: {
          $ref: '#/properties/data',
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from object properties referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/data' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from array items referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              child: { $ref: '#/properties/data/items' },
            },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle between sibling properties', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/b' },
          },
        },
        b: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/a' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should not detect a cycle in a valid schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { $ref: '#/definitions/address' },
      },
      definitions: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle non-cyclic sibling refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/stringDef' },
        b: { $ref: '#/definitions/stringDef' },
      },
      definitions: {
        stringDef: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle nested but not cyclic refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/defA' },
      },
      definitions: {
        defA: { properties: { b: { $ref: '#/definitions/defB' } } },
        defB: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should return false for an empty schema', () => {
    expect(hasCycleInSchema({})).toBe(false);
  });
});
