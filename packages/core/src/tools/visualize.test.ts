/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualizeTool } from './visualize.js';
import type { VisualizeToolParams } from './visualize/types.js';
import type { Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { isDiagramData } from './visualize/types.js';

vi.mock('../config/config.js');

describe('VisualizeTool', () => {
  let tool: VisualizeTool;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/tmp/test-project',
    } as unknown as Config;
    tool = new VisualizeTool(mockConfig, createMockMessageBus());
  });

  describe('build validation', () => {
    it('should accept valid mermaid params', () => {
      const params: VisualizeToolParams = {
        type: 'mermaid',
        content: 'graph LR\n  A --> B',
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should reject mermaid without content', () => {
      const params: VisualizeToolParams = {
        type: 'mermaid',
      };
      expect(() => tool.build(params)).toThrow(
        "The 'content' parameter is required when type is 'mermaid'.",
      );
    });

    it('should reject dependency_graph without file_path', () => {
      const params: VisualizeToolParams = {
        type: 'dependency_graph',
      };
      expect(() => tool.build(params)).toThrow(
        "The 'file_path' parameter is required when type is 'dependency_graph'.",
      );
    });

    it('should reject html_preview without html', () => {
      const params: VisualizeToolParams = {
        type: 'html_preview',
      };
      expect(() => tool.build(params)).toThrow(
        "The 'html' parameter is required when type is 'html_preview'.",
      );
    });

    it('should accept valid git_history params', () => {
      const params: VisualizeToolParams = {
        type: 'git_history',
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });
  });

  describe('execute mermaid', () => {
    it('should return DiagramData for mermaid type', async () => {
      const params: VisualizeToolParams = {
        type: 'mermaid',
        content: 'graph LR\n  A --> B',
      };
      const invocation = tool.build(params);
      const abortController = new AbortController();
      const result = await invocation.execute(abortController.signal);

      expect(result.error).toBeUndefined();
      expect(isDiagramData(result.returnDisplay)).toBe(true);
      if (isDiagramData(result.returnDisplay)) {
        expect(result.returnDisplay.isDiagram).toBe(true);
        expect(result.returnDisplay.diagramType).toBe('flowchart');
        expect(result.returnDisplay.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getSchema', () => {
    it('should return a valid schema', () => {
      const schema = tool.getSchema();
      expect(schema).toBeDefined();
      expect(schema.name).toBe('visualize');
      expect(schema.description).toBeDefined();
      expect(schema.parametersJsonSchema).toBeDefined();
    });
  });
});
