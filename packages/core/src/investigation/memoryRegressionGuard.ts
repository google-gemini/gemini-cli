/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/memoryRegressionGuard
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Memory fingerprint of a single heap snapshot */
export interface MemoryFingerprint {
  /** Unique fingerprint ID */
  id: string;
  /** Timestamp of capture */
  timestamp: number;
  /** Git commit hash (if available) */
  commitHash?: string;
  /** Git branch name */
  branch?: string;
  /** Total heap size in bytes */
  totalHeapSize: number;
  /** Number of heap objects */
  objectCount: number;
  /** Per-class breakdown */
  classDistribution: ClassFingerprint[];
  /** Top retainer chains (serialized) */
  topRetainers: RetainerFingerprint[];
  /** Metadata */
  meta: {
    snapshotFile?: string;
    nodeVersion?: string;
    platform?: string;
    label?: string;
  };
}

/** Per-class memory signature */
export interface ClassFingerprint {
  className: string;
  instanceCount: number;
  shallowSize: number;
  retainedSize: number;
  /** Percentage of total heap */
  heapShare: number;
}

/** Serialized retainer chain for fingerprinting */
export interface RetainerFingerprint {
  targetClass: string;
  retainedSize: number;
  chainLength: number;
  /** Hash of the retainer path for comparison */
  pathHash: string;
}

/** Memory budget definition */
export interface MemoryBudget {
  /** Total heap size budget in bytes */
  totalHeapMax?: number;
  /** Total object count budget */
  objectCountMax?: number;
  /** Per-class budgets */
  classBudgets?: Array<{
    className: string;
    maxRetainedSize?: number;
    maxInstances?: number;
  }>;
  /** Maximum allowed growth rate per run (percentage) */
  maxGrowthPercent?: number;
}

/** Result of comparing two fingerprints */
export interface RegressionResult {
  /** Did we detect a regression? */
  isRegression: boolean;
  /** Overall severity */
  severity: 'pass' | 'warning' | 'failure';
  /** Individual violations */
  violations: RegressionViolation[];
  /** Summary for CI output */
  summary: string;
  /** Detailed comparison */
  comparison: FingerprintComparison;
  /** Suggested CI exit code (0=pass, 1=failure, 2=warning) */
  exitCode: number;
}

/** A single regression violation */
export interface RegressionViolation {
  type:
    | 'heap_growth'
    | 'class_growth'
    | 'new_retention'
    | 'budget_exceeded'
    | 'trend_regression';
  severity: 'warning' | 'failure';
  description: string;
  /** What changed */
  metric: string;
  /** Previous value */
  baseline: number;
  /** Current value */
  current: number;
  /** Change percentage */
  changePercent: number;
  /** Class involved (if class-specific) */
  className?: string;
}

/** Detailed comparison between two fingerprints */
export interface FingerprintComparison {
  heapDelta: number;
  heapDeltaPercent: number;
  objectCountDelta: number;
  objectCountDeltaPercent: number;
  /** Classes that grew the most */
  topGrowers: Array<ClassFingerprint & { delta: number; deltaPercent: number }>;
  /** New classes that appeared */
  newClasses: ClassFingerprint[];
  /** Classes that disappeared */
  removedClasses: string[];
}

/** Baseline store entry */
export interface BaselineEntry {
  fingerprint: MemoryFingerprint;
  budget?: MemoryBudget;
  /** Rolling history for trend detection */
  history: MemoryFingerprint[];
}

/** Trend analysis across historical baselines */
export interface TrendAnalysis {
  /** Is heap trending upward? */
  isGrowing: boolean;
  /** Growth rate in bytes per run */
  growthPerRun: number;
  /** R² of the linear fit */
  confidence: number;
  /** How many runs analyzed */
  dataPoints: number;
  /** Per-class trends */
  classTrends: Array<{
    className: string;
    growthPerRun: number;
    isGrowing: boolean;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GROWTH_WARNING_PERCENT = 5; // 5% growth = warning
const DEFAULT_GROWTH_FAILURE_PERCENT = 15; // 15% growth = failure
const DEFAULT_CLASS_GROWTH_THRESHOLD = 20; // 20% class growth = flag
const DEFAULT_HISTORY_WINDOW = 20; // Keep last 20 runs
const TREND_MIN_POINTS = 3; // Need 3+ points for trend

// ─── Memory Regression Guard ─────────────────────────────────────────────────

export class MemoryRegressionGuard {
  private baselines = new Map<string, BaselineEntry>();

  /**
   * Create a memory fingerprint from heap analysis data
   */
  createFingerprint(
    classSummaries: Array<{
      className: string;
      count: number;
      shallowSize: number;
      retainedSize: number;
    }>,
    options?: {
      commitHash?: string;
      branch?: string;
      label?: string;
      snapshotFile?: string;
      retainerChains?: Array<{
        targetClass: string;
        retainedSize: number;
        chain: string[];
      }>;
    },
  ): MemoryFingerprint {
    const totalHeap = classSummaries.reduce((s, c) => s + c.retainedSize, 0);
    const objectCount = classSummaries.reduce((s, c) => s + c.count, 0);

    const classDistribution: ClassFingerprint[] = classSummaries
      .map((c) => ({
        className: c.className,
        instanceCount: c.count,
        shallowSize: c.shallowSize,
        retainedSize: c.retainedSize,
        heapShare: totalHeap > 0 ? (c.retainedSize / totalHeap) * 100 : 0,
      }))
      .sort((a, b) => b.retainedSize - a.retainedSize);

    const topRetainers: RetainerFingerprint[] = (options?.retainerChains || [])
      .slice(0, 20)
      .map((rc) => ({
        targetClass: rc.targetClass,
        retainedSize: rc.retainedSize,
        chainLength: rc.chain.length,
        pathHash: this.hashPath(rc.chain),
      }));

    return {
      id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      commitHash: options?.commitHash,
      branch: options?.branch,
      totalHeapSize: totalHeap,
      objectCount,
      classDistribution,
      topRetainers,
      meta: {
        snapshotFile: options?.snapshotFile,
        label: options?.label,
        nodeVersion:
          typeof process !== 'undefined' ? process.version : undefined,
        platform: typeof process !== 'undefined' ? process.platform : undefined,
      },
    };
  }

  /**
   * Set or update the baseline for a given key (e.g., branch name)
   */
  setBaseline(
    key: string,
    fingerprint: MemoryFingerprint,
    budget?: MemoryBudget,
  ): void {
    const existing = this.baselines.get(key);
    const history = existing
      ? [...existing.history, fingerprint].slice(-DEFAULT_HISTORY_WINDOW)
      : [fingerprint];

    this.baselines.set(key, {
      fingerprint,
      budget,
      history,
    });
  }

  /**
   * Get the baseline for a given key
   */
  getBaseline(key: string): BaselineEntry | undefined {
    return this.baselines.get(key);
  }

  /**
   * Compare a new fingerprint against the baseline and detect regressions
   */
  checkRegression(
    key: string,
    current: MemoryFingerprint,
    budget?: MemoryBudget,
  ): RegressionResult {
    const baseline = this.baselines.get(key);
    if (!baseline) {
      return {
        isRegression: false,
        severity: 'pass',
        violations: [],
        summary: `No baseline found for "${key}". Setting current as baseline.`,
        comparison: this.emptyComparison(),
        exitCode: 0,
      };
    }

    const activeBudget = budget || baseline.budget;
    const comparison = this.compareFingerprints(baseline.fingerprint, current);
    const violations: RegressionViolation[] = [];

    // Check 1: Total heap growth
    if (comparison.heapDeltaPercent > DEFAULT_GROWTH_FAILURE_PERCENT) {
      violations.push({
        type: 'heap_growth',
        severity: 'failure',
        description: `Heap grew by ${comparison.heapDeltaPercent.toFixed(1)}% (${this.formatBytes(comparison.heapDelta)})`,
        metric: 'totalHeapSize',
        baseline: baseline.fingerprint.totalHeapSize,
        current: current.totalHeapSize,
        changePercent: comparison.heapDeltaPercent,
      });
    } else if (comparison.heapDeltaPercent > DEFAULT_GROWTH_WARNING_PERCENT) {
      violations.push({
        type: 'heap_growth',
        severity: 'warning',
        description: `Heap grew by ${comparison.heapDeltaPercent.toFixed(1)}% (${this.formatBytes(comparison.heapDelta)})`,
        metric: 'totalHeapSize',
        baseline: baseline.fingerprint.totalHeapSize,
        current: current.totalHeapSize,
        changePercent: comparison.heapDeltaPercent,
      });
    }

    // Check 2: Per-class growth
    for (const grower of comparison.topGrowers) {
      if (
        grower.deltaPercent > DEFAULT_CLASS_GROWTH_THRESHOLD &&
        grower.delta > 10_000
      ) {
        violations.push({
          type: 'class_growth',
          severity: grower.deltaPercent > 50 ? 'failure' : 'warning',
          description: `${grower.className} grew by ${grower.deltaPercent.toFixed(1)}% (+${this.formatBytes(grower.delta)})`,
          metric: 'classRetainedSize',
          baseline: grower.retainedSize - grower.delta,
          current: grower.retainedSize,
          changePercent: grower.deltaPercent,
          className: grower.className,
        });
      }
    }

    // Check 3: New retention patterns (classes that appeared)
    for (const newClass of comparison.newClasses) {
      if (newClass.retainedSize > 50_000) {
        // >50KB new class
        violations.push({
          type: 'new_retention',
          severity: newClass.retainedSize > 500_000 ? 'failure' : 'warning',
          description: `New class "${newClass.className}" appeared with ${this.formatBytes(newClass.retainedSize)}`,
          metric: 'newClassRetained',
          baseline: 0,
          current: newClass.retainedSize,
          changePercent: 100,
          className: newClass.className,
        });
      }
    }

    // Check 4: Budget enforcement
    if (activeBudget) {
      this.checkBudget(current, activeBudget, violations);
    }

    // Check 5: Trend-based regression (needs history)
    if (baseline.history.length >= TREND_MIN_POINTS) {
      const trend = this.analyzeTrend([...baseline.history, current]);
      if (
        trend.isGrowing &&
        trend.confidence > 0.7 &&
        trend.growthPerRun > 50_000
      ) {
        violations.push({
          type: 'trend_regression',
          severity: trend.growthPerRun > 500_000 ? 'failure' : 'warning',
          description: `Consistent memory growth trend: +${this.formatBytes(trend.growthPerRun)}/run over ${trend.dataPoints} runs (R²=${trend.confidence.toFixed(2)})`,
          metric: 'trendGrowthPerRun',
          baseline: 0,
          current: trend.growthPerRun,
          changePercent: 0,
        });
      }
    }

    const failures = violations.filter((v) => v.severity === 'failure');
    const warnings = violations.filter((v) => v.severity === 'warning');

    const severity: RegressionResult['severity'] =
      failures.length > 0
        ? 'failure'
        : warnings.length > 0
          ? 'warning'
          : 'pass';

    const exitCode =
      severity === 'failure' ? 1 : severity === 'warning' ? 2 : 0;

    let summary: string;
    if (severity === 'pass') {
      summary = `Memory check PASSED. Heap: ${this.formatBytes(current.totalHeapSize)} (${comparison.heapDeltaPercent >= 0 ? '+' : ''}${comparison.heapDeltaPercent.toFixed(1)}% vs baseline).`;
    } else {
      summary =
        `Memory check ${severity.toUpperCase()}: ${failures.length} failure(s), ${warnings.length} warning(s). ` +
        `Heap: ${this.formatBytes(current.totalHeapSize)} (${comparison.heapDeltaPercent >= 0 ? '+' : ''}${comparison.heapDeltaPercent.toFixed(1)}%).`;
    }

    return {
      isRegression: severity !== 'pass',
      severity,
      violations,
      summary,
      comparison,
      exitCode,
    };
  }

  /**
   * Analyze trends across historical fingerprints
   */
  analyzeTrend(fingerprints: MemoryFingerprint[]): TrendAnalysis {
    if (fingerprints.length < TREND_MIN_POINTS) {
      return {
        isGrowing: false,
        growthPerRun: 0,
        confidence: 0,
        dataPoints: fingerprints.length,
        classTrends: [],
      };
    }

    // Linear regression on total heap over runs
    const heapValues = fingerprints.map((fp) => fp.totalHeapSize);
    const { slope, r2 } = this.linearRegression(heapValues);

    // Per-class trends
    const classMap = new Map<string, number[]>();
    for (const fp of fingerprints) {
      for (const cls of fp.classDistribution) {
        const arr = classMap.get(cls.className) || [];
        arr.push(cls.retainedSize);
        classMap.set(cls.className, arr);
      }
    }

    const classTrends: TrendAnalysis['classTrends'] = [];
    for (const [className, values] of classMap) {
      if (values.length >= TREND_MIN_POINTS) {
        const classReg = this.linearRegression(values);
        if (classReg.slope > 1000) {
          // >1KB/run growth
          classTrends.push({
            className,
            growthPerRun: classReg.slope,
            isGrowing: classReg.slope > 0 && classReg.r2 > 0.5,
          });
        }
      }
    }

    classTrends.sort((a, b) => b.growthPerRun - a.growthPerRun);

    return {
      isGrowing: slope > 0 && r2 > 0.5,
      growthPerRun: slope,
      confidence: r2,
      dataPoints: fingerprints.length,
      classTrends: classTrends.slice(0, 10),
    };
  }

  // ─── Comparison Logic ───────────────────────────────────────────────────

  private compareFingerprints(
    baseline: MemoryFingerprint,
    current: MemoryFingerprint,
  ): FingerprintComparison {
    const heapDelta = current.totalHeapSize - baseline.totalHeapSize;
    const heapDeltaPercent =
      baseline.totalHeapSize > 0
        ? (heapDelta / baseline.totalHeapSize) * 100
        : 0;

    const objectCountDelta = current.objectCount - baseline.objectCount;
    const objectCountDeltaPercent =
      baseline.objectCount > 0
        ? (objectCountDelta / baseline.objectCount) * 100
        : 0;

    // Build baseline class map
    const baselineClasses = new Map<string, ClassFingerprint>();
    for (const cls of baseline.classDistribution) {
      baselineClasses.set(cls.className, cls);
    }

    // Find top growers and new classes
    const topGrowers: FingerprintComparison['topGrowers'] = [];
    const newClasses: ClassFingerprint[] = [];

    for (const cls of current.classDistribution) {
      const baseCls = baselineClasses.get(cls.className);
      if (!baseCls) {
        newClasses.push(cls);
      } else {
        const delta = cls.retainedSize - baseCls.retainedSize;
        const deltaPercent =
          baseCls.retainedSize > 0 ? (delta / baseCls.retainedSize) * 100 : 0;
        if (delta > 0) {
          topGrowers.push({ ...cls, delta, deltaPercent });
        }
      }
    }

    topGrowers.sort((a, b) => b.delta - a.delta);

    // Find removed classes
    const currentClassNames = new Set(
      current.classDistribution.map((c) => c.className),
    );
    const removedClasses = baseline.classDistribution
      .filter((c) => !currentClassNames.has(c.className))
      .map((c) => c.className);

    return {
      heapDelta,
      heapDeltaPercent,
      objectCountDelta,
      objectCountDeltaPercent,
      topGrowers: topGrowers.slice(0, 15),
      newClasses,
      removedClasses,
    };
  }

  private checkBudget(
    fp: MemoryFingerprint,
    budget: MemoryBudget,
    violations: RegressionViolation[],
  ): void {
    if (budget.totalHeapMax && fp.totalHeapSize > budget.totalHeapMax) {
      violations.push({
        type: 'budget_exceeded',
        severity: 'failure',
        description: `Total heap ${this.formatBytes(fp.totalHeapSize)} exceeds budget of ${this.formatBytes(budget.totalHeapMax)}`,
        metric: 'totalHeapBudget',
        baseline: budget.totalHeapMax,
        current: fp.totalHeapSize,
        changePercent:
          ((fp.totalHeapSize - budget.totalHeapMax) / budget.totalHeapMax) *
          100,
      });
    }

    if (budget.objectCountMax && fp.objectCount > budget.objectCountMax) {
      violations.push({
        type: 'budget_exceeded',
        severity: 'failure',
        description: `Object count ${fp.objectCount} exceeds budget of ${budget.objectCountMax}`,
        metric: 'objectCountBudget',
        baseline: budget.objectCountMax,
        current: fp.objectCount,
        changePercent:
          ((fp.objectCount - budget.objectCountMax) / budget.objectCountMax) *
          100,
      });
    }

    if (budget.classBudgets) {
      const classMap = new Map(
        fp.classDistribution.map((c) => [c.className, c]),
      );
      for (const cb of budget.classBudgets) {
        const cls = classMap.get(cb.className);
        if (!cls) continue;

        if (cb.maxRetainedSize && cls.retainedSize > cb.maxRetainedSize) {
          violations.push({
            type: 'budget_exceeded',
            severity: 'failure',
            description: `${cb.className} retained size ${this.formatBytes(cls.retainedSize)} exceeds budget of ${this.formatBytes(cb.maxRetainedSize)}`,
            metric: 'classBudget',
            baseline: cb.maxRetainedSize,
            current: cls.retainedSize,
            changePercent:
              ((cls.retainedSize - cb.maxRetainedSize) / cb.maxRetainedSize) *
              100,
            className: cb.className,
          });
        }

        if (cb.maxInstances && cls.instanceCount > cb.maxInstances) {
          violations.push({
            type: 'budget_exceeded',
            severity: 'warning',
            description: `${cb.className} has ${cls.instanceCount} instances (budget: ${cb.maxInstances})`,
            metric: 'classInstanceBudget',
            baseline: cb.maxInstances,
            current: cls.instanceCount,
            changePercent:
              ((cls.instanceCount - cb.maxInstances) / cb.maxInstances) * 100,
            className: cb.className,
          });
        }
      }
    }
  }

  // ─── Serialization (CI/CD Integration) ──────────────────────────────────

  /**
   * Export baselines as JSON (for storage in CI artifacts)
   */
  exportBaselines(): string {
    const data: Record<string, BaselineEntry> = {};
    for (const [key, entry] of this.baselines) {
      data[key] = entry;
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import baselines from JSON
   */
  importBaselines(json: string): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const data = JSON.parse(json) as Record<string, BaselineEntry>;
    for (const [key, entry] of Object.entries(data)) {
      this.baselines.set(key, entry);
    }
  }

  /**
   * Generate GitHub Actions annotation format
   */
  static toGitHubAnnotations(result: RegressionResult): string[] {
    const annotations: string[] = [];
    for (const v of result.violations) {
      const level = v.severity === 'failure' ? 'error' : 'warning';
      annotations.push(`::${level}::Memory Regression: ${v.description}`);
    }
    return annotations;
  }

  /**
   * Generate CI-friendly JSON report
   */
  static toCIReport(
    result: RegressionResult,
    fingerprint: MemoryFingerprint,
  ): Record<string, unknown> {
    return {
      passed: !result.isRegression,
      severity: result.severity,
      exitCode: result.exitCode,
      summary: result.summary,
      heap: {
        total: fingerprint.totalHeapSize,
        totalFormatted: formatBytesStatic(fingerprint.totalHeapSize),
        objectCount: fingerprint.objectCount,
        topClasses: fingerprint.classDistribution.slice(0, 10).map((c) => ({
          name: c.className,
          retained: c.retainedSize,
          retainedFormatted: formatBytesStatic(c.retainedSize),
          share: `${c.heapShare.toFixed(1)}%`,
        })),
      },
      violations: result.violations.map((v) => ({
        type: v.type,
        severity: v.severity,
        description: v.description,
        change: `${v.changePercent.toFixed(1)}%`,
        className: v.className,
      })),
      comparison: {
        heapDelta: result.comparison.heapDelta,
        heapDeltaFormatted: formatBytesStatic(result.comparison.heapDelta),
        heapDeltaPercent: `${result.comparison.heapDeltaPercent.toFixed(1)}%`,
        newClasses: result.comparison.newClasses.length,
        removedClasses: result.comparison.removedClasses.length,
      },
      timestamp: new Date().toISOString(),
      commit: fingerprint.commitHash,
      branch: fingerprint.branch,
    };
  }

  // ─── Terminal Formatting ────────────────────────────────────────────────

  static formatForTerminal(result: RegressionResult): string {
    const lines: string[] = [];
    const RESET = '\x1b[0m';
    const BOLD = '\x1b[1m';
    const RED = '\x1b[31m';
    const GREEN = '\x1b[32m';
    const YELLOW = '\x1b[33m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';

    const statusColor =
      result.severity === 'pass'
        ? GREEN
        : result.severity === 'warning'
          ? YELLOW
          : RED;
    const statusIcon =
      result.severity === 'pass'
        ? '✓'
        : result.severity === 'warning'
          ? '⚠'
          : '✗';

    lines.push(`${BOLD}┌─────────────────────────────────────────┐${RESET}`);
    lines.push(`${BOLD}│  MEMORY REGRESSION GUARD                │${RESET}`);
    lines.push(`${BOLD}└─────────────────────────────────────────┘${RESET}`);
    lines.push('');
    lines.push(
      `  Status: ${statusColor}${BOLD}${statusIcon} ${result.severity.toUpperCase()}${RESET}`,
    );
    lines.push(`  ${result.summary}`);

    if (result.violations.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Violations:${RESET}`);
      for (const v of result.violations) {
        const sevColor = v.severity === 'failure' ? RED : YELLOW;
        lines.push(
          `    ${sevColor}[${v.severity.toUpperCase()}]${RESET} ${v.description}`,
        );
        if (v.className)
          lines.push(`      ${DIM}Class: ${v.className}${RESET}`);
      }
    }

    const comp = result.comparison;
    if (comp.topGrowers.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  Top Growers:${RESET}`);
      for (const g of comp.topGrowers.slice(0, 5)) {
        lines.push(
          `    ${CYAN}${g.className}${RESET}: +${formatBytesStatic(g.delta)} (+${g.deltaPercent.toFixed(1)}%)`,
        );
      }
    }

    if (comp.newClasses.length > 0) {
      lines.push('');
      lines.push(`${BOLD}  New Classes:${RESET}`);
      for (const c of comp.newClasses.slice(0, 5)) {
        lines.push(
          `    ${YELLOW}+ ${c.className}${RESET}: ${formatBytesStatic(c.retainedSize)} (${c.instanceCount} instances)`,
        );
      }
    }

    return lines.join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private linearRegression(values: number[]): {
    slope: number;
    intercept: number;
    r2: number;
  } {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R²
    const meanY = sumY / n;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * i;
      ssTot += (values[i] - meanY) ** 2;
      ssRes += (values[i] - predicted) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
  }

  private hashPath(chain: string[]): string {
    // Simple hash of retainer path for comparison
    let hash = 0;
    const str = chain.join('→');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  private formatBytes(bytes: number): string {
    return formatBytesStatic(bytes);
  }

  private emptyComparison(): FingerprintComparison {
    return {
      heapDelta: 0,
      heapDeltaPercent: 0,
      objectCountDelta: 0,
      objectCountDeltaPercent: 0,
      topGrowers: [],
      newClasses: [],
      removedClasses: [],
    };
  }
}

function formatBytesStatic(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1_048_576) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  if (abs < 1_073_741_824) return `${sign}${(abs / 1_048_576).toFixed(1)} MB`;
  return `${sign}${(abs / 1_073_741_824).toFixed(1)} GB`;
}
