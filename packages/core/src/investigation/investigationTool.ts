/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/investigationTool
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  HeapSnapshotAnalyzer,
  type RawHeapSnapshot,
  type LeakReport,
  type ClassSummary,
} from './heapSnapshotAnalyzer.js';

import { PerfettoExporter, type V8CpuProfile } from './perfettoExporter.js';

import { parseHeapSnapshot } from './streamingHeapParser.js';

import { CDPClient, type CPUProfileResult } from './cdpClient.js';

import { RootCauseAnalyzer } from './rootCauseAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Tool name constant */
export const INVESTIGATION_TOOL_NAME = 'investigate';

/** Actions the investigation tool supports */
export type InvestigationAction =
  | 'analyze_heap_snapshot'
  | 'take_heap_snapshots'
  | 'capture_cpu_profile'
  | 'capture_memory_report'
  | 'export_perfetto'
  | 'diagnose_memory';

/** Parameters for the investigation tool */
export interface InvestigationToolParams {
  action: InvestigationAction;

  /** File path for analyze_heap_snapshot / export_perfetto */
  file_path?: string;

  /** CDP port for live debugging actions (default: 9229) */
  port?: number;

  /** Duration in ms for CPU profiling (default: 5000) */
  duration_ms?: number;

  /** Interval between snapshots in ms (default: 0 = immediate) */
  interval_ms?: number;

  /** Output path for Perfetto JSON export */
  output_path?: string;

  /** Whether to include memory counters in Perfetto export */
  include_memory_counters?: boolean;

  /** Whether to include leak annotations in Perfetto export */
  include_leak_annotations?: boolean;
}

/** Result of an investigation tool invocation */
export interface InvestigationResult {
  success: boolean;
  action: InvestigationAction;
  summary: string;
  data?: Record<string, unknown>;
  perfettoPath?: string;
  markdownReport?: string;
  error?: string;
}

// ─── JSON Schema for tool parameters ─────────────────────────────────────────

export const INVESTIGATION_PARAMETER_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description:
        'The investigation action to perform. Options:\n' +
        '- analyze_heap_snapshot: Load and analyze a .heapsnapshot file from disk\n' +
        '- take_heap_snapshots: Connect to a running Node.js process via CDP and capture 3 heap snapshots for leak detection\n' +
        '- capture_cpu_profile: Connect to a running Node.js process and capture a CPU profile\n' +
        '- capture_memory_report: Capture a comprehensive memory report (heap usage + sampling profile + snapshot)\n' +
        '- export_perfetto: Export the last analysis result as a Perfetto-compatible trace JSON\n' +
        '- diagnose_memory: Run automated root-cause analysis on a .heapsnapshot file',
      enum: [
        'analyze_heap_snapshot',
        'take_heap_snapshots',
        'capture_cpu_profile',
        'capture_memory_report',
        'export_perfetto',
        'diagnose_memory',
      ],
    },
    file_path: {
      type: 'string',
      description:
        'Path to a .heapsnapshot file (for analyze_heap_snapshot and diagnose_memory actions)',
    },
    port: {
      type: 'number',
      description:
        'CDP debug port of the target Node.js process (default: 9229). Used by take_heap_snapshots, capture_cpu_profile, capture_memory_report',
    },
    duration_ms: {
      type: 'number',
      description: 'Duration in milliseconds for CPU profiling (default: 5000)',
    },
    interval_ms: {
      type: 'number',
      description:
        'Interval in milliseconds between heap snapshots in the 3-snapshot technique (default: 0 = immediate)',
    },
    output_path: {
      type: 'string',
      description:
        'Output file path for Perfetto JSON export (for export_perfetto action)',
    },
    include_memory_counters: {
      type: 'boolean',
      description:
        'Include memory counter tracks in Perfetto export (default: true)',
    },
    include_leak_annotations: {
      type: 'boolean',
      description:
        'Include leak annotation events in Perfetto export (default: true)',
    },
  },
  required: ['action'],
};

/** Tool description for the LLM */
export const INVESTIGATION_TOOL_DESCRIPTION =
  'Investigate memory leaks and performance issues in Node.js applications. ' +
  'Supports heap snapshot analysis (V8 .heapsnapshot format), live debugging via ' +
  'Chrome DevTools Protocol, CPU profiling, and Perfetto trace export. ' +
  'Use analyze_heap_snapshot to analyze an existing snapshot file, ' +
  'take_heap_snapshots to capture and analyze 3 snapshots from a running process, ' +
  'capture_cpu_profile for CPU profiling, capture_memory_report for a comprehensive ' +
  'memory report, export_perfetto to create a Perfetto-compatible trace file, ' +
  'and diagnose_memory for automated root-cause analysis.';

// ─── Investigation Executor ──────────────────────────────────────────────────

/**
 * Stateful executor that maintains investigation context across multiple
 * tool invocations within a session. Stores the last analysis results so
 * export_perfetto can reference them without re-running the analysis.
 */
export class InvestigationExecutor extends EventEmitter {
  private lastLeakReport: LeakReport | null = null;
  private lastClassSummaries: ClassSummary[] | null = null;
  private lastCpuProfile: V8CpuProfile | null = null;
  private cdpClient: CDPClient | null = null;

  constructor() {
    super();
  }

  /**
   * Execute an investigation action.
   */
  async execute(params: InvestigationToolParams): Promise<InvestigationResult> {
    try {
      switch (params.action) {
        case 'analyze_heap_snapshot':
          return await this.analyzeHeapSnapshot(params);
        case 'take_heap_snapshots':
          return await this.takeHeapSnapshots(params);
        case 'capture_cpu_profile':
          return await this.captureCpuProfile(params);
        case 'capture_memory_report':
          return await this.captureMemoryReport(params);
        case 'export_perfetto':
          return await this.exportPerfetto(params);
        case 'diagnose_memory':
          return await this.diagnoseMemory(params);
        default:
          return {
            success: false,
            action: params.action,
            summary: `Unknown action: ${params.action}`,
            error: `Invalid action. Valid actions: analyze_heap_snapshot, take_heap_snapshots, capture_cpu_profile, capture_memory_report, export_perfetto, diagnose_memory`,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: params.action,
        summary: `Investigation failed: ${message}`,
        error: message,
      };
    }
  }

  /**
   * Clean up resources (disconnect CDP client).
   */
  async dispose(): Promise<void> {
    if (this.cdpClient) {
      await this.cdpClient.disconnect();
      this.cdpClient = null;
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  /**
   * Analyze a .heapsnapshot file from disk.
   * Parses the V8 heap snapshot, computes dominator tree, extracts class summaries,
   * and returns an LLM-friendly summary.
   */
  private async analyzeHeapSnapshot(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    if (!params.file_path) {
      return {
        success: false,
        action: 'analyze_heap_snapshot',
        summary: 'file_path is required for analyze_heap_snapshot',
        error: 'Missing required parameter: file_path',
      };
    }

    const resolvedPath = path.resolve(params.file_path);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        action: 'analyze_heap_snapshot',
        summary: `File not found: ${resolvedPath}`,
        error: `Heap snapshot file does not exist: ${resolvedPath}`,
      };
    }

    // Use streaming parser for large files (>50MB), JSON.parse for smaller ones
    this.emit('progress', { phase: 'parsing', file: resolvedPath });
    const raw = await parseHeapSnapshot(resolvedPath, (progress) => {
      this.emit('progress', {
        file: resolvedPath,
        ...progress,
      });
    });
    const analyzer = new HeapSnapshotAnalyzer(raw);
    const summaries = analyzer.getClassSummaries();
    this.lastClassSummaries = summaries;

    const topClasses = summaries.slice(0, 20);
    const totalSize = summaries.reduce((sum, c) => sum + c.retainedSize, 0);

    const summary = [
      `## Heap Snapshot Analysis: ${path.basename(resolvedPath)}`,
      '',
      `**Nodes:** ${analyzer.nodeCount.toLocaleString()} | **Edges:** ${analyzer.edgeCount.toLocaleString()}`,
      `**Total retained size:** ${formatBytes(totalSize)}`,
      '',
      '### Top 20 Classes by Retained Size',
      '',
      '| Class | Count | Shallow Size | Retained Size |',
      '|-------|-------|-------------|---------------|',
      ...topClasses.map(
        (c) =>
          `| ${c.className} | ${c.count} | ${formatBytes(c.shallowSize)} | ${formatBytes(c.retainedSize)} |`,
      ),
    ].join('\n');

    return {
      success: true,
      action: 'analyze_heap_snapshot',
      summary,
      data: {
        nodeCount: analyzer.nodeCount,
        edgeCount: analyzer.edgeCount,
        totalRetainedSize: totalSize,
        topClasses: topClasses.map((c) => ({
          className: c.className,
          count: c.count,
          shallowSize: c.shallowSize,
          retainedSize: c.retainedSize,
        })),
      },
    };
  }

  /**
   * Connect to a running Node.js process via CDP and perform the 3-snapshot technique.
   */
  private async takeHeapSnapshots(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    const port = params.port ?? 9229;
    const intervalMs = params.interval_ms ?? 0;

    const client = await this.getOrCreateClient(port);

    this.emit('progress', 'Taking 3 heap snapshots for leak detection...');
    const [snap1, snap2, snap3] = await client.threeSnapshotCapture(intervalMs);

    const parsed2: unknown = JSON.parse(snap1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const analyzer1 = new HeapSnapshotAnalyzer(parsed2 as RawHeapSnapshot);
    const parsed3: unknown = JSON.parse(snap2);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const analyzer2 = new HeapSnapshotAnalyzer(parsed3 as RawHeapSnapshot);
    const parsed4: unknown = JSON.parse(snap3);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const analyzer3 = new HeapSnapshotAnalyzer(parsed4 as RawHeapSnapshot);

    const report = HeapSnapshotAnalyzer.detectLeaks(
      analyzer1,
      analyzer2,
      analyzer3,
    );
    this.lastLeakReport = report;
    this.lastClassSummaries = analyzer3.getClassSummaries();

    const markdownReport = HeapSnapshotAnalyzer.leakReportToMarkdown(report);

    return {
      success: true,
      action: 'take_heap_snapshots',
      summary: report.summary,
      markdownReport,
      data: {
        snapshotSizes: report.snapshotSizes,
        leakCandidateCount: report.leakCandidates.length,
        recommendations: report.recommendations,
      },
    };
  }

  /**
   * Capture a CPU profile from a running Node.js process.
   */
  private async captureCpuProfile(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    const port = params.port ?? 9229;
    const durationMs = params.duration_ms ?? 5000;

    const client = await this.getOrCreateClient(port);

    this.emit('progress', `Capturing CPU profile for ${durationMs}ms...`);
    const result: CPUProfileResult = await client.captureCpuProfile(durationMs);

    // Store CPU profile for later export
    const profileData: unknown = result.profile;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const profile = profileData as V8CpuProfile;
    this.lastCpuProfile = profile;

    const hotFunctions = result.profile.nodes
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    const summary = [
      `## CPU Profile (${durationMs}ms)`,
      '',
      `**Samples:** ${result.profile.samples.length}`,
      `**Duration:** ${((result.profile.endTime - result.profile.startTime) / 1000).toFixed(1)}ms`,
      '',
      '### Top 10 Hot Functions',
      '',
      '| Function | Script | Line | Hits |',
      '|----------|--------|------|------|',
      ...hotFunctions.map(
        (n) =>
          `| ${n.callFrame.functionName || '(anonymous)'} | ${path.basename(n.callFrame.url) || '(native)'} | ${n.callFrame.lineNumber} | ${n.hitCount} |`,
      ),
    ].join('\n');

    return {
      success: true,
      action: 'capture_cpu_profile',
      summary,
      data: {
        sampleCount: result.profile.samples.length,
        nodeCount: result.profile.nodes.length,
        duration: result.profile.endTime - result.profile.startTime,
        hotFunctions: hotFunctions.map((n) => ({
          name: n.callFrame.functionName,
          url: n.callFrame.url,
          line: n.callFrame.lineNumber,
          hitCount: n.hitCount,
        })),
      },
    };
  }

  /**
   * Capture a comprehensive memory report: heap usage + sampling profile + snapshot.
   */
  private async captureMemoryReport(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    const port = params.port ?? 9229;

    const client = await this.getOrCreateClient(port);

    this.emit('progress', 'Capturing comprehensive memory report...');
    const report = await client.captureMemoryReport();

    const parsed5: unknown = JSON.parse(report.snapshot);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const raw = parsed5 as RawHeapSnapshot;
    const analyzer = new HeapSnapshotAnalyzer(raw);
    this.lastClassSummaries = analyzer.getClassSummaries();

    const topClasses = this.lastClassSummaries.slice(0, 10);

    const summary = [
      '## Memory Report',
      '',
      `**Heap Used:** ${formatBytes(report.heapUsage.usedSize)} / ${formatBytes(report.heapUsage.totalSize)} (${((report.heapUsage.usedSize / report.heapUsage.totalSize) * 100).toFixed(1)}%)`,
      `**Nodes:** ${analyzer.nodeCount.toLocaleString()}`,
      '',
      '### Top 10 Classes by Retained Size',
      '',
      '| Class | Count | Retained Size |',
      '|-------|-------|---------------|',
      ...topClasses.map(
        (c) =>
          `| ${c.className} | ${c.count} | ${formatBytes(c.retainedSize)} |`,
      ),
    ].join('\n');

    return {
      success: true,
      action: 'capture_memory_report',
      summary,
      data: {
        heapUsed: report.heapUsage.usedSize,
        heapTotal: report.heapUsage.totalSize,
        nodeCount: analyzer.nodeCount,
        topClasses: topClasses.map((c) => ({
          className: c.className,
          count: c.count,
          retainedSize: c.retainedSize,
        })),
      },
    };
  }

  /**
   * Export investigation results as Perfetto-compatible JSON.
   */
  private async exportPerfetto(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    const exporter = new PerfettoExporter({
      processName: 'Gemini CLI Investigation',
      threadName: 'Analysis',
    });

    let hasData = false;

    if (this.lastLeakReport) {
      exporter.exportLeakReport(this.lastLeakReport, {
        includeMemoryCounters: params.include_memory_counters ?? true,
        includeLeakAnnotations: params.include_leak_annotations ?? true,
      });
      hasData = true;
    }

    if (this.lastClassSummaries && this.lastClassSummaries.length > 0) {
      const totalSize = this.lastClassSummaries.reduce(
        (sum, c) => sum + c.retainedSize,
        0,
      );
      exporter.exportClassSummaries(
        this.lastClassSummaries.slice(0, 30),
        totalSize,
      );
      hasData = true;
    }

    if (this.lastCpuProfile) {
      exporter.exportCpuProfile(this.lastCpuProfile);
      hasData = true;
    }

    if (!hasData) {
      return {
        success: false,
        action: 'export_perfetto',
        summary:
          'No investigation data to export. Run analyze_heap_snapshot, take_heap_snapshots, or capture_cpu_profile first.',
        error: 'No data available for export',
      };
    }

    const json = exporter.toJSON();

    if (params.output_path) {
      const outputPath = path.resolve(params.output_path);
      fs.writeFileSync(outputPath, json, 'utf-8');
      return {
        success: true,
        action: 'export_perfetto',
        summary: `Perfetto trace exported to ${outputPath} (${formatBytes(json.length)}). Open with ui.perfetto.dev for visualization.`,
        perfettoPath: outputPath,
        data: {
          eventCount: exporter.getEvents().length,
          fileSizeBytes: json.length,
        },
      };
    }

    return {
      success: true,
      action: 'export_perfetto',
      summary: `Perfetto trace generated (${formatBytes(json.length)}, ${exporter.getEvents().length} events). Specify output_path to save to disk.`,
      data: {
        eventCount: exporter.getEvents().length,
        fileSizeBytes: json.length,
        // Include inline for small traces
        ...(json.length < 100_000 ? { traceJson: json } : {}),
      },
    };
  }

  /**
   * Run automated root-cause analysis on a heap snapshot.
   */
  private async diagnoseMemory(
    params: InvestigationToolParams,
  ): Promise<InvestigationResult> {
    if (!params.file_path) {
      return {
        success: false,
        action: 'diagnose_memory',
        summary: 'file_path is required for diagnose_memory',
        error: 'Missing required parameter: file_path',
      };
    }

    const resolvedPath = path.resolve(params.file_path);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        action: 'diagnose_memory',
        summary: `File not found: ${resolvedPath}`,
        error: `Heap snapshot file does not exist: ${resolvedPath}`,
      };
    }

    // Use streaming parser for large files (>50MB), JSON.parse for smaller ones
    this.emit('progress', { phase: 'parsing', file: resolvedPath });
    const raw = await parseHeapSnapshot(resolvedPath, (progress) => {
      this.emit('progress', {
        file: resolvedPath,
        ...progress,
      });
    });
    const analyzer = new HeapSnapshotAnalyzer(raw);
    const summaries = analyzer.getClassSummaries();
    this.lastClassSummaries = summaries;

    const rootCauseAnalyzer = new RootCauseAnalyzer();
    const report = rootCauseAnalyzer.analyzeSnapshot(
      summaries,
      analyzer.nodeCount,
    );

    const markdown = RootCauseAnalyzer.toMarkdown(report);

    return {
      success: true,
      action: 'diagnose_memory',
      summary: report.summary,
      markdownReport: markdown,
      data: {
        findingCount: report.findings.length,
        highConfidence: report.findings.filter((f) => f.confidence === 'high')
          .length,
        mediumConfidence: report.findings.filter(
          (f) => f.confidence === 'medium',
        ).length,
        recommendations: report.recommendations,
      },
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async getOrCreateClient(port: number): Promise<CDPClient> {
    if (this.cdpClient && this.cdpClient.getState() === 'connected') {
      return this.cdpClient;
    }

    this.cdpClient = new CDPClient({ timeout: 30_000 });
    await this.cdpClient.connect(port);
    return this.cdpClient;
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    units.length - 1,
  );
  const value = abs / Math.pow(1024, i);
  return `${sign}${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
