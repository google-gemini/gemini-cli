/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/rootCauseAnalyzer
 */

import type {
  ClassSummary,
  LeakReport,
  LeakCandidate,
} from './heapSnapshotAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Confidence level for a finding */
export type Confidence = 'high' | 'medium' | 'low';

/** Category of memory issue pattern */
export type IssueCategory =
  | 'event_listener_leak'
  | 'closure_capture'
  | 'unbounded_collection'
  | 'detached_dom'
  | 'timer_leak'
  | 'string_accumulation'
  | 'buffer_accumulation'
  | 'large_retained_tree'
  | 'excessive_allocation'
  | 'general';

/** A single root-cause finding */
export interface RootCauseFinding {
  /** Category of the issue */
  category: IssueCategory;

  /** Human-readable title */
  title: string;

  /** Detailed description of the finding */
  description: string;

  /** How confident we are in this finding */
  confidence: Confidence;

  /** Evidence that supports this finding */
  evidence: string[];

  /** Specific actionable recommendations */
  recommendations: string[];

  /** Classes involved in this finding */
  involvedClasses: string[];

  /** Estimated memory impact in bytes (if computable) */
  estimatedImpact?: number;
}

/** Complete root-cause analysis report */
export interface RootCauseReport {
  /** Timestamp of the analysis */
  timestamp: string;

  /** One-line summary */
  summary: string;

  /** All findings, sorted by confidence then impact */
  findings: RootCauseFinding[];

  /** Aggregated recommendations (deduplicated) */
  recommendations: string[];

  /** Overall memory health assessment */
  healthScore: number; // 0-100, 100 = healthy

  /** Total estimated impact of all findings */
  totalEstimatedImpact: number;
}

// ─── Pattern Matchers ────────────────────────────────────────────────────────

/** A pattern matcher function that examines class summaries and returns findings */
type PatternMatcher = (
  summaries: ClassSummary[],
  totalNodes: number,
) => RootCauseFinding[];

// ─── Analyzer ────────────────────────────────────────────────────────────────

export class RootCauseAnalyzer {
  private matchers: PatternMatcher[] = [];

  constructor() {
    // Register all pattern matchers
    this.matchers = [
      this.detectEventListenerLeaks,
      this.detectUnboundedCollections,
      this.detectClosureCaptures,
      this.detectStringAccumulation,
      this.detectBufferAccumulation,
      this.detectLargeRetainedTrees,
      this.detectExcessiveAllocations,
      this.detectDetachedDOM,
      this.detectTimerLeaks,
    ];
  }

  /**
   * Analyze a snapshot's class summaries for memory issues.
   */
  analyzeSnapshot(
    summaries: ClassSummary[],
    totalNodes: number,
  ): RootCauseReport {
    const findings: RootCauseFinding[] = [];

    for (const matcher of this.matchers) {
      const results = matcher(summaries, totalNodes);
      findings.push(...results);
    }

    // Sort by confidence (high first) then by estimated impact
    findings.sort((a, b) => {
      const confidenceOrder: Record<Confidence, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      const confDiff =
        confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      if (confDiff !== 0) return confDiff;
      return (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
    });

    // Deduplicate recommendations
    const allRecs = findings.flatMap((f) => f.recommendations);
    const uniqueRecs = [...new Set(allRecs)];

    const totalImpact = findings.reduce(
      (sum, f) => sum + (f.estimatedImpact ?? 0),
      0,
    );
    const healthScore = this.computeHealthScore(findings, summaries);

    const summary =
      findings.length === 0
        ? 'No significant memory issues detected.'
        : `Found ${findings.length} potential issue${findings.length > 1 ? 's' : ''}: ` +
          `${findings.filter((f) => f.confidence === 'high').length} high, ` +
          `${findings.filter((f) => f.confidence === 'medium').length} medium, ` +
          `${findings.filter((f) => f.confidence === 'low').length} low confidence. ` +
          `Estimated impact: ${formatBytes(totalImpact)}.`;

    return {
      timestamp: new Date().toISOString(),
      summary,
      findings,
      recommendations: uniqueRecs,
      healthScore,
      totalEstimatedImpact: totalImpact,
    };
  }

  /**
   * Analyze a leak report from the 3-snapshot technique.
   * Provides deeper analysis based on growth patterns and retainer chains.
   */
  analyzeLeakReport(report: LeakReport): RootCauseReport {
    const findings: RootCauseFinding[] = [];

    for (const candidate of report.leakCandidates) {
      const candidateFindings = this.analyzeLeakCandidate(candidate);
      findings.push(...candidateFindings);
    }

    // Sort findings
    findings.sort((a, b) => {
      const confidenceOrder: Record<Confidence, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    });

    const uniqueRecs = [...new Set(findings.flatMap((f) => f.recommendations))];
    const totalImpact = findings.reduce(
      (sum, f) => sum + (f.estimatedImpact ?? 0),
      0,
    );

    return {
      timestamp: new Date().toISOString(),
      summary:
        findings.length === 0
          ? 'No root causes identified from leak report.'
          : `Identified ${findings.length} potential root cause${findings.length > 1 ? 's' : ''} for memory leaks.`,
      findings,
      recommendations: uniqueRecs,
      healthScore: Math.max(0, 100 - findings.length * 15),
      totalEstimatedImpact: totalImpact,
    };
  }

  /**
   * Convert a root-cause report to Markdown.
   */
  static toMarkdown(report: RootCauseReport): string {
    const lines: string[] = [
      '# Memory Investigation — Root Cause Analysis',
      '',
      `**Generated:** ${report.timestamp}`,
      `**Health Score:** ${report.healthScore}/100`,
      `**Total Estimated Impact:** ${formatBytes(report.totalEstimatedImpact)}`,
      '',
      `> ${report.summary}`,
      '',
    ];

    if (report.findings.length === 0) {
      lines.push(
        'No significant memory issues detected. The heap appears healthy.',
      );
      return lines.join('\n');
    }

    lines.push('## Findings', '');

    for (let i = 0; i < report.findings.length; i++) {
      const f = report.findings[i];
      const badge =
        f.confidence === 'high'
          ? '🔴'
          : f.confidence === 'medium'
            ? '🟡'
            : '🟢';

      lines.push(`### ${i + 1}. ${badge} ${f.title}`);
      lines.push('');
      lines.push(
        `**Category:** ${f.category} | **Confidence:** ${f.confidence}`,
      );
      if (f.estimatedImpact !== undefined) {
        lines.push(`**Estimated Impact:** ${formatBytes(f.estimatedImpact)}`);
      }
      lines.push('');
      lines.push(f.description);
      lines.push('');

      if (f.evidence.length > 0) {
        lines.push('**Evidence:**');
        for (const e of f.evidence) {
          lines.push(`- ${e}`);
        }
        lines.push('');
      }

      if (f.involvedClasses.length > 0) {
        lines.push(`**Involved classes:** ${f.involvedClasses.join(', ')}`);
        lines.push('');
      }

      if (f.recommendations.length > 0) {
        lines.push('**Recommendations:**');
        for (const r of f.recommendations) {
          lines.push(`- ${r}`);
        }
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('## Summary Recommendations', '');
      for (const r of report.recommendations) {
        lines.push(`1. ${r}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Pattern Matchers ──────────────────────────────────────────────────

  private detectEventListenerLeaks(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const listenerClasses = summaries.filter((c) =>
      /listener|handler|observer|emitter|callback/i.test(c.className),
    );

    for (const cls of listenerClasses) {
      if (cls.count > 50) {
        findings.push({
          category: 'event_listener_leak',
          title: `Excessive ${cls.className} instances (${cls.count})`,
          description:
            `Found ${cls.count} instances of ${cls.className}, which appears to be an event listener or handler class. ` +
            `High counts often indicate listeners being added without corresponding removal (e.g., missing removeEventListener ` +
            `or .off() calls). Each listener retains a reference to its closure and bound variables.`,
          confidence: cls.count > 200 ? 'high' : 'medium',
          evidence: [
            `${cls.count} instances of ${cls.className}`,
            `Shallow size: ${formatBytes(cls.shallowSize)}`,
            `Retained size: ${formatBytes(cls.retainedSize)}`,
          ],
          recommendations: [
            `Audit all places where ${cls.className} instances are created — ensure each has a corresponding cleanup/removal`,
            'Use AbortController for managing event listener lifecycles where possible',
            'Consider using WeakRef for observer patterns to allow GC of unused listeners',
          ],
          involvedClasses: [cls.className],
          estimatedImpact: cls.retainedSize,
        });
      }
    }

    return findings;
  }

  private detectUnboundedCollections(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const collectionClasses = summaries.filter((c) =>
      /^(Map|Set|WeakMap|WeakSet|Array)$/.test(c.className),
    );

    for (const cls of collectionClasses) {
      // Flag Maps and Sets with disproportionately high retained size
      const retainedPerInstance =
        cls.count > 0 ? cls.retainedSize / cls.count : 0;

      if (cls.className === 'Map' || cls.className === 'Set') {
        if (cls.retainedSize > 1_000_000 && retainedPerInstance > 100_000) {
          findings.push({
            category: 'unbounded_collection',
            title: `Large ${cls.className} instance(s) retaining ${formatBytes(cls.retainedSize)}`,
            description:
              `Found ${cls.count} ${cls.className} instance(s) with an average retained size of ` +
              `${formatBytes(retainedPerInstance)} per instance. This often indicates a cache or lookup table ` +
              `that grows without bounds (no eviction policy, no size limit, no TTL).`,
            confidence: retainedPerInstance > 500_000 ? 'high' : 'medium',
            evidence: [
              `${cls.count} ${cls.className} instances`,
              `Total retained: ${formatBytes(cls.retainedSize)}`,
              `Average per instance: ${formatBytes(retainedPerInstance)}`,
            ],
            recommendations: [
              `Add a maximum size limit to ${cls.className}-based caches (e.g., LRU eviction)`,
              'Consider using WeakMap/WeakRef for caches keyed by objects that should be GC-eligible',
              'Add TTL (time-to-live) expiration for cached entries',
            ],
            involvedClasses: [cls.className],
            estimatedImpact: cls.retainedSize,
          });
        }
      }

      if (cls.className === 'Array' && cls.retainedSize > 5_000_000) {
        findings.push({
          category: 'unbounded_collection',
          title: `Arrays retaining ${formatBytes(cls.retainedSize)} across ${cls.count} instances`,
          description:
            `Arrays are collectively retaining ${formatBytes(cls.retainedSize)}. If these are growing buffers ` +
            `or accumulator arrays, consider whether they need to retain all their contents or if older entries ` +
            `can be pruned.`,
          confidence: 'medium',
          evidence: [
            `${cls.count} Array instances`,
            `Total retained: ${formatBytes(cls.retainedSize)}`,
          ],
          recommendations: [
            'Check for arrays used as unbounded logs or event histories — add max length limits',
            'Consider streaming/processing data instead of accumulating it in arrays',
          ],
          involvedClasses: ['Array'],
          estimatedImpact: cls.retainedSize,
        });
      }
    }

    return findings;
  }

  private detectClosureCaptures(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const closureClass = summaries.find(
      (c) => c.className === '(closure)' || c.className === 'system / Closure',
    );

    if (closureClass && closureClass.count > 1000) {
      const avgSize = closureClass.retainedSize / closureClass.count;

      if (avgSize > 1000 || closureClass.retainedSize > 2_000_000) {
        findings.push({
          category: 'closure_capture',
          title: `${closureClass.count} closures retaining ${formatBytes(closureClass.retainedSize)}`,
          description:
            `Found ${closureClass.count} closure instances with an average retained size of ${formatBytes(avgSize)}. ` +
            `Closures capture variables from their enclosing scope. If a closure keeps a reference to a large ` +
            `object (DOM node, buffer, data structure), the entire object is retained even if only a small part is used.`,
          confidence: avgSize > 5000 ? 'high' : 'medium',
          evidence: [
            `${closureClass.count} closures`,
            `Total retained: ${formatBytes(closureClass.retainedSize)}`,
            `Average per closure: ${formatBytes(avgSize)}`,
          ],
          recommendations: [
            'Extract only needed values from enclosing scope instead of capturing entire objects',
            'Set captured variables to null/undefined when no longer needed inside long-lived closures',
            'Use named functions instead of closures for frequently-called callbacks',
          ],
          involvedClasses: [closureClass.className],
          estimatedImpact: closureClass.retainedSize,
        });
      }
    }

    return findings;
  }

  private detectStringAccumulation(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const stringClasses = summaries.filter((c) =>
      /^(string|concatenated string|sliced string)$/i.test(c.className),
    );

    const totalStringSize = stringClasses.reduce(
      (sum, c) => sum + c.retainedSize,
      0,
    );
    const totalStringCount = stringClasses.reduce((sum, c) => sum + c.count, 0);

    if (totalStringSize > 10_000_000) {
      findings.push({
        category: 'string_accumulation',
        title: `Strings consuming ${formatBytes(totalStringSize)} (${totalStringCount} instances)`,
        description:
          `Strings are collectively consuming ${formatBytes(totalStringSize)} of memory. ` +
          `This could indicate log accumulation, template string buildup, or JSON stringification ` +
          `of large objects being held in memory.`,
        confidence: totalStringSize > 50_000_000 ? 'high' : 'medium',
        evidence: stringClasses.map(
          (c) =>
            `${c.className}: ${c.count} instances, ${formatBytes(c.retainedSize)}`,
        ),
        recommendations: [
          'Check for accumulated log strings — consider streaming logs to disk instead of holding in memory',
          'Avoid JSON.stringify() on large objects for logging — use structured logging',
          'For string concatenation in loops, use Array.join() instead of += for better memory behavior',
        ],
        involvedClasses: stringClasses.map((c) => c.className),
        estimatedImpact: totalStringSize,
      });
    }

    return findings;
  }

  private detectBufferAccumulation(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const bufferClasses = summaries.filter((c) =>
      /buffer|arraybuffer|uint8array|typedarray|dataview/i.test(c.className),
    );

    const totalBufferSize = bufferClasses.reduce(
      (sum, c) => sum + c.retainedSize,
      0,
    );

    if (totalBufferSize > 5_000_000) {
      findings.push({
        category: 'buffer_accumulation',
        title: `Buffers/ArrayBuffers consuming ${formatBytes(totalBufferSize)}`,
        description:
          `Binary data containers are collectively using ${formatBytes(totalBufferSize)} of memory. ` +
          `This could indicate accumulated network response bodies, file read buffers, or crypto operations ` +
          `that haven't been released.`,
        confidence: totalBufferSize > 20_000_000 ? 'high' : 'medium',
        evidence: bufferClasses.map(
          (c) =>
            `${c.className}: ${c.count} instances, ${formatBytes(c.retainedSize)}`,
        ),
        recommendations: [
          'Ensure Buffers from file reads and network responses are dereferenced after processing',
          'Use streaming (stream.pipeline) instead of buffering entire files/responses in memory',
          'Check for accumulated response bodies from HTTP clients (axios, fetch, etc.)',
        ],
        involvedClasses: bufferClasses.map((c) => c.className),
        estimatedImpact: totalBufferSize,
      });
    }

    return findings;
  }

  private detectLargeRetainedTrees(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];

    // Look for classes where retained size >> shallow size (indicating large retained trees)
    for (const cls of summaries.slice(0, 50)) {
      if (cls.shallowSize > 0) {
        const ratio = cls.retainedSize / cls.shallowSize;
        if (ratio > 100 && cls.retainedSize > 1_000_000 && cls.count < 100) {
          findings.push({
            category: 'large_retained_tree',
            title: `${cls.className} retains ${ratio.toFixed(0)}x its shallow size`,
            description:
              `${cls.count} instance(s) of ${cls.className} have a shallow size of ${formatBytes(cls.shallowSize)} ` +
              `but retain ${formatBytes(cls.retainedSize)} — a ${ratio.toFixed(0)}x amplification. This means each ` +
              `instance is the sole retainer of a large object graph. Releasing these instances would free ` +
              `${formatBytes(cls.retainedSize)} of memory.`,
            confidence: ratio > 500 ? 'high' : 'medium',
            evidence: [
              `Shallow: ${formatBytes(cls.shallowSize)}, Retained: ${formatBytes(cls.retainedSize)}`,
              `Amplification ratio: ${ratio.toFixed(0)}x`,
              `Instance count: ${cls.count}`,
            ],
            recommendations: [
              `Review the lifecycle of ${cls.className} — ensure instances are released when no longer needed`,
              'Check if the retained graph includes cached data that could be evicted',
              'Consider breaking the retained tree into independently-releasable components',
            ],
            involvedClasses: [cls.className],
            estimatedImpact: cls.retainedSize,
          });
        }
      }
    }

    return findings;
  }

  private detectExcessiveAllocations(
    summaries: ClassSummary[],
    totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];

    // V8 internal types are enclosed in parentheses — (string), (code), (hidden), (array), etc.
    // These are EXPECTED to be high-count in normal heaps, so we use a much higher threshold.
    const V8_INTERNAL_THRESHOLD = 50; // 50% for V8 internals
    const USER_CLASS_THRESHOLD = 20; // 20% for user-defined classes

    // Flag any single class that represents an excessive share of all nodes
    for (const cls of summaries) {
      const percentage = (cls.count / totalNodes) * 100;
      const isV8Internal =
        cls.className.startsWith('(') && cls.className.endsWith(')');
      const threshold = isV8Internal
        ? V8_INTERNAL_THRESHOLD
        : USER_CLASS_THRESHOLD;
      if (percentage > threshold && cls.count > 1000) {
        findings.push({
          category: 'excessive_allocation',
          title: `${cls.className} represents ${percentage.toFixed(1)}% of all heap objects`,
          description:
            `${cls.count} out of ${totalNodes} heap objects (${percentage.toFixed(1)}%) are ${cls.className} instances. ` +
            `This level of allocation dominance often indicates an object pool that's grown too large, ` +
            `or a factory pattern creating more instances than needed.`,
          confidence: percentage > 40 ? 'high' : 'low',
          evidence: [
            `${cls.count} / ${totalNodes} total nodes (${percentage.toFixed(1)}%)`,
            `Retained: ${formatBytes(cls.retainedSize)}`,
          ],
          recommendations: [
            `Profile the allocation sites for ${cls.className} to find where they're being created`,
            'Consider object pooling or reuse patterns to reduce allocation count',
          ],
          involvedClasses: [cls.className],
          estimatedImpact: cls.retainedSize,
        });
      }
    }

    return findings;
  }

  private detectDetachedDOM(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const detachedClasses = summaries.filter(
      (c) =>
        /detached/i.test(c.className) ||
        /^(HTMLDivElement|HTMLSpanElement|HTMLElement|Node|Element)$/.test(
          c.className,
        ),
    );

    const detached = detachedClasses.filter((c) =>
      /detached/i.test(c.className),
    );
    if (detached.length > 0) {
      const totalRetained = detached.reduce(
        (sum, c) => sum + c.retainedSize,
        0,
      );
      findings.push({
        category: 'detached_dom',
        title: `Detached DOM nodes found (${detached.map((c) => `${c.count} ${c.className}`).join(', ')})`,
        description:
          `Detached DOM nodes are elements that have been removed from the document tree but are still ` +
          `referenced by JavaScript. They cannot be garbage collected until all references are released.`,
        confidence: 'high',
        evidence: detached.map(
          (c) =>
            `${c.className}: ${c.count} instances, ${formatBytes(c.retainedSize)}`,
        ),
        recommendations: [
          'Nullify references to removed DOM elements (set variables/properties to null after removeChild)',
          'Remove event listeners before removing DOM elements from the tree',
          'Use MutationObserver cleanup patterns for dynamically created elements',
        ],
        involvedClasses: detached.map((c) => c.className),
        estimatedImpact: totalRetained,
      });
    }

    return findings;
  }

  private detectTimerLeaks(
    summaries: ClassSummary[],
    _totalNodes: number,
  ): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];
    const timerClasses = summaries.filter((c) =>
      /timer|interval|timeout|Timeout/i.test(c.className),
    );

    for (const cls of timerClasses) {
      if (cls.count > 20) {
        findings.push({
          category: 'timer_leak',
          title: `${cls.count} active ${cls.className} instances`,
          description:
            `Found ${cls.count} timer/interval instances. Timers created with setInterval() or setTimeout() ` +
            `that are not cleared will retain their callback closure and all captured variables indefinitely.`,
          confidence: cls.count > 100 ? 'high' : 'medium',
          evidence: [
            `${cls.count} ${cls.className} instances`,
            `Retained: ${formatBytes(cls.retainedSize)}`,
          ],
          recommendations: [
            'Ensure every setInterval() has a corresponding clearInterval() in cleanup code',
            'Use AbortSignal with setTimeout() where supported for automatic cleanup',
            'In React/Vue/Angular: clear timers in useEffect cleanup / onUnmounted / ngOnDestroy',
          ],
          involvedClasses: [cls.className],
          estimatedImpact: cls.retainedSize,
        });
      }
    }

    return findings;
  }

  // ─── Leak Candidate Analysis ───────────────────────────────────────────

  private analyzeLeakCandidate(candidate: LeakCandidate): RootCauseFinding[] {
    const findings: RootCauseFinding[] = [];

    // Analyze retainer chains for patterns
    for (const chain of candidate.retainerChains) {
      const edgeNames = chain.chain.map((step) => step.edgeName);
      const nodeNames = chain.chain.map((step) => step.nodeName);

      // Check for event listener pattern
      if (edgeNames.some((e) => /listener|handler|_events/i.test(String(e)))) {
        findings.push({
          category: 'event_listener_leak',
          title: `${candidate.className} leaked via event listener chain`,
          description:
            `${candidate.className} instances are growing (${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}) ` +
            `and are retained through an event listener chain: ${chain.chain.map((s) => `${s.edgeName}→${s.nodeName}`).join(' → ')}`,
          confidence: candidate.confidence as Confidence,
          evidence: [
            `Growth: ${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}`,
            `Growth rate: ${candidate.growthRate} per snapshot`,
            `Total leaked: ${formatBytes(candidate.totalLeakedSize)}`,
            `Retainer chain: ${chain.chain.map((s) => s.edgeName).join(' → ')}`,
          ],
          recommendations: [
            `Remove event listeners that reference ${candidate.className} instances when they're no longer needed`,
            'Use once: true option for one-time event listeners',
          ],
          involvedClasses: [candidate.className, ...nodeNames],
          estimatedImpact: candidate.totalLeakedSize,
        });
      }
      // Check for cache/map pattern
      else if (
        edgeNames.some((e) => /cache|store|map|registry/i.test(String(e))) ||
        nodeNames.some((n) => /Map|Cache|Store/i.test(String(n)))
      ) {
        findings.push({
          category: 'unbounded_collection',
          title: `${candidate.className} accumulating in cache/collection`,
          description:
            `${candidate.className} instances are consistently growing and retained via a cache or collection: ` +
            `${chain.chain.map((s) => `${s.edgeName}→${s.nodeName}`).join(' → ')}`,
          confidence: candidate.confidence as Confidence,
          evidence: [
            `Growth: ${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}`,
            `Total leaked: ${formatBytes(candidate.totalLeakedSize)}`,
          ],
          recommendations: [
            'Add eviction policy (LRU, TTL) to the cache/collection',
            `Audit when ${candidate.className} entries are added vs removed from the collection`,
          ],
          involvedClasses: [candidate.className, ...nodeNames],
          estimatedImpact: candidate.totalLeakedSize,
        });
      }
      // General leak
      else {
        findings.push({
          category: 'general',
          title: `${candidate.className} consistently growing across snapshots`,
          description:
            `${candidate.className} count increased from ${candidate.countInSnapshot1} to ${candidate.countInSnapshot3} ` +
            `across 3 snapshots with a growth rate of ${candidate.growthRate} per interval. ` +
            `Retainer: ${chain.chain.map((s) => `${s.edgeName}→${s.nodeName}`).join(' → ')}`,
          confidence: candidate.confidence as Confidence,
          evidence: [
            `Growth: ${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}`,
            `Total leaked: ${formatBytes(candidate.totalLeakedSize)}`,
          ],
          recommendations: [
            `Investigate the lifecycle of ${candidate.className} instances`,
            'Check if references are being held after the objects are no longer needed',
          ],
          involvedClasses: [candidate.className],
          estimatedImpact: candidate.totalLeakedSize,
        });
      }
    }

    // If no retainer chains, add a general finding
    if (candidate.retainerChains.length === 0) {
      findings.push({
        category: 'general',
        title: `${candidate.className} consistently growing (no retainer chain available)`,
        description:
          `${candidate.className} count grew from ${candidate.countInSnapshot1} to ${candidate.countInSnapshot3}. ` +
          `Growth rate: ${candidate.growthRate}/interval. Total leaked: ${formatBytes(candidate.totalLeakedSize)}.`,
        confidence: candidate.confidence as Confidence,
        evidence: [
          `Growth: ${candidate.countInSnapshot1} → ${candidate.countInSnapshot2} → ${candidate.countInSnapshot3}`,
        ],
        recommendations: [
          `Profile allocation sites for ${candidate.className} to identify where instances are being created`,
        ],
        involvedClasses: [candidate.className],
        estimatedImpact: candidate.totalLeakedSize,
      });
    }

    return findings;
  }

  // ─── Health Score ──────────────────────────────────────────────────────

  private computeHealthScore(
    findings: RootCauseFinding[],
    _summaries: ClassSummary[],
  ): number {
    let score = 100;

    for (const f of findings) {
      switch (f.confidence) {
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
        default:
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  // BUG FIX #15: Clamp index and handle negative bytes properly
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    units.length - 1,
  );
  const value = abs / Math.pow(1024, i);
  return `${sign}${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
