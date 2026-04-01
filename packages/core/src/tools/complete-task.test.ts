/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompleteTaskTool } from './complete-task.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { z } from 'zod';

describe('CompleteTaskTool', () => {
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  describe('Default Configuration (no outputConfig)', () => {
    let tool: CompleteTaskTool;

    beforeEach(() => {
      tool = new CompleteTaskTool(mockMessageBus);
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('complete_task');
      expect(tool.displayName).toBe('Complete Task');
    });

    it('should generate correct schema', () => {
      const schema = tool.getSchema();
      const parameters = schema.parametersJsonSchema as Record<string, unknown>;
      const properties = parameters['properties'] as Record<string, unknown>;

      expect(properties).toHaveProperty('result');
      expect(parameters['required']).toContain('result');

      const resultProp = properties['result'] as Record<string, unknown>;
      expect(resultProp['type']).toBe('string');
    });

    it('should validate successfully with result', () => {
      const result = tool.validateToolParams({ result: 'Task done' });
      expect(result).toBeNull();
    });

    it('should fail validation if result is missing', () => {
      const result = tool.validateToolParams({});
      expect(result).toContain("must have required property 'result'");
    });

    it('should fail validation if result is only whitespace', () => {
      const result = tool.validateToolParams({ result: '   ' });
      expect(result).toContain(
        'Missing required "result" argument. You must provide your findings when calling complete_task.',
      );
    });

    it('should execute and return correct data', async () => {
      const invocation = tool.build({ result: 'Success message' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.data).toEqual({
        taskCompleted: true,
        submittedOutput: 'Success message',
      });
      expect(result.returnDisplay).toBe('Result submitted and task completed.');
    });
  });

  describe('Structured Configuration (with outputConfig)', () => {
    const schema = z.object({
      report: z.string(),
      score: z.number(),
    });
    const outputConfig = {
      outputName: 'my_output',
      description: 'The final report',
      schema,
    };
    let tool: CompleteTaskTool<typeof schema>;

    beforeEach(() => {
      tool = new CompleteTaskTool(mockMessageBus, outputConfig);
    });

    it('should generate schema based on outputConfig', () => {
      const toolSchema = tool.getSchema();

      expect(toolSchema.parametersJsonSchema).toHaveProperty(
        'properties.my_output',
      );
      expect(toolSchema.parametersJsonSchema).toHaveProperty(
        'properties.my_output.type',
        'object',
      );
      expect(toolSchema.parametersJsonSchema).toHaveProperty(
        'properties.my_output.properties.report',
      );
      expect(toolSchema.parametersJsonSchema).toHaveProperty(
        'properties.my_output.properties.score',
      );
      expect(toolSchema.parametersJsonSchema).toHaveProperty(
        'required',
        expect.arrayContaining(['my_output']),
      );
    });

    it('should validate successfully with correct structure', () => {
      const result = tool.validateToolParams({
        my_output: { report: 'All good', score: 100 },
      });
      expect(result).toBeNull();
    });

    it('should fail validation if output is missing', () => {
      const result = tool.validateToolParams({});
      expect(result).toContain("must have required property 'my_output'");
    });

    it('should fail validation if schema mismatch', () => {
      const result = tool.validateToolParams({
        my_output: { report: 'All good', score: 'not a number' },
      });
      expect(result).toContain('must be number');
    });

    it('should execute and return structured data', async () => {
      const outputValue = { report: 'Final findings', score: 42 };
      const invocation = tool.build({ my_output: outputValue });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.data?.['taskCompleted']).toBe(true);
      expect(result.data?.['submittedOutput']).toBe(
        JSON.stringify(outputValue, null, 2),
      );
    });

    it('should use processOutput if provided', async () => {
      const processOutput = (val: z.infer<typeof schema>) =>
        `Score was ${val.score}`;
      const toolWithProcess = new CompleteTaskTool(
        mockMessageBus,
        outputConfig,
        processOutput,
      );

      const outputValue = { report: 'Final findings', score: 42 };
      const invocation = toolWithProcess.build({ my_output: outputValue });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.data?.['submittedOutput']).toBe('Score was 42');
    });
  });
});
