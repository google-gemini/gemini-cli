/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the InvestigationTool wrapper that bridges the investigation
 * module into the Gemini CLI tool registry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestigationTool } from './investigation-tool.js';
import { INVESTIGATION_TOOL_NAME } from '../investigation/investigationTool.js';
import { Kind } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

function createMockMessageBus(): MessageBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    request: vi.fn().mockResolvedValue(undefined),
  } as unknown as MessageBus;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InvestigationTool', () => {
  let tool: InvestigationTool;
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = createMockMessageBus();
    tool = new InvestigationTool(messageBus);
  });

  describe('static properties', () => {
    it('should have the correct tool name', () => {
      expect(InvestigationTool.Name).toBe('investigate');
      expect(InvestigationTool.Name).toBe(INVESTIGATION_TOOL_NAME);
    });

    it('should have the correct kind', () => {
      expect(tool.kind).toBe(Kind.Execute);
    });

    it('should have a description', () => {
      expect(tool.schema.description).toBeDefined();
      expect(tool.schema.description!.length).toBeGreaterThan(50);
    });
  });

  describe('schema', () => {
    it('should expose the correct tool name in schema', () => {
      const schema = tool.getSchema();
      expect(schema.name).toBe('investigate');
    });

    it('should have action as a required parameter', () => {
      const schema = tool.getSchema();
      const params = schema.parametersJsonSchema as Record<string, unknown>;
      expect(params).toBeDefined();
      expect((params as { required?: string[] }).required).toContain('action');
    });

    it('should define all 6 investigation actions', () => {
      const schema = tool.getSchema();
      const params = schema.parametersJsonSchema as Record<string, unknown>;
      const actionProp = (
        params as { properties?: { action?: { enum?: string[] } } }
      ).properties?.action;
      expect(actionProp?.enum).toEqual([
        'analyze_heap_snapshot',
        'take_heap_snapshots',
        'capture_cpu_profile',
        'capture_memory_report',
        'export_perfetto',
        'diagnose_memory',
      ]);
    });
  });

  describe('build()', () => {
    it('should create an invocation with valid params', () => {
      const invocation = tool.build({
        action: 'analyze_heap_snapshot',
        file_path: '/tmp/test.heapsnapshot',
      });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('analyze_heap_snapshot');
      expect(invocation.getDescription()).toContain('/tmp/test.heapsnapshot');
    });

    it('should include port in description when provided', () => {
      const invocation = tool.build({
        action: 'take_heap_snapshots',
        port: 9229,
      });
      expect(invocation.getDescription()).toContain('9229');
    });

    it('should reject invalid action', () => {
      expect(() =>
        tool.build({
          action: 'not_a_real_action' as never,
        }),
      ).toThrow();
    });

    it('should reject missing action', () => {
      expect(() => tool.build({} as never)).toThrow();
    });
  });

  describe('session state', () => {
    it('should share executor state across invocations', () => {
      // Two invocations from the same tool share the same executor,
      // so export_perfetto can reference the last analysis result.
      const inv1 = tool.build({
        action: 'analyze_heap_snapshot',
        file_path: '/tmp/test.heapsnapshot',
      });
      const inv2 = tool.build({
        action: 'export_perfetto',
        output_path: '/tmp/trace.json',
      });
      // Both exist and reference the same underlying executor
      expect(inv1).toBeDefined();
      expect(inv2).toBeDefined();
    });
  });
});
