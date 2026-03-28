/**
 * Allocation Hotspot Profiler — Where Is Memory Being Allocated Fastest?
 *
 * ORIGINAL MODULE — Complementary to heap snapshots (which show what's retained,
 * not what's being allocated). This shows allocation RATE by call site.
 *
 * Uses V8's AllocationProfile sampling data or heap snapshot allocation
 * tracking to identify the hottest allocation sites in code.
 *
 * Features:
 * - Parses V8 allocation profiles (sampling allocations)
 * - Identifies top allocation sites by rate (bytes/sec) and count
 * - Builds allocation call trees (like CPU flame graphs but for allocations)
 * - Detects "allocation storms" (sudden spikes in allocation rate)
 * - Identifies allocate-and-discard patterns (high alloc + high GC)
 * - Generates allocation flame graph (folded stacks format)
 * - Terminal-formatted hotspot reports
 *
 * @module investigation/allocationHotspotProfiler
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single allocation sample from V8's AllocationProfile */
export interface AllocationSample {
  /** Unique node ID in the call tree */
  nodeId: number;
  /** Allocation size in bytes */
  size: number;
  /** Number of allocations at this site */
  count: number;
  /** Stack frames from allocation site to root */
  stack: StackFrame[];
}

/** A stack frame in an allocation profile */
export interface StackFrame {
  functionName: string;
  scriptName: string;
  lineNumber: number;
  columnNumber: number;
}

/** Allocation call tree node */
export interface AllocationNode {
  /** Function name */
  functionName: string;
  /** Source location */
  scriptName: string;
  lineNumber: number;
  /** Total bytes allocated at this node and children */
  totalBytes: number;
  /** Bytes allocated directly at this node */
  selfBytes: number;
  /** Total allocation count at this node and children */
  totalCount: number;
  /** Self allocation count */
  selfCount: number;
  /** Children in the call tree */
  children: AllocationNode[];
  /** Percentage of total allocations */
  totalPercent: number;
  selfPercent: number;
}

/** An allocation hotspot */
export interface AllocationHotspot {
  /** Function name */
  functionName: string;
  /** Source file */
  scriptName: string;
  /** Line number */
  lineNumber: number;
  /** Bytes allocated per second (if timing available) */
  bytesPerSec: number;
  /** Total bytes allocated during profile */
  totalBytes: number;
  /** Number of allocations */
  count: number;
  /** Percentage of all allocations */
  share: number;
  /** Call stack leading to this hotspot */
  stack: string[];
  /** Classification */
  category: 'buffer' | 'string' | 'object' | 'array' | 'closure' | 'unknown';
}

/** Allocation storm detection */
export interface AllocationStorm {
  /** When the storm was detected */
  startIndex: number;
  endIndex: number;
  /** Peak allocation rate during storm */
  peakBytesPerSec: number;
  /** Average rate outside storm */
  baselineBytesPerSec: number;
  /** Spike multiplier */
  spikeMultiplier: number;
  /** Top allocators during storm */
  topAllocators: string[];
}

/** Complete allocation profile analysis */
export interface AllocationProfileReport {
  /** Duration of the profile in ms */
  profileDurationMs: number;
  /** Total bytes allocated */
  totalAllocatedBytes: number;
  /** Total allocation count */
  totalAllocationCount: number;
  /** Allocation rate */
  bytesPerSec: number;
  /** Allocations per second */
  allocationsPerSec: number;
  /** Top hotspots */
  hotspots: AllocationHotspot[];
  /** Call tree root */
  callTree: AllocationNode;
  /** Detected allocation storms */
  storms: AllocationStorm[];
  /** Allocate-and-discard ratio (high = wasteful) */
  churnRatio: number;
  /** Health assessment */
  assessment: string;
  /** Recommendations */
  recommendations: string[];
}

// ─── Allocation Hotspot Profiler ──────────────────────────────────────────────

export class AllocationHotspotProfiler {

  /**
   * Analyze allocation samples and produce a hotspot report
   */
  analyze(
    samples: AllocationSample[],
    options?: {
      profileDurationMs?: number;
      gcFreedBytes?: number;
    },
  ): AllocationProfileReport {
    const durationMs = options?.profileDurationMs || 1000;

    if (samples.length === 0) {
      return this.emptyReport(durationMs);
    }

    // Build totals
    const totalBytes = samples.reduce((s, a) => s + a.size, 0);
    const totalCount = samples.reduce((s, a) => s + a.count, 0);
    const bytesPerSec = totalBytes / (durationMs / 1000);
    const allocPerSec = totalCount / (durationMs / 1000);

    // Build call tree
    const callTree = this.buildCallTree(samples, totalBytes);

    // Extract hotspots
    const hotspots = this.extractHotspots(samples, totalBytes, durationMs);

    // Detect storms (if we have sequential data)
    const storms = this.detectStorms(samples, durationMs);

    // Churn ratio (allocation rate vs retained — high means allocate-and-discard)
    const gcFreed = options?.gcFreedBytes || 0;
    const churnRatio = totalBytes > 0 && gcFreed > 0
      ? Math.min(1, gcFreed / totalBytes)
      : 0;

    // Assessment
    const assessment = this.generateAssessment(bytesPerSec, hotspots, storms, churnRatio);

    // Recommendations
    const recommendations = this.generateRecommendations(hotspots, storms, churnRatio, bytesPerSec);

    return {
      profileDurationMs: durationMs,
      totalAllocatedBytes: totalBytes,
      totalAllocationCount: totalCount,
      bytesPerSec,
      allocationsPerSec: allocPerSec,
      hotspots,
      callTree,
      storms,
      churnRatio,
      assessment,
      recommendations,
    };
  }

  /**
   * Parse V8 AllocationProfile from CDP HeapProfiler.getSamplingProfile()
   */
  static parseV8AllocationProfile(profile: {
    head: V8ProfileNode;
    samples?: Array<{ nodeId: number; size: number; count?: number }>;
  }): AllocationSample[] {
    const samples: AllocationSample[] = [];
    const nodeMap = new Map<number, { node: V8ProfileNode; stack: StackFrame[] }>();

    // Build node map with stack traces
    function traverse(node: V8ProfileNode, stack: StackFrame[]): void {
      const frame: StackFrame = {
        functionName: node.callFrame.functionName || '(anonymous)',
        scriptName: node.callFrame.url || '',
        lineNumber: node.callFrame.lineNumber || 0,
        columnNumber: node.callFrame.columnNumber || 0,
      };
      const currentStack = [...stack, frame];
      nodeMap.set(node.id, { node, stack: currentStack });

      // If this node has self allocations
      if (node.selfSize && node.selfSize > 0) {
        samples.push({
          nodeId: node.id,
          size: node.selfSize,
          count: 1,
          stack: currentStack,
        });
      }

      for (const child of node.children || []) {
        traverse(child, currentStack);
      }
    }

    traverse(profile.head, []);

    // Also add explicit samples if provided
    if (profile.samples) {
      for (const sample of profile.samples) {
        const entry = nodeMap.get(sample.nodeId);
        if (entry) {
          samples.push({
            nodeId: sample.nodeId,
            size: sample.size,
            count: sample.count || 1,
            stack: entry.stack,
          });
        }
      }
    }

    return samples;
  }

  /**
   * Create synthetic allocation samples from heap snapshot class summaries
   * (when real allocation profiling isn't available)
   */
  static fromClassSummaries(
    classes: Array<{ className: string; count: number; shallowSize: number; retainedSize: number }>,
    durationMs?: number,
  ): AllocationSample[] {
    return classes.map((cls, i) => ({
      nodeId: i + 1,
      size: cls.shallowSize,
      count: cls.count,
      stack: [{
        functionName: `new ${cls.className}`,
        scriptName: '(heap)',
        lineNumber: 0,
        columnNumber: 0,
      }],
    }));
  }

  // ─── Call Tree Building ─────────────────────────────────────────────────

  private buildCallTree(samples: AllocationSample[], totalBytes: number): AllocationNode {
    const root: AllocationNode = {
      functionName: '(root)',
      scriptName: '',
      lineNumber: 0,
      totalBytes: totalBytes,
      selfBytes: 0,
      totalCount: samples.reduce((s, a) => s + a.count, 0),
      selfCount: 0,
      children: [],
      totalPercent: 100,
      selfPercent: 0,
    };

    for (const sample of samples) {
      if (!sample.stack || !Array.isArray(sample.stack)) continue;
      let current = root;
      for (const frame of sample.stack) {
        let child = current.children.find(
          c => c.functionName === frame.functionName &&
               c.scriptName === frame.scriptName &&
               c.lineNumber === frame.lineNumber
        );

        if (!child) {
          child = {
            functionName: frame.functionName,
            scriptName: frame.scriptName,
            lineNumber: frame.lineNumber,
            totalBytes: 0,
            selfBytes: 0,
            totalCount: 0,
            selfCount: 0,
            children: [],
            totalPercent: 0,
            selfPercent: 0,
          };
          current.children.push(child);
        }

        child.totalBytes += sample.size;
        child.totalCount += sample.count;
        current = child;
      }

      // The deepest frame gets the self allocation
      current.selfBytes += sample.size;
      current.selfCount += sample.count;
    }

    // Compute percentages
    this.computePercents(root, totalBytes);

    // Sort children by totalBytes desc
    this.sortTree(root);

    return root;
  }

  private computePercents(node: AllocationNode, totalBytes: number): void {
    node.totalPercent = totalBytes > 0 ? (node.totalBytes / totalBytes) * 100 : 0;
    node.selfPercent = totalBytes > 0 ? (node.selfBytes / totalBytes) * 100 : 0;
    for (const child of node.children) {
      this.computePercents(child, totalBytes);
    }
  }

  private sortTree(node: AllocationNode): void {
    node.children.sort((a, b) => b.totalBytes - a.totalBytes);
    for (const child of node.children) {
      this.sortTree(child);
    }
  }

  // ─── Hotspot Extraction ─────────────────────────────────────────────────

  private extractHotspots(
    samples: AllocationSample[],
    totalBytes: number,
    durationMs: number,
  ): AllocationHotspot[] {
    // Group by leaf function (deepest frame)
    const hotspotMap = new Map<string, {
      frame: StackFrame;
      bytes: number;
      count: number;
      stacks: string[][];
    }>();

    for (const sample of samples) {
      if (!sample.stack || !Array.isArray(sample.stack) || sample.stack.length === 0) continue;
      const leaf = sample.stack[sample.stack.length - 1];
      if (!leaf) continue;

      const key = `${leaf.functionName}:${leaf.scriptName}:${leaf.lineNumber}`;
      const existing = hotspotMap.get(key);

      if (existing) {
        existing.bytes += sample.size;
        existing.count += sample.count;
      } else {
        hotspotMap.set(key, {
          frame: leaf,
          bytes: sample.size,
          count: sample.count,
          stacks: [sample.stack.map(f => f.functionName)],
        });
      }
    }

    const durationSec = durationMs / 1000;

    const hotspots: AllocationHotspot[] = [];
    for (const [, data] of hotspotMap) {
      hotspots.push({
        functionName: data.frame.functionName,
        scriptName: data.frame.scriptName,
        lineNumber: data.frame.lineNumber,
        bytesPerSec: durationSec > 0 ? data.bytes / durationSec : data.bytes,
        totalBytes: data.bytes,
        count: data.count,
        share: totalBytes > 0 ? (data.bytes / totalBytes) * 100 : 0,
        stack: data.stacks[0] || [],
        category: this.categorizeAllocation(data.frame.functionName),
      });
    }

    return hotspots.sort((a, b) => b.totalBytes - a.totalBytes);
  }

  private categorizeAllocation(funcName: string): AllocationHotspot['category'] {
    const lower = funcName.toLowerCase();
    if (lower.includes('buffer') || lower.includes('uint8') || lower.includes('arraybuffer')) return 'buffer';
    if (lower.includes('string') || lower.includes('concat') || lower.includes('join') || lower.includes('replace')) return 'string';
    if (lower.includes('array') || lower.includes('push') || lower.includes('map') || lower.includes('filter')) return 'array';
    if (lower.includes('closure') || lower.includes('=>') || lower.includes('bind')) return 'closure';
    if (lower.includes('object') || lower.includes('new ') || lower.includes('create')) return 'object';
    return 'unknown';
  }

  // ─── Storm Detection ────────────────────────────────────────────────────

  private detectStorms(samples: AllocationSample[], durationMs: number): AllocationStorm[] {
    if (samples.length < 10) return [];

    // Partition samples into time buckets based on nodeId ordering
    const bucketCount = Math.min(20, Math.ceil(samples.length / 5));
    const bucketSize = Math.ceil(samples.length / bucketCount);
    const buckets: { bytes: number; count: number; topAllocators: string[] }[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const start = i * bucketSize;
      const end = Math.min((i + 1) * bucketSize, samples.length);
      const bucketSamples = samples.slice(start, end);

      const bytes = bucketSamples.reduce((s, a) => s + a.size, 0);
      const topAlloc = bucketSamples
        .sort((a, b) => b.size - a.size)
        .slice(0, 3)
        .map(s => s.stack[s.stack.length - 1]?.functionName || 'unknown');

      buckets.push({ bytes, count: bucketSamples.length, topAllocators: topAlloc });
    }

    if (buckets.length < 3) return [];

    // Compute baseline (median bucket)
    const sortedBuckets = [...buckets].sort((a, b) => a.bytes - b.bytes);
    const medianBytes = sortedBuckets[Math.floor(sortedBuckets.length / 2)].bytes;

    // Detect spikes (>3x median)
    const storms: AllocationStorm[] = [];
    const spikeThreshold = 3;

    for (let i = 0; i < buckets.length; i++) {
      if (medianBytes > 0 && buckets[i].bytes / medianBytes > spikeThreshold) {
        const bucketDurationMs = durationMs / bucketCount;
        storms.push({
          startIndex: i * bucketSize,
          endIndex: Math.min((i + 1) * bucketSize, samples.length),
          peakBytesPerSec: buckets[i].bytes / (bucketDurationMs / 1000),
          baselineBytesPerSec: medianBytes / (bucketDurationMs / 1000),
          spikeMultiplier: buckets[i].bytes / medianBytes,
          topAllocators: buckets[i].topAllocators,
        });
      }
    }

    return storms;
  }

  // ─── Assessment & Recommendations ───────────────────────────────────────

  private generateAssessment(
    bytesPerSec: number,
    hotspots: AllocationHotspot[],
    storms: AllocationStorm[],
    churnRatio: number,
  ): string {
    const parts: string[] = [];

    if (bytesPerSec > 100_000_000) {
      parts.push('CRITICAL: Extremely high allocation rate (>100 MB/s).');
    } else if (bytesPerSec > 50_000_000) {
      parts.push('WARNING: High allocation rate (>50 MB/s).');
    } else if (bytesPerSec > 10_000_000) {
      parts.push('Moderate allocation rate.');
    } else {
      parts.push('Allocation rate is healthy.');
    }

    if (hotspots.length > 0 && hotspots[0].share > 50) {
      parts.push(`Top hotspot "${hotspots[0].functionName}" accounts for ${hotspots[0].share.toFixed(0)}% of all allocations.`);
    }

    if (storms.length > 0) {
      parts.push(`${storms.length} allocation storm(s) detected with up to ${storms[0]?.spikeMultiplier.toFixed(1)}x spike.`);
    }

    if (churnRatio > 0.8) {
      parts.push('High churn: >80% of allocations are immediately discarded. Consider object pooling.');
    }

    return parts.join(' ');
  }

  private generateRecommendations(
    hotspots: AllocationHotspot[],
    storms: AllocationStorm[],
    churnRatio: number,
    bytesPerSec: number,
  ): string[] {
    const recs: string[] = [];

    // Top hotspot recommendations
    if (hotspots.length > 0) {
      const top = hotspots[0];
      if (top.category === 'string' && top.share > 20) {
        recs.push(`String allocation hotspot in "${top.functionName}": Consider using Buffer or string concatenation optimization (template literals, array.join).`);
      }
      if (top.category === 'array' && top.share > 20) {
        recs.push(`Array allocation hotspot in "${top.functionName}": Pre-allocate arrays with known size. Avoid .map().filter() chains (use a single loop).`);
      }
      if (top.category === 'closure' && top.share > 15) {
        recs.push(`Closure allocation hotspot in "${top.functionName}": Move closures outside hot loops. Use bound methods instead of arrow functions in constructors.`);
      }
      if (top.category === 'buffer' && top.share > 30) {
        recs.push(`Buffer allocation hotspot in "${top.functionName}": Use a Buffer pool (Buffer.allocUnsafe + manual management) for high-throughput paths.`);
      }
    }

    // Storm recommendations
    if (storms.length > 0) {
      recs.push('Allocation storms detected: Profile the specific code path during peak activity. Consider request-scoped allocation limits.');
    }

    // Churn recommendations
    if (churnRatio > 0.8) {
      recs.push('High allocation churn: Objects are created and immediately discarded. Implement object pooling for frequently allocated types.');
    } else if (churnRatio > 0.5) {
      recs.push('Moderate allocation churn: Consider caching or reusing frequently created objects.');
    }

    // General rate recommendations
    if (bytesPerSec > 50_000_000) {
      recs.push('Consider --max-semi-space-size=64 to give the young generation more room (reduces GC frequency at high allocation rates).');
    }

    if (recs.length === 0) {
      recs.push('Allocation patterns look healthy. No immediate optimizations needed.');
    }

    return recs;
  }

  // ─── Output Formats ─────────────────────────────────────────────────────

  /**
   * Generate folded stacks format (compatible with flamegraph.pl / speedscope)
   */
  toFoldedStacks(samples: AllocationSample[]): string {
    const stacks: string[] = [];

    for (const sample of samples) {
      if (!sample.stack || !Array.isArray(sample.stack)) continue;
      const frames = sample.stack.map(f =>
        f.scriptName
          ? `${f.functionName} (${f.scriptName}:${f.lineNumber})`
          : f.functionName
      );
      if (frames.length > 0) {
        stacks.push(`${frames.join(';')} ${sample.size}`);
      }
    }

    return stacks.join('\n');
  }

  /**
   * Generate Perfetto-compatible trace events for allocation visualization
   */
  toPerfettoEvents(samples: AllocationSample[], durationMs: number): Array<Record<string, unknown>> {
    const events: Array<Record<string, unknown>> = [];
    const pid = 1;
    const tid = 2; // Separate thread for allocations

    events.push({
      ph: 'M', pid, tid,
      name: 'thread_name',
      args: { name: 'Allocation Activity' },
    });

    const sampleDurationUs = (durationMs * 1000) / Math.max(1, samples.length);

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const stack = sample.stack && Array.isArray(sample.stack) ? sample.stack : [];
      const leaf = stack[stack.length - 1];

      events.push({
        ph: 'X', pid, tid,
        name: leaf?.functionName || 'alloc',
        cat: 'allocation',
        ts: i * sampleDurationUs,
        dur: sampleDurationUs * 0.8,
        args: {
          bytes: sample.size,
          count: sample.count,
          stack: stack.map(f => f.functionName).join(' → '),
        },
      });

      // Counter for cumulative allocation
      events.push({
        ph: 'C', pid, tid: 0,
        name: 'AllocationRate',
        ts: i * sampleDurationUs,
        args: { bytes: sample.size },
      });
    }

    return events;
  }

  // ─── Terminal Formatting ────────────────────────────────────────────────

  static formatForTerminal(report: AllocationProfileReport): string {
    const lines: string[] = [];
    const RESET = '\x1b[0m';
    const BOLD = '\x1b[1m';
    const RED = '\x1b[31m';
    const GREEN = '\x1b[32m';
    const YELLOW = '\x1b[33m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';

    lines.push(`${BOLD}┌─────────────────────────────────────────┐${RESET}`);
    lines.push(`${BOLD}│  ALLOCATION HOTSPOT PROFILER            │${RESET}`);
    lines.push(`${BOLD}└─────────────────────────────────────────┘${RESET}`);
    lines.push('');
    lines.push(`  Duration:         ${report.profileDurationMs}ms`);
    lines.push(`  Total Allocated:  ${formatBytes(report.totalAllocatedBytes)}`);
    lines.push(`  Allocation Rate:  ${formatBytes(report.bytesPerSec)}/sec`);
    lines.push(`  Allocations/sec:  ${report.allocationsPerSec.toFixed(0)}`);
    lines.push(`  Churn Ratio:      ${(report.churnRatio * 100).toFixed(0)}%`);
    lines.push('');
    lines.push(`  ${BOLD}Assessment:${RESET} ${report.assessment}`);

    if (report.hotspots.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Top Allocation Hotspots:${RESET}`);
      for (const h of report.hotspots.slice(0, 10)) {
        const color = h.share > 30 ? RED : h.share > 10 ? YELLOW : GREEN;
        const bar = '█'.repeat(Math.max(1, Math.round(h.share / 5)));
        lines.push(`    ${color}${bar}${RESET} ${h.functionName} ${DIM}(${h.category})${RESET}`);
        lines.push(`      ${formatBytes(h.totalBytes)} (${h.share.toFixed(1)}%) · ${h.count} allocs · ${formatBytes(h.bytesPerSec)}/s`);
        if (h.scriptName) lines.push(`      ${DIM}${h.scriptName}:${h.lineNumber}${RESET}`);
      }
    }

    if (report.storms.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Allocation Storms:${RESET}`);
      for (const s of report.storms) {
        lines.push(`    ${RED}⚡${RESET} ${s.spikeMultiplier.toFixed(1)}x spike · Peak: ${formatBytes(s.peakBytesPerSec)}/s`);
        lines.push(`      ${DIM}Top allocators: ${s.topAllocators.join(', ')}${RESET}`);
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Recommendations:${RESET}`);
      for (const r of report.recommendations) {
        lines.push(`    → ${r}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private emptyReport(durationMs: number): AllocationProfileReport {
    return {
      profileDurationMs: durationMs,
      totalAllocatedBytes: 0,
      totalAllocationCount: 0,
      bytesPerSec: 0,
      allocationsPerSec: 0,
      hotspots: [],
      callTree: {
        functionName: '(root)',
        scriptName: '',
        lineNumber: 0,
        totalBytes: 0,
        selfBytes: 0,
        totalCount: 0,
        selfCount: 0,
        children: [],
        totalPercent: 0,
        selfPercent: 0,
      },
      storms: [],
      churnRatio: 0,
      assessment: 'No allocation data to analyze.',
      recommendations: [],
    };
  }
}

// ─── V8 Profile Types ─────────────────────────────────────────────────────────

interface V8ProfileNode {
  id: number;
  callFrame: {
    functionName?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  selfSize?: number;
  children?: V8ProfileNode[];
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1_048_576) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  if (abs < 1_073_741_824) return `${sign}${(abs / 1_048_576).toFixed(1)} MB`;
  return `${sign}${(abs / 1_073_741_824).toFixed(1)} GB`;
}
