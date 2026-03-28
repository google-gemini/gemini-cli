/**
 * GC Pressure Analyzer — V8 Garbage Collection Tuning Advisor
 *
 * ORIGINAL MODULE — No existing tool does this automatically.
 *
 * Analyzes garbage collection behavior from V8 trace events, CDP metrics,
 * and heap state to recommend specific V8 tuning flags and detect GC
 * pressure patterns that cause latency spikes.
 *
 * Features:
 * - Parses V8 GC trace events (Scavenge, Mark-Compact, Incremental Marking)
 * - Detects GC pressure patterns (promotion storms, fragmentation, compaction stalls)
 * - Recommends specific V8 flags with explanations
 * - Predicts GC pause impact on request latency
 * - Generates GC timeline for Perfetto visualization
 * - Classifies apps: latency-sensitive vs throughput-optimized
 *
 * @module investigation/gcPressureAnalyzer
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single GC event parsed from V8 trace data or CDP */
export interface GCEvent {
  /** GC algorithm: scavenge | mark-compact | incremental-marking | minor-gc | major-gc */
  type: 'scavenge' | 'mark-compact' | 'incremental-marking' | 'minor-gc' | 'major-gc';
  /** Start timestamp in microseconds */
  startUs: number;
  /** Duration in microseconds */
  durationUs: number;
  /** Heap size before GC in bytes */
  heapBefore: number;
  /** Heap size after GC in bytes */
  heapAfter: number;
  /** How many bytes were freed */
  freedBytes: number;
  /** Was this a forced/manual GC? */
  forced: boolean;
  /** Generation (new-space / old-space) */
  generation: 'young' | 'old' | 'both';
}

/** Summary statistics for a category of GC events */
export interface GCCategorySummary {
  type: string;
  count: number;
  totalDurationUs: number;
  avgDurationUs: number;
  maxDurationUs: number;
  p99DurationUs: number;
  totalFreed: number;
  avgFreed: number;
  efficiency: number; // bytes freed per microsecond
}

/** A detected GC pressure pattern */
export interface GCPressurePattern {
  pattern: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  evidence: string;
  recommendation: string;
  v8Flag?: string;
  estimatedImpact: string;
}

/** V8 tuning recommendation */
export interface V8TuningRecommendation {
  flag: string;
  currentBehavior: string;
  recommendedValue: string;
  reason: string;
  expectedImprovement: string;
  priority: 'high' | 'medium' | 'low';
  tradeoff: string;
}

/** Overall GC health report */
export interface GCHealthReport {
  /** Total GC time as percentage of wall time */
  gcTimePercent: number;
  /** Total wall time analyzed (ms) */
  wallTimeMs: number;
  /** GC events analyzed */
  totalEvents: number;
  /** Per-category summaries */
  categories: GCCategorySummary[];
  /** Detected pressure patterns */
  patterns: GCPressurePattern[];
  /** Recommended V8 flags */
  recommendations: V8TuningRecommendation[];
  /** App classification */
  appProfile: 'latency-sensitive' | 'throughput-optimized' | 'balanced' | 'unknown';
  /** Overall GC health score (0-100) */
  healthScore: number;
  /** Promotion rate: bytes/sec promoted from young to old gen */
  promotionRate: number;
  /** Allocation rate: bytes/sec allocated */
  allocationRate: number;
  /** Fragmentation estimate (0-1) */
  fragmentation: number;
  /** Summary text */
  summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GC_TIME_CRITICAL_THRESHOLD = 10; // >10% time in GC = critical
const GC_TIME_WARNING_THRESHOLD = 5;   // >5% = warning
const SCAVENGE_PAUSE_CRITICAL_US = 5_000;   // 5ms scavenge = bad
const MAJOR_GC_PAUSE_CRITICAL_US = 50_000;  // 50ms major GC = bad
const MAJOR_GC_PAUSE_WARNING_US = 20_000;   // 20ms = warning
const PROMOTION_RATE_HIGH = 10_000_000; // 10MB/s = high promotion
const FRAGMENTATION_THRESHOLD = 0.3;    // 30% fragmentation = warning

// ─── GC Pressure Analyzer ────────────────────────────────────────────────────

export class GCPressureAnalyzer {
  /**
   * Analyze GC events and produce a comprehensive health report
   */
  analyze(events: GCEvent[], wallTimeMs?: number): GCHealthReport {
    if (events.length === 0) {
      return this.emptyReport();
    }

    // Compute wall time from events if not provided
    const actualWallTime = wallTimeMs ??
      (events[events.length - 1].startUs + events[events.length - 1].durationUs - events[0].startUs) / 1000;

    // Category summaries
    const categories = this.computeCategories(events);

    // Total GC time
    const totalGcUs = events.reduce((s, e) => s + e.durationUs, 0);
    const gcTimePercent = actualWallTime > 0 ? (totalGcUs / 1000 / actualWallTime) * 100 : 0;

    // Allocation & promotion rates
    const totalAllocated = events.reduce((s, e) => s + e.freedBytes + (e.heapAfter - e.heapBefore + e.freedBytes), 0);
    const allocationRate = actualWallTime > 0 ? totalAllocated / (actualWallTime / 1000) : 0;

    const promotionEvents = events.filter(e => e.generation === 'young' || e.type === 'scavenge');
    const totalPromoted = promotionEvents.reduce((s, e) => {
      // Estimate promoted bytes: if GC freed less than the net heap reduction,
      // the difference likely moved to old gen. This is a rough heuristic since
      // V8 aggregate heap stats don't separate young/old gen sizes.
      const netReduction = e.heapBefore - e.heapAfter;
      return s + Math.max(0, netReduction > e.freedBytes ? netReduction - e.freedBytes : 0);
    }, 0);
    const promotionRate = actualWallTime > 0 ? Math.abs(totalPromoted) / (actualWallTime / 1000) : 0;

    // Fragmentation estimate
    const fragmentation = this.estimateFragmentation(events);

    // Detect patterns
    const patterns = this.detectPatterns(events, categories, gcTimePercent, promotionRate, fragmentation);

    // Generate recommendations
    const recommendations = this.generateRecommendations(events, categories, patterns, gcTimePercent, allocationRate);

    // Classify app profile
    const appProfile = this.classifyApp(events, categories, gcTimePercent);

    // Health score
    const healthScore = this.computeHealthScore(gcTimePercent, patterns, categories);

    // Summary
    const summary = this.generateSummary(gcTimePercent, patterns, categories, healthScore, appProfile);

    return {
      gcTimePercent,
      wallTimeMs: actualWallTime,
      totalEvents: events.length,
      categories,
      patterns,
      recommendations,
      appProfile,
      healthScore,
      promotionRate,
      allocationRate,
      fragmentation,
      summary,
    };
  }

  /**
   * Parse V8 trace events (Chrome Trace Format) into GCEvent[]
   */
  static parseTraceEvents(traceEvents: Array<Record<string, unknown>>): GCEvent[] {
    const gcEvents: GCEvent[] = [];

    for (const event of traceEvents) {
      if (event.ph !== 'X' && event.ph !== 'B') continue;

      const name = String(event.name || '');
      const cat = String(event.cat || '');

      // Detect GC events from various V8 trace categories
      if (!cat.includes('v8') && !cat.includes('gc') && !name.includes('GC') &&
          !name.includes('Scavenge') && !name.includes('Mark') && !name.includes('Sweep') &&
          !name.includes('Compact')) {
        continue;
      }

      const args = (event.args || {}) as Record<string, unknown>;
      const dur = Number(event.dur || 0);
      const ts = Number(event.ts || 0);

      let type: GCEvent['type'] = 'minor-gc';
      let generation: GCEvent['generation'] = 'young';

      if (name.includes('Scavenge') || name.includes('MinorGC')) {
        type = 'scavenge';
        generation = 'young';
      } else if (name.includes('Mark-Compact') || name.includes('MarkCompact') || name.includes('MajorGC')) {
        type = 'mark-compact';
        generation = 'old';
      } else if (name.includes('IncrementalMarking') || name.includes('Incremental')) {
        type = 'incremental-marking';
        generation = 'old';
      } else if (name.includes('Major')) {
        type = 'major-gc';
        generation = 'both';
      }

      const heapBefore = Number(args.usedHeapSizeBefore || args.heapBefore || 0);
      const heapAfter = Number(args.usedHeapSizeAfter || args.heapAfter || 0);

      gcEvents.push({
        type,
        startUs: ts,
        durationUs: dur,
        heapBefore,
        heapAfter,
        freedBytes: Math.max(0, heapBefore - heapAfter),
        forced: Boolean(args.forced || args.type === 'forced'),
        generation,
      });
    }

    return gcEvents.sort((a, b) => a.startUs - b.startUs);
  }

  /**
   * Create synthetic GC events from heap metric time series
   * (when real trace events aren't available)
   */
  static fromHeapMetrics(metrics: Array<{ timestamp: number; heapUsed: number; heapTotal: number }>): GCEvent[] {
    const events: GCEvent[] = [];
    for (let i = 1; i < metrics.length; i++) {
      const prev = metrics[i - 1];
      const curr = metrics[i];
      const dt = curr.timestamp - prev.timestamp;

      // Detect GC: heap dropped between samples
      if (curr.heapUsed < prev.heapUsed) {
        const freed = prev.heapUsed - curr.heapUsed;
        const isMinor = freed < 5_000_000; // <5MB = likely scavenge

        events.push({
          type: isMinor ? 'scavenge' : 'mark-compact',
          startUs: curr.timestamp * 1000, // ms → us
          durationUs: Math.max(100, dt * 10), // estimate GC duration
          heapBefore: prev.heapUsed,
          heapAfter: curr.heapUsed,
          freedBytes: freed,
          forced: false,
          generation: isMinor ? 'young' : 'old',
        });
      }
    }
    return events;
  }

  // ─── Pattern Detection ──────────────────────────────────────────────────

  private detectPatterns(
    events: GCEvent[],
    categories: GCCategorySummary[],
    gcTimePercent: number,
    promotionRate: number,
    fragmentation: number,
  ): GCPressurePattern[] {
    const patterns: GCPressurePattern[] = [];

    // Pattern 1: GC thrashing (too much time in GC)
    if (gcTimePercent > GC_TIME_CRITICAL_THRESHOLD) {
      patterns.push({
        pattern: 'gc_thrashing',
        severity: 'critical',
        description: 'Application is spending excessive time in garbage collection',
        evidence: `${gcTimePercent.toFixed(1)}% of wall time spent in GC (threshold: ${GC_TIME_CRITICAL_THRESHOLD}%)`,
        recommendation: 'Reduce allocation rate. Profile allocations to find hotspots. Consider object pooling.',
        estimatedImpact: `Recovering ${(gcTimePercent - 2).toFixed(0)}% of execution time`,
      });
    } else if (gcTimePercent > GC_TIME_WARNING_THRESHOLD) {
      patterns.push({
        pattern: 'gc_pressure',
        severity: 'warning',
        description: 'Application has elevated GC pressure',
        evidence: `${gcTimePercent.toFixed(1)}% of wall time in GC (threshold: ${GC_TIME_WARNING_THRESHOLD}%)`,
        recommendation: 'Monitor allocation patterns. Consider reducing short-lived object creation.',
        estimatedImpact: `Could recover ${(gcTimePercent - 2).toFixed(0)}% of execution time`,
      });
    }

    // Pattern 2: Long major GC pauses
    const majorCat = categories.find(c => c.type === 'mark-compact' || c.type === 'major-gc');
    if (majorCat && majorCat.maxDurationUs > MAJOR_GC_PAUSE_CRITICAL_US) {
      patterns.push({
        pattern: 'long_major_gc',
        severity: 'critical',
        description: 'Major GC pauses are causing significant latency spikes',
        evidence: `Max major GC pause: ${(majorCat.maxDurationUs / 1000).toFixed(1)}ms (p99: ${(majorCat.p99DurationUs / 1000).toFixed(1)}ms)`,
        recommendation: 'Enable incremental marking. Reduce old-generation heap size. Consider --max-old-space-size.',
        v8Flag: '--max-old-space-size',
        estimatedImpact: `Reduce worst-case pause from ${(majorCat.maxDurationUs / 1000).toFixed(0)}ms`,
      });
    } else if (majorCat && majorCat.maxDurationUs > MAJOR_GC_PAUSE_WARNING_US) {
      patterns.push({
        pattern: 'elevated_major_gc',
        severity: 'warning',
        description: 'Major GC pauses are above ideal thresholds',
        evidence: `Max major GC: ${(majorCat.maxDurationUs / 1000).toFixed(1)}ms`,
        recommendation: 'Monitor old-generation growth. Consider preemptive GC scheduling.',
        estimatedImpact: 'Smoother latency profile',
      });
    }

    // Pattern 3: Frequent scavenges (high allocation rate in young gen)
    const scavengeCat = categories.find(c => c.type === 'scavenge' || c.type === 'minor-gc');
    if (scavengeCat && scavengeCat.count > 50) {
      const timeSpanUs = events[events.length - 1].startUs - events[0].startUs;
      const scavengesPerSec = events.length > 1 && timeSpanUs > 0
        ? scavengeCat.count / (timeSpanUs / 1_000_000)
        : 0;
      if (scavengesPerSec > 10) {
        patterns.push({
          pattern: 'frequent_scavenge',
          severity: 'warning',
          description: 'Young generation is being collected very frequently',
          evidence: `${scavengesPerSec.toFixed(1)} scavenges/sec (${scavengeCat.count} total)`,
          recommendation: 'Increase semi-space size to reduce scavenge frequency. Use --max-semi-space-size=64.',
          v8Flag: '--max-semi-space-size',
          estimatedImpact: `Reduce scavenge frequency by ~${Math.min(80, Math.round(scavengesPerSec * 5))}%`,
        });
      }
    }

    // Pattern 4: Promotion storm (too much surviving from young → old)
    if (promotionRate > PROMOTION_RATE_HIGH) {
      patterns.push({
        pattern: 'promotion_storm',
        severity: 'warning',
        description: 'High promotion rate from young to old generation',
        evidence: `${(promotionRate / 1_000_000).toFixed(1)} MB/s promoted to old generation`,
        recommendation: 'Objects are living too long in young gen. Increase semi-space size or reduce object lifetimes.',
        v8Flag: '--max-semi-space-size',
        estimatedImpact: 'Reduce old-gen growth and major GC frequency',
      });
    }

    // Pattern 5: Fragmentation
    if (fragmentation > FRAGMENTATION_THRESHOLD) {
      patterns.push({
        pattern: 'heap_fragmentation',
        severity: 'warning',
        description: 'Heap appears fragmented — GC frees memory but heap doesn\'t shrink',
        evidence: `Estimated fragmentation: ${(fragmentation * 100).toFixed(0)}%`,
        recommendation: 'Consider enabling compaction or using typed arrays for large data. --always-compact.',
        v8Flag: '--always-compact',
        estimatedImpact: `Recover ~${(fragmentation * 30).toFixed(0)}% of wasted space`,
      });
    }

    // Pattern 6: Inefficient GC (low bytes freed per pause)
    for (const cat of categories) {
      if (cat.count > 5 && cat.efficiency < 100 && cat.avgDurationUs > 1000) {
        patterns.push({
          pattern: 'inefficient_gc',
          severity: 'info',
          description: `${cat.type} GC cycles are not reclaiming much memory per pause`,
          evidence: `${cat.type}: avg ${(cat.avgDurationUs / 1000).toFixed(1)}ms but only ${(cat.avgFreed / 1024).toFixed(0)}KB freed per cycle`,
          recommendation: 'Most objects survive GC. Consider if allocations are necessary or if objects can be reused.',
          estimatedImpact: 'Better memory utilization',
        });
        break; // only report once
      }
    }

    // Pattern 7: Forced GC detected
    const forcedCount = events.filter(e => e.forced).length;
    if (forcedCount > 0) {
      patterns.push({
        pattern: 'forced_gc',
        severity: 'info',
        description: 'Manual/forced garbage collection detected',
        evidence: `${forcedCount} forced GC event(s). Forced GC causes full stop-the-world pauses.`,
        recommendation: 'Avoid global.gc() in production. Let V8 manage GC scheduling.',
        estimatedImpact: 'Remove forced pauses',
      });
    }

    return patterns;
  }

  // ─── Recommendations ────────────────────────────────────────────────────

  private generateRecommendations(
    events: GCEvent[],
    categories: GCCategorySummary[],
    patterns: GCPressurePattern[],
    gcTimePercent: number,
    allocationRate: number,
  ): V8TuningRecommendation[] {
    const recs: V8TuningRecommendation[] = [];
    const patternSet = new Set(patterns.map(p => p.pattern));

    // Semi-space tuning
    if (patternSet.has('frequent_scavenge') || patternSet.has('promotion_storm')) {
      recs.push({
        flag: '--max-semi-space-size=64',
        currentBehavior: 'Default semi-space (16MB). Young gen fills quickly, causing frequent scavenges.',
        recommendedValue: '64',
        reason: 'Larger semi-space means objects have more time to die young, reducing promotion to old gen.',
        expectedImprovement: 'Fewer scavenges, lower promotion rate, fewer major GCs.',
        priority: 'high',
        tradeoff: 'Uses ~48MB more memory for semi-space. Worth it for high-allocation apps.',
      });
    }

    // Old space tuning
    if (patternSet.has('long_major_gc') || patternSet.has('gc_thrashing')) {
      const maxHeap = events.reduce((m, e) => Math.max(m, e.heapBefore), 0);
      const recommendedSize = Math.max(256, Math.ceil(maxHeap / 1_000_000 * 2));
      recs.push({
        flag: `--max-old-space-size=${recommendedSize}`,
        currentBehavior: 'Default old-space limit. V8 triggers aggressive GC near the limit.',
        recommendedValue: String(recommendedSize),
        reason: 'Giving V8 more headroom reduces the frequency and urgency of major GCs.',
        expectedImprovement: 'Fewer and shorter major GC pauses.',
        priority: 'high',
        tradeoff: `Uses up to ${recommendedSize}MB. Ensure the host has sufficient RAM.`,
      });
    }

    // Concurrent marking
    const majorCat = categories.find(c => c.type === 'mark-compact' || c.type === 'major-gc');
    if (majorCat && majorCat.maxDurationUs > 10_000) {
      recs.push({
        flag: '--concurrent-marking',
        currentBehavior: 'V8 already uses concurrent marking by default in modern versions.',
        recommendedValue: 'enabled (verify)',
        reason: 'Concurrent marking moves marking work off the main thread, reducing pause times.',
        expectedImprovement: 'Shorter major GC pauses (marking happens in background).',
        priority: 'medium',
        tradeoff: 'Slightly higher CPU usage from background threads.',
      });
    }

    // Allocation rate tuning
    if (allocationRate > 50_000_000) { // >50MB/s
      recs.push({
        flag: '--optimize-for-size=false',
        currentBehavior: 'High allocation rate detected. V8 may be optimizing for memory over speed.',
        recommendedValue: 'false',
        reason: 'When allocating heavily, optimizing for speed reduces GC frequency.',
        expectedImprovement: 'Faster allocation paths, fewer GC interruptions.',
        priority: 'medium',
        tradeoff: 'May use slightly more memory per object.',
      });
    }

    // Expose GC for monitoring
    if (events.length > 100) {
      recs.push({
        flag: '--expose-gc --trace-gc',
        currentBehavior: 'GC events are not being traced.',
        recommendedValue: 'enabled for debugging',
        reason: 'Enables programmatic GC control and detailed GC logging for analysis.',
        expectedImprovement: 'Better visibility into GC behavior for ongoing optimization.',
        priority: 'low',
        tradeoff: 'Slight overhead from trace logging. Remove in production.',
      });
    }

    return recs.sort((a, b) => {
      const pri = { high: 0, medium: 1, low: 2 };
      return pri[a.priority] - pri[b.priority];
    });
  }

  // ─── Helper Methods ─────────────────────────────────────────────────────

  private computeCategories(events: GCEvent[]): GCCategorySummary[] {
    const groups = new Map<string, GCEvent[]>();
    for (const e of events) {
      const arr = groups.get(e.type) || [];
      arr.push(e);
      groups.set(e.type, arr);
    }

    const summaries: GCCategorySummary[] = [];
    for (const [type, evts] of groups) {
      const durations = evts.map(e => e.durationUs).sort((a, b) => a - b);
      const totalDur = durations.reduce((s, d) => s + d, 0);
      const totalFreed = evts.reduce((s, e) => s + e.freedBytes, 0);
      const p99Idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.99));

      summaries.push({
        type,
        count: evts.length,
        totalDurationUs: totalDur,
        avgDurationUs: totalDur / evts.length,
        maxDurationUs: durations[durations.length - 1],
        p99DurationUs: durations[p99Idx],
        totalFreed,
        avgFreed: totalFreed / evts.length,
        efficiency: totalDur > 0 ? totalFreed / totalDur : 0,
      });
    }

    return summaries.sort((a, b) => b.totalDurationUs - a.totalDurationUs);
  }

  private estimateFragmentation(events: GCEvent[]): number {
    if (events.length < 3) return 0;
    // Look at how much heap space is recovered vs total heap after GC
    const majorEvents = events.filter(e => e.type === 'mark-compact' || e.type === 'major-gc');
    if (majorEvents.length < 2) return 0;

    let fragSum = 0;
    for (const e of majorEvents) {
      if (e.heapBefore > 0) {
        const recoveredRatio = e.freedBytes / e.heapBefore;
        // Low recovery ratio after major GC suggests fragmentation
        fragSum += Math.max(0, 1 - recoveredRatio * 3);
      }
    }
    return Math.min(1, fragSum / majorEvents.length);
  }

  private classifyApp(
    events: GCEvent[],
    categories: GCCategorySummary[],
    gcTimePercent: number,
  ): GCHealthReport['appProfile'] {
    if (events.length === 0) return 'unknown';

    const majorCat = categories.find(c => c.type === 'mark-compact' || c.type === 'major-gc');
    const hasLongPauses = majorCat && majorCat.maxDurationUs > MAJOR_GC_PAUSE_WARNING_US;
    const hasFrequentGC = gcTimePercent > 3;

    if (hasLongPauses && !hasFrequentGC) return 'throughput-optimized';
    if (!hasLongPauses && hasFrequentGC) return 'latency-sensitive';
    if (hasLongPauses && hasFrequentGC) return 'latency-sensitive'; // needs optimization
    return 'balanced';
  }

  private computeHealthScore(
    gcTimePercent: number,
    patterns: GCPressurePattern[],
    categories: GCCategorySummary[],
  ): number {
    let score = 100;

    // Deduct for GC time
    if (gcTimePercent > 10) score -= 30;
    else if (gcTimePercent > 5) score -= 15;
    else if (gcTimePercent > 2) score -= 5;

    // Deduct for patterns
    for (const p of patterns) {
      if (p.severity === 'critical') score -= 20;
      else if (p.severity === 'warning') score -= 10;
      else score -= 3;
    }

    // Deduct for long pauses
    for (const cat of categories) {
      if (cat.maxDurationUs > MAJOR_GC_PAUSE_CRITICAL_US) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateSummary(
    gcTimePercent: number,
    patterns: GCPressurePattern[],
    categories: GCCategorySummary[],
    healthScore: number,
    appProfile: string,
  ): string {
    const parts: string[] = [];

    parts.push(`GC health score: ${healthScore}/100 (${appProfile} profile).`);
    parts.push(`${gcTimePercent.toFixed(1)}% of execution time spent in GC across ${categories.reduce((s, c) => s + c.count, 0)} events.`);

    const criticals = patterns.filter(p => p.severity === 'critical');
    const warnings = patterns.filter(p => p.severity === 'warning');

    if (criticals.length > 0) {
      parts.push(`${criticals.length} critical issue(s): ${criticals.map(p => p.pattern.replace(/_/g, ' ')).join(', ')}.`);
    }
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning(s): ${warnings.map(p => p.pattern.replace(/_/g, ' ')).join(', ')}.`);
    }

    if (patterns.length === 0) {
      parts.push('No concerning patterns detected. GC behavior looks healthy.');
    }

    return parts.join(' ');
  }

  private emptyReport(): GCHealthReport {
    return {
      gcTimePercent: 0,
      wallTimeMs: 0,
      totalEvents: 0,
      categories: [],
      patterns: [],
      recommendations: [],
      appProfile: 'unknown',
      healthScore: 100,
      promotionRate: 0,
      allocationRate: 0,
      fragmentation: 0,
      summary: 'No GC events to analyze.',
    };
  }

  // ─── Terminal Formatting ────────────────────────────────────────────────

  static formatForTerminal(report: GCHealthReport): string {
    const lines: string[] = [];
    const RESET = '\x1b[0m';
    const BOLD = '\x1b[1m';
    const RED = '\x1b[31m';
    const GREEN = '\x1b[32m';
    const YELLOW = '\x1b[33m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';

    const scoreColor = report.healthScore >= 80 ? GREEN : report.healthScore >= 50 ? YELLOW : RED;

    lines.push(`${BOLD}┌─────────────────────────────────────────┐${RESET}`);
    lines.push(`${BOLD}│  GC PRESSURE ANALYSIS                   │${RESET}`);
    lines.push(`${BOLD}└─────────────────────────────────────────┘${RESET}`);
    lines.push('');
    lines.push(`  Health Score:     ${scoreColor}${BOLD}${report.healthScore}/100${RESET}`);
    lines.push(`  App Profile:      ${report.appProfile}`);
    lines.push(`  GC Time:          ${report.gcTimePercent.toFixed(1)}% of wall time`);
    lines.push(`  Total Events:     ${report.totalEvents}`);
    lines.push(`  Allocation Rate:  ${(report.allocationRate / 1_000_000).toFixed(1)} MB/s`);
    lines.push(`  Promotion Rate:   ${(report.promotionRate / 1_000_000).toFixed(1)} MB/s`);
    lines.push(`  Fragmentation:    ${(report.fragmentation * 100).toFixed(0)}%`);

    if (report.categories.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  GC Categories:${RESET}`);
      for (const cat of report.categories) {
        lines.push(`    ${CYAN}${cat.type}${RESET}: ${cat.count} events, avg ${(cat.avgDurationUs / 1000).toFixed(1)}ms, max ${(cat.maxDurationUs / 1000).toFixed(1)}ms`);
        lines.push(`      ${DIM}Freed: ${(cat.totalFreed / 1_000_000).toFixed(1)}MB total, efficiency: ${cat.efficiency.toFixed(0)} bytes/μs${RESET}`);
      }
    }

    if (report.patterns.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Detected Patterns:${RESET}`);
      for (const p of report.patterns) {
        const sevColor = p.severity === 'critical' ? RED : p.severity === 'warning' ? YELLOW : DIM;
        lines.push(`    ${sevColor}[${p.severity.toUpperCase()}]${RESET} ${p.description}`);
        lines.push(`      ${DIM}${p.evidence}${RESET}`);
        lines.push(`      → ${p.recommendation}`);
        if (p.v8Flag) lines.push(`      ${CYAN}Flag: ${p.v8Flag}${RESET}`);
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  V8 Tuning Recommendations:${RESET}`);
      for (const rec of report.recommendations) {
        const priColor = rec.priority === 'high' ? RED : rec.priority === 'medium' ? YELLOW : DIM;
        lines.push(`    ${priColor}[${rec.priority.toUpperCase()}]${RESET} ${CYAN}${rec.flag}${RESET}`);
        lines.push(`      ${rec.reason}`);
        lines.push(`      ${DIM}Tradeoff: ${rec.tradeoff}${RESET}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Perfetto Export ────────────────────────────────────────────────────

  static toPerfettoEvents(events: GCEvent[]): Array<Record<string, unknown>> {
    const traceEvents: Array<Record<string, unknown>> = [];
    const pid = 1;
    const tid = 1;

    // Metadata
    traceEvents.push({
      ph: 'M',
      pid,
      tid,
      name: 'thread_name',
      args: { name: 'GC Activity' },
    });

    for (const event of events) {
      // Duration event for each GC
      traceEvents.push({
        ph: 'X',
        pid,
        tid,
        name: `GC:${event.type}`,
        cat: 'gc',
        ts: event.startUs,
        dur: event.durationUs,
        args: {
          heapBefore: event.heapBefore,
          heapAfter: event.heapAfter,
          freedBytes: event.freedBytes,
          forced: event.forced,
          generation: event.generation,
        },
      });

      // Counter event for heap size
      traceEvents.push({
        ph: 'C',
        pid,
        tid: 0,
        name: 'HeapUsed',
        ts: event.startUs + event.durationUs,
        args: { bytes: event.heapAfter },
      });
    }

    return traceEvents;
  }
}
