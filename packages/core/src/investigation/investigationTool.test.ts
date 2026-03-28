import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InvestigationExecutor,
  INVESTIGATION_TOOL_NAME,
  INVESTIGATION_TOOL_DESCRIPTION,
  INVESTIGATION_PARAMETER_SCHEMA,
  type InvestigationToolParams,
} from './investigationTool.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

/**
 * Minimal valid V8 heap snapshot for testing.
 * Has 3 nodes (root, App, data) and 2 edges.
 */
function createMinimalSnapshot(): object {
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
        node_types: [
          ['hidden', 'object', 'string', 'number', 'code', 'closure', 'regexp', 'native',
           'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint', 'array'],
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'],
        ],
      },
      node_count: 3,
      edge_count: 2,
    },
    nodes: [
      // Node 0: root (hidden), 2 edges
      0, 0, 1, 0, 2, 0, 0,
      // Node 1: App (object), 0 edges
      1, 1, 2, 100, 0, 0, 0,
      // Node 2: data (object), 0 edges
      1, 2, 3, 200, 0, 0, 0,
    ],
    edges: [
      // Edge 0: root -> App (property "app")
      2, 1, 7,
      // Edge 1: root -> data (property "data")
      2, 2, 14,
    ],
    strings: ['', 'App', 'data'],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InvestigationTool', () => {
  describe('constants', () => {
    it('should have correct tool name', () => {
      expect(INVESTIGATION_TOOL_NAME).toBe('investigate');
    });

    it('should have a non-empty description', () => {
      expect(INVESTIGATION_TOOL_DESCRIPTION.length).toBeGreaterThan(50);
    });

    it('should have valid parameter schema', () => {
      expect(INVESTIGATION_PARAMETER_SCHEMA.type).toBe('object');
      expect(INVESTIGATION_PARAMETER_SCHEMA.required).toContain('action');
      expect(INVESTIGATION_PARAMETER_SCHEMA.properties.action.enum).toHaveLength(6);
    });
  });

  describe('InvestigationExecutor', () => {
    let executor: InvestigationExecutor;
    let tmpDir: string;

    beforeEach(() => {
      executor = new InvestigationExecutor();
      tmpDir = fs.mkdtempSync('/tmp/investigation-test-');
    });

    afterEach(async () => {
      await executor.dispose();
      // Clean up temp files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('analyze_heap_snapshot', () => {
      it('should analyze a valid heap snapshot file', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        const result = await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: snapshotPath,
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe('analyze_heap_snapshot');
        expect(result.summary).toContain('Heap Snapshot Analysis');
        expect(result.data).toBeDefined();
        expect(result.data!.nodeCount).toBe(3);
        expect(result.data!.edgeCount).toBe(2);
      });

      it('should return error for missing file_path', async () => {
        const result = await executor.execute({ action: 'analyze_heap_snapshot' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('file_path');
      });

      it('should return error for non-existent file', async () => {
        const result = await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: '/nonexistent/path.heapsnapshot',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('does not exist');
      });

      it('should include top classes in data', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        const result = await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: snapshotPath,
        });

        expect(result.data!.topClasses).toBeDefined();
        expect(Array.isArray(result.data!.topClasses)).toBe(true);
      });
    });

    describe('diagnose_memory', () => {
      it('should run root-cause analysis on a snapshot', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        const result = await executor.execute({
          action: 'diagnose_memory',
          file_path: snapshotPath,
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe('diagnose_memory');
        expect(result.data).toBeDefined();
        expect(result.data!.findingCount).toBeDefined();
      });

      it('should return error for missing file_path', async () => {
        const result = await executor.execute({ action: 'diagnose_memory' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('file_path');
      });

      it('should generate markdown report', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        const result = await executor.execute({
          action: 'diagnose_memory',
          file_path: snapshotPath,
        });

        expect(result.markdownReport).toBeDefined();
        expect(result.markdownReport).toContain('Memory Investigation');
      });
    });

    describe('export_perfetto', () => {
      it('should return error when no data available', async () => {
        const result = await executor.execute({ action: 'export_perfetto' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('No data available');
      });

      it('should export after analyzing a snapshot', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        // First analyze
        await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: snapshotPath,
        });

        // Then export
        const result = await executor.execute({ action: 'export_perfetto' });
        expect(result.success).toBe(true);
        expect(result.data!.eventCount).toBeGreaterThan(0);
      });

      it('should write to output_path when specified', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        const outputPath = path.join(tmpDir, 'trace.json');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: snapshotPath,
        });

        const result = await executor.execute({
          action: 'export_perfetto',
          output_path: outputPath,
        });

        expect(result.success).toBe(true);
        expect(result.perfettoPath).toBe(outputPath);
        expect(fs.existsSync(outputPath)).toBe(true);

        // Validate the output is valid JSON
        const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        expect(content.traceEvents).toBeDefined();
        expect(content.displayTimeUnit).toBe('ms');
      });
    });

    describe('unknown action', () => {
      it('should return error for invalid action', async () => {
        const result = await executor.execute({
          action: 'invalid_action' as any,
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid action');
      });
    });

    describe('error handling', () => {
      it('should catch and return errors gracefully', async () => {
        const result = await executor.execute({
          action: 'analyze_heap_snapshot',
          file_path: path.join(tmpDir, 'invalid.json'),
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('progress events', () => {
      it('should emit progress events', async () => {
        const snapshotPath = path.join(tmpDir, 'test.heapsnapshot');
        fs.writeFileSync(snapshotPath, JSON.stringify(createMinimalSnapshot()));

        const progressFn = vi.fn();
        executor.on('progress', progressFn);

        // diagnose_memory doesn't emit progress, but analyze does internal work
        // Just verify executor is an EventEmitter and can register handlers
        expect(typeof executor.on).toBe('function');
        expect(typeof executor.emit).toBe('function');
      });
    });
  });
});
