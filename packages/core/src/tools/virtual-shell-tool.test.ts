/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { VirtualShellTool } from './virtual-shell-tool.js';
import { VirtualToolDefinition } from './virtual-tool-types.js';
import { Config } from '../config/config.js';
import {
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
} from './tools.js';
import { Type } from '@google/genai';

// Mock the spawn function
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock stripAnsi
vi.mock('strip-ansi', () => ({
  default: vi.fn((str: string) => str),
}));

describe('VirtualShellTool', () => {
  let mockConfig: Config;
  let mockToolDefinition: VirtualToolDefinition;

  beforeEach(() => {
    // Create a mock config
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    // Create a mock tool definition
    mockToolDefinition = {
      name: 'test_tool',
      script: 'echo "Hello from test tool"',
      schema: {
        name: 'test_tool',
        description: 'A test tool for unit testing',
        parameters: {
          type: Type.OBJECT,
          properties: {
            message: {
              type: Type.STRING,
              description: 'A test message',
            },
          },
          required: ['message'],
        },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should create VirtualShellTool with correct properties', () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);

    expect(tool.name).toBe('test_tool');
    expect(tool.displayName).toBe('test_tool');
    expect(tool.description).toBe('A test tool for unit testing');
    expect(tool.isOutputMarkdown).toBe(false);
    expect(tool.canUpdateOutput).toBe(true);
  });

  test('should validate required parameters correctly', () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);

    // Valid parameters
    const validParams = { message: 'test message' };
    expect(tool.validateToolParams(validParams)).toBeNull();

    // Missing required parameter
    const invalidParams = {};
    expect(tool.validateToolParams(invalidParams)).toBe(
      'Missing required parameter: message',
    );
  });

  test('should return correct tool description', () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const params = { message: 'test' };

    const description = tool.getDescription(params);
    expect(description).toBe('Execute virtual tool: test_tool');
  });

  test('should require confirmation for execution by default', async () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const params = { message: 'test' };
    const abortSignal = new AbortController().signal;

    const confirmation = await tool.shouldConfirmExecute(params, abortSignal);

    expect(confirmation).toBeTruthy();
    if (confirmation && confirmation.type === 'exec') {
      const execConfirmation = confirmation as ToolExecuteConfirmationDetails;
      expect(execConfirmation.type).toBe('exec');
      expect(execConfirmation.title).toBe('Confirm Virtual Tool Execution');
      expect(execConfirmation.command).toBe('echo "Hello from test tool"');
      expect(execConfirmation.rootCommand).toBe('test_tool');
    }
  });

  test('should whitelist tool after ProceedAlways confirmation', async () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const params = { message: 'test' };
    const abortSignal = new AbortController().signal;

    // First call should require confirmation
    const confirmation1 = await tool.shouldConfirmExecute(params, abortSignal);
    expect(confirmation1).toBeTruthy();

    // Simulate ProceedAlways confirmation
    if (confirmation1 && confirmation1.onConfirm) {
      await confirmation1.onConfirm(ToolConfirmationOutcome.ProceedAlways);
    }

    // Second call should not require confirmation (whitelisted)
    const confirmation2 = await tool.shouldConfirmExecute(params, abortSignal);
    expect(confirmation2).toBe(false);
  });

  test('should skip confirmation if validation fails', async () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const invalidParams = {}; // Missing required parameter
    const abortSignal = new AbortController().signal;

    const confirmation = await tool.shouldConfirmExecute(
      invalidParams,
      abortSignal,
    );
    expect(confirmation).toBe(false);
  });

  test('should return validation error on execute with invalid params', async () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const invalidParams = {}; // Missing required parameter
    const abortSignal = new AbortController().signal;

    const result = await tool.execute(invalidParams, abortSignal);

    expect(result.llmContent).toContain("Virtual tool 'test_tool' rejected");
    expect(result.llmContent).toContain('Missing required parameter: message');
    expect(result.returnDisplay).toContain(
      'Error: Missing required parameter: message',
    );
  });

  test('should return cancelled message if aborted before start', async () => {
    const tool = new VirtualShellTool(mockToolDefinition, mockConfig);
    const params = { message: 'test' };
    const abortController = new AbortController();

    // Abort before execution
    abortController.abort();

    const result = await tool.execute(params, abortController.signal);

    expect(result.llmContent).toContain(
      "Virtual tool 'test_tool' was cancelled by user before it could start",
    );
    expect(result.returnDisplay).toBe('Tool cancelled by user.');
  });

  test('should create tool with fallback description when schema has no description', () => {
    const toolDefWithoutDesc = {
      ...mockToolDefinition,
      schema: {
        ...mockToolDefinition.schema,
        description: undefined,
      },
    };

    const tool = new VirtualShellTool(toolDefWithoutDesc, mockConfig);
    expect(tool.description).toBe('A virtual tool defined in GEMINI.md.');
  });

  test('should handle tool definition with no required parameters', () => {
    const toolDefNoRequired = {
      name: 'simple_tool',
      script: 'echo "simple"',
      schema: {
        name: 'simple_tool',
        description: 'A simple tool',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
    };

    const tool = new VirtualShellTool(toolDefNoRequired, mockConfig);

    // Should not require any parameters
    expect(tool.validateToolParams({})).toBeNull();
    expect(tool.validateToolParams({ extraParam: 'value' })).toBeNull();
  });

  test('should handle tool definition with no parameter schema', () => {
    const toolDefNoSchema = {
      name: 'no_schema_tool',
      script: 'echo "no schema"',
      schema: {
        name: 'no_schema_tool',
        description: 'A tool without parameter schema',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
    };

    const tool = new VirtualShellTool(toolDefNoSchema, mockConfig);

    // Should not throw and should not require any parameters
    expect(tool.validateToolParams({})).toBeNull();
    expect(tool.validateToolParams({ anyParam: 'value' })).toBeNull();
  });
});
