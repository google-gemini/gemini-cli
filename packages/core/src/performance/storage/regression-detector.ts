/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os'; // Added for secure home directory
import type {
  BaselineMetrics,
  PerformanceData,
  RegressionReport,
  Regression,
} from '../types.js';

export class RegressionDetector {
  private baselineDir: string;
  private thresholds = {
    startup: { warning: 10, critical: 20 },
    memory: { warning: 15, critical: 25 },
    toolLatency: { warning: 20, critical: 30 },
    modelLatency: { warning: 25, critical: 40 },
    errorRate: { warning: 5, critical: 10 },
  };

  constructor() {
    // Use a secure, user‑specific directory instead of process.cwd()
    this.baselineDir = path.join(os.homedir(), '.gemini', 'baselines');
  }

  async init(): Promise<void> {
    try {
      // Create directory with owner‑only permissions (0o700)
      await fs.mkdir(this.baselineDir, { recursive: true, mode: 0o700 });
      // Enforce permissions if directory already exists
      try {
        await fs.chmod(this.baselineDir, 0o700);
      } catch {
        // Ignore chmod errors (e.g., Windows)
      }
    } catch (_error) {
      // Directory might already exist or permissions issue – let it fail later if needed
    }
  }

  async saveBaseline(
    version: string,
    metrics: PerformanceData,
  ): Promise<string> {
    await this.init();

    const baseline: BaselineMetrics = {
      version,
      timestamp: Date.now(),
      startup: {
        total: metrics.startup.total,
        phases: metrics.startup.phases.reduce(
          (acc, p) => {
            acc[p.name] = p.duration;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      memory: {
        peakHeap: metrics.memory.stats.max,
        avgHeap: metrics.memory.stats.avg,
      },
      tools: {},
      model: {},
    };

    Object.entries(metrics.tools.stats).forEach(([tool, stats]) => {
      baseline.tools[tool] = {
        avgTime: stats.avgTime,
        successRate: stats.successRate,
        callCount: stats.callCount,
      };
    });

    Object.entries(metrics.model.stats).forEach(([model, stats]) => {
      baseline.model[model] = {
        avgLatency: stats.avg,
        p95Latency: stats.p95,
        avgTokens: stats.avgTokens,
        successRate: stats.successRate,
      };
    });

    const filename = `baseline-${version}-${Date.now()}.json`;
    const filepath = path.join(this.baselineDir, filename);
    // Write file with owner‑only permissions (0o600)
    await fs.writeFile(filepath, JSON.stringify(baseline, null, 2), {
      mode: 0o600,
    });

    return filepath;
  }

  async loadBaseline(version?: string): Promise<BaselineMetrics | null> {
    await this.init();

    let files: string[];
    try {
      files = await fs.readdir(this.baselineDir);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[PERF] Failed to read baseline directory:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }

    const baselineFiles = files
      .filter((f) => f.startsWith('baseline-'))
      .map((f) => ({
        name: f,
        path: path.join(this.baselineDir, f),
        version: f.split('-')[1],
        time: parseInt(f.split('-')[2]?.split('.')[0] || '0', 10),
      }))
      .sort((a, b) => b.time - a.time);

    if (baselineFiles.length === 0) {
      return null;
    }

    const target = version
      ? baselineFiles.find((f) => f.version === version)
      : baselineFiles[0];

    if (!target) {
      return null;
    }

    let content: string;
    try {
      content = await fs.readFile(target.path, 'utf-8');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[PERF] Failed to read baseline file ${target.path}:`,
        error,
      );
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(content) as BaselineMetrics;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[PERF] Failed to parse baseline file ${target.path}:`,
        error,
      );
      return null;
    }
  }

  async detectRegressions(
    currentMetrics: PerformanceData,
    baselineVersion?: string,
  ): Promise<RegressionReport> {
    const baseline = await this.loadBaseline(baselineVersion);

    if (!baseline) {
      throw new Error('No baseline found. Run with --save-baseline first.');
    }

    const regressions: Regression[] = [];
    const improvements: Regression[] = [];

    // Check startup time
    if (currentMetrics.startup.total) {
      const change = this.calculateIncrease(
        baseline.startup.total,
        currentMetrics.startup.total,
      );

      if (change > this.thresholds.startup.warning) {
        const severity = this.getSeverity(change, this.thresholds.startup);
        regressions.push({
          metric: 'startup_time',
          baseline: baseline.startup.total,
          current: currentMetrics.startup.total,
          change,
          severity,
          threshold: this.thresholds.startup.critical,
          recommendation: 'Review startup phases for bottlenecks',
        });
      } else if (change < -this.thresholds.startup.warning) {
        improvements.push({
          metric: 'startup_time',
          baseline: baseline.startup.total,
          current: currentMetrics.startup.total,
          change: Math.abs(change),
          severity: 'LOW',
          threshold: this.thresholds.startup.critical,
          recommendation: 'Startup time improved!',
        });
      }
    }

    // Check memory usage
    if (currentMetrics.memory.stats.max) {
      const change = this.calculateIncrease(
        baseline.memory.peakHeap,
        currentMetrics.memory.stats.max,
      );

      if (change > this.thresholds.memory.warning) {
        const severity = this.getSeverity(change, this.thresholds.memory);
        regressions.push({
          metric: 'peak_memory',
          baseline: baseline.memory.peakHeap,
          current: currentMetrics.memory.stats.max,
          change,
          severity,
          threshold: this.thresholds.memory.critical,
          recommendation: 'Check for memory leaks or large allocations',
        });
      }
    }

    // Check tool latencies
    Object.entries(currentMetrics.tools.stats).forEach(([tool, stats]) => {
      const baselineTool = baseline.tools[tool];
      if (baselineTool) {
        const change = this.calculateIncrease(
          baselineTool.avgTime,
          stats.avgTime,
        );

        if (change > this.thresholds.toolLatency.warning) {
          const severity = this.getSeverity(
            change,
            this.thresholds.toolLatency,
          );
          regressions.push({
            metric: `tool_latency.${tool}`,
            baseline: baselineTool.avgTime,
            current: stats.avgTime,
            change,
            severity,
            threshold: this.thresholds.toolLatency.critical,
            recommendation: `Tool '${tool}' is slower than baseline`,
          });
        }

        const successChange = stats.successRate - baselineTool.successRate;
        if (successChange < -this.thresholds.errorRate.warning) {
          const severity = this.getSeverity(
            Math.abs(successChange),
            this.thresholds.errorRate,
          );
          regressions.push({
            metric: `tool_success_rate.${tool}`,
            baseline: baselineTool.successRate,
            current: stats.successRate,
            change: Math.abs(successChange),
            severity,
            threshold: this.thresholds.errorRate.critical,
            recommendation: `Tool '${tool}' is failing more often`,
          });
        }
      }
    });

    // Check model latencies
    Object.entries(currentMetrics.model.stats).forEach(([model, stats]) => {
      const baselineModel = baseline.model[model];
      if (baselineModel) {
        const change = this.calculateIncrease(
          baselineModel.avgLatency,
          stats.avg,
        );

        if (change > this.thresholds.modelLatency.warning) {
          const severity = this.getSeverity(
            change,
            this.thresholds.modelLatency,
          );
          regressions.push({
            metric: `model_latency.${model}`,
            baseline: baselineModel.avgLatency,
            current: stats.avg,
            change,
            severity,
            threshold: this.thresholds.modelLatency.critical,
            recommendation: `Model '${model}' latency increased`,
          });
        }
      }
    });

    const report: RegressionReport = {
      version: currentMetrics.version,
      timestamp: Date.now(),
      baselineVersion: baseline.version,
      passed: regressions.length === 0,
      regressions,
      improvements,
      summary: {
        totalChecks: regressions.length + improvements.length,
        passed: improvements.length,
        failed: regressions.length,
        critical: regressions.filter((r) => r.severity === 'CRITICAL').length,
      },
    };

    return report;
  }

  private calculateIncrease(baseline: number, current: number): number {
    if (baseline === 0) return current > 0 ? 100 : 0;
    return ((current - baseline) / baseline) * 100;
  }

  private getSeverity(
    change: number,
    thresholds: { warning: number; critical: number },
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (change > thresholds.critical * 2) return 'CRITICAL';
    if (change > thresholds.critical) return 'HIGH';
    if (change > thresholds.warning) return 'MEDIUM';
    return 'LOW';
  }

  /* eslint-disable no-console */
  async runCICheck(
    currentMetrics: PerformanceData,
    options?: {
      baselineVersion?: string;
      failOnWarning?: boolean;
      exitOnFailure?: boolean;
    },
  ): Promise<RegressionReport> {
    const report = await this.detectRegressions(
      currentMetrics,
      options?.baselineVersion,
    );

    // Print report to console
     
    console.log('\n🔍 Performance Regression Check');
     
    console.log('===============================');
     
    console.log(`Version: ${report.version} vs ${report.baselineVersion}`);
     
    console.log(`Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);

    if (report.regressions.length > 0) {
       
      console.log('\n⚠️  Regressions Found:');
      report.regressions.forEach((r) => {
        const color =
          r.severity === 'CRITICAL'
            ? '\x1b[31m'
            : r.severity === 'HIGH'
              ? '\x1b[33m'
              : '\x1b[0m';
         
        console.log(
          `${color}  • ${r.metric}: ${r.change.toFixed(1)}% increase ` +
            `(${this.formatValue(r.baseline)} → ${this.formatValue(r.current)}) [${r.severity}]\x1b[0m`,
        );
        if (r.recommendation) {
           
          console.log(`    💡 ${r.recommendation}`);
        }
      });
    }

    if (report.improvements.length > 0) {
       
      console.log('\n✅ Improvements:');
      report.improvements.forEach((i) => {
         
        console.log(`  • ${i.metric}: ${i.change.toFixed(1)}% improvement`);
      });
    }
     
    console.log('\n📊 Summary:');
     
    console.log(`  Total Checks: ${report.summary.totalChecks}`);
     
    console.log(`  Passed: ${report.summary.passed}`);
     
    console.log(`  Failed: ${report.summary.failed}`);
     
    console.log(`  Critical: ${report.summary.critical}`);

    if (options?.exitOnFailure && !report.passed) {
      if (options.failOnWarning || report.summary.critical > 0) {
        process.exit(1);
      }
    }

    return report;
  }

  private formatValue(value: number): string {
    if (value > 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value > 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toFixed(0);
  }
}
