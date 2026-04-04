/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/smartDiff
 */

import type { ClassSummary } from './heapSnapshotAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A "change story" — a group of related changes with a narrative */
export interface ChangeStory {
  /** Human-readable title */
  title: string;

  /** Detailed description of what changed and why */
  description: string;

  /** Type of change */
  changeType: 'growth' | 'shrinkage' | 'structural' | 'new_retention' | 'freed';

  /** Classes involved */
  involvedClasses: string[];

  /** Net memory impact (positive = growth, negative = freed) */
  memoryImpact: number;

  /** Changes that comprise this story */
  changes: DetailedChange[];

  /** Confidence in this story being accurate */
  confidence: 'high' | 'medium' | 'low';

  /** Suggested actions */
  suggestions: string[];
}

/** A single detailed change between snapshots */
export interface DetailedChange {
  /** What changed */
  what: string;

  /** Direction of change */
  direction: 'added' | 'removed' | 'grew' | 'shrunk' | 'restructured';

  /** Class name */
  className: string;

  /** Count delta */
  countDelta: number;

  /** Size delta (bytes) */
  sizeDelta: number;

  /** Retained size delta (bytes) */
  retainedDelta: number;

  /** New retainer paths (paths that exist in snap2 but not snap1) */
  newRetainerPaths?: string[];

  /** Lost retainer paths (paths that exist in snap1 but not snap2) */
  lostRetainerPaths?: string[];
}

/** Complete smart diff report */
export interface SmartDiffReport {
  /** Timestamp */
  timestamp: string;

  /** Time between snapshots (if known) */
  timeDeltaMs?: number;

  /** Overall summary */
  summary: string;

  /** Net memory change */
  netMemoryChange: number;

  /** Percentage change */
  percentChange: number;

  /** Change stories (grouped, narrative changes) */
  stories: ChangeStory[];

  /** Top growers (individual classes) */
  topGrowers: ClassGrowthSummary[];

  /** Top shrinkers (individual classes) */
  topShrinkers: ClassGrowthSummary[];

  /** New classes (present in snap2, absent in snap1) */
  newClasses: ClassSummary[];

  /** Disappeared classes (present in snap1, absent in snap2) */
  disappearedClasses: ClassSummary[];

  /** Attribution: which changes account for the most growth/shrinkage */
  attribution: GrowthAttribution[];

  /** Memory health delta (positive = improved, negative = worsened) */
  healthDelta: number;
}

/** Summary of growth for a single class */
export interface ClassGrowthSummary {
  className: string;
  countBefore: number;
  countAfter: number;
  countDelta: number;
  sizeBefore: number;
  sizeAfter: number;
  sizeDelta: number;
  retainedBefore: number;
  retainedAfter: number;
  retainedDelta: number;
  /** Percentage of total growth attributable to this class */
  growthShare: number;
}

/** Attribution: what caused the growth */
export interface GrowthAttribution {
  /** Source of growth */
  source: string;
  /** Bytes attributable */
  bytes: number;
  /** Percentage of total change */
  percentage: number;
  /** Explanation */
  explanation: string;
}

// ─── Smart Diff Engine ──────────────────────────────────────────────────────

export class SmartDiffEngine {
  /**
   * Compute a smart diff between two sets of class summaries.
   */
  diff(
    snap1Summaries: ClassSummary[],
    snap2Summaries: ClassSummary[],
    options?: { timeDeltaMs?: number },
  ): SmartDiffReport {
    const map1 = new Map(snap1Summaries.map((c) => [c.className, c]));
    const map2 = new Map(snap2Summaries.map((c) => [c.className, c]));

    const total1 = snap1Summaries.reduce((s, c) => s + c.retainedSize, 0);
    const total2 = snap2Summaries.reduce((s, c) => s + c.retainedSize, 0);
    const netChange = total2 - total1;
    const percentChange = total1 > 0 ? (netChange / total1) * 100 : 0;

    // Find all changes
    const growers: ClassGrowthSummary[] = [];
    const shrinkers: ClassGrowthSummary[] = [];
    const newClasses: ClassSummary[] = [];
    const disappearedClasses: ClassSummary[] = [];

    // Classes in snap2
    for (const [name, cls2] of map2) {
      const cls1 = map1.get(name);
      if (!cls1) {
        newClasses.push(cls2);
        continue;
      }

      const summary: ClassGrowthSummary = {
        className: name,
        countBefore: cls1.count,
        countAfter: cls2.count,
        countDelta: cls2.count - cls1.count,
        sizeBefore: cls1.shallowSize,
        sizeAfter: cls2.shallowSize,
        sizeDelta: cls2.shallowSize - cls1.shallowSize,
        retainedBefore: cls1.retainedSize,
        retainedAfter: cls2.retainedSize,
        retainedDelta: cls2.retainedSize - cls1.retainedSize,
        growthShare: 0,
      };

      if (summary.retainedDelta > 0) {
        growers.push(summary);
      } else if (summary.retainedDelta < 0) {
        shrinkers.push(summary);
      }
    }

    // Classes that disappeared
    for (const [name, cls1] of map1) {
      if (!map2.has(name)) {
        disappearedClasses.push(cls1);
      }
    }

    // Sort growers and shrinkers
    growers.sort((a, b) => b.retainedDelta - a.retainedDelta);
    shrinkers.sort((a, b) => a.retainedDelta - b.retainedDelta);

    // Compute growth share
    const totalGrowth = growers.reduce((s, g) => s + g.retainedDelta, 0);
    for (const g of growers) {
      g.growthShare =
        totalGrowth > 0 ? (g.retainedDelta / totalGrowth) * 100 : 0;
    }

    // Generate change stories
    const stories = this.generateStories(
      growers,
      shrinkers,
      newClasses,
      disappearedClasses,
    );

    // Attribution
    const attribution = this.computeAttribution(
      growers,
      shrinkers,
      newClasses,
      netChange,
    );

    // Health delta (simplified)
    const healthDelta =
      netChange > 0
        ? -Math.min(20, Math.floor(netChange / 1_000_000))
        : Math.min(10, Math.floor(Math.abs(netChange) / 1_000_000));

    // Summary
    const summary = this.generateSummary(
      netChange,
      percentChange,
      growers,
      shrinkers,
      newClasses,
      disappearedClasses,
    );

    return {
      timestamp: new Date().toISOString(),
      timeDeltaMs: options?.timeDeltaMs,
      summary,
      netMemoryChange: netChange,
      percentChange,
      stories,
      topGrowers: growers.slice(0, 10),
      topShrinkers: shrinkers.slice(0, 10),
      newClasses,
      disappearedClasses,
      attribution,
      healthDelta,
    };
  }

  /**
   * Format a smart diff report for terminal display.
   */
  static formatForTerminal(report: SmartDiffReport): string {
    const lines: string[] = [];
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const red = '\x1b[31m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const cyan = '\x1b[36m';

    const changeColor =
      report.netMemoryChange > 0
        ? red
        : report.netMemoryChange < 0
          ? green
          : cyan;
    const arrow =
      report.netMemoryChange > 0 ? '↑' : report.netMemoryChange < 0 ? '↓' : '→';

    lines.push(
      `${bold}╔══════════════════════════════════════════════════════════════════╗${reset}`,
    );
    lines.push(
      `${bold}║  SMART HEAP DIFF                                               ║${reset}`,
    );
    lines.push(
      `${bold}╚══════════════════════════════════════════════════════════════════╝${reset}`,
    );
    lines.push('');
    lines.push(
      `${bold}Net change:${reset} ${changeColor}${arrow} ${formatBytes(Math.abs(report.netMemoryChange))} (${report.percentChange > 0 ? '+' : ''}${report.percentChange.toFixed(1)}%)${reset}`,
    );
    lines.push('');

    // Change stories
    if (report.stories.length > 0) {
      lines.push(`${bold}━━━ What Changed ━━━${reset}`);
      lines.push('');
      for (const story of report.stories) {
        const icon =
          story.changeType === 'growth'
            ? `${red}▲${reset}`
            : story.changeType === 'shrinkage'
              ? `${green}▼${reset}`
              : story.changeType === 'new_retention'
                ? `${yellow}★${reset}`
                : story.changeType === 'freed'
                  ? `${green}✓${reset}`
                  : `${cyan}◆${reset}`;
        lines.push(`  ${icon} ${bold}${story.title}${reset}`);
        lines.push(`    ${story.description}`);
        lines.push(
          `    ${dim}Impact: ${formatBytes(Math.abs(story.memoryImpact))} | Classes: ${story.involvedClasses.join(', ')}${reset}`,
        );
        lines.push('');
      }
    }

    // Top growers
    if (report.topGrowers.length > 0) {
      lines.push(`${bold}━━━ Top Growers ━━━${reset}`);
      lines.push('');
      lines.push(
        `  ${'Class'.padEnd(25)} ${'Count Δ'.padStart(10)} ${'Retained Δ'.padStart(12)} ${'Share'.padStart(7)}`,
      );
      lines.push(
        `  ${'─'.repeat(25)} ${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(7)}`,
      );
      for (const g of report.topGrowers.slice(0, 8)) {
        const name = g.className.slice(0, 24).padEnd(25);
        const countDelta = `+${g.countDelta}`.padStart(10);
        const retDelta = `+${formatBytes(g.retainedDelta)}`.padStart(12);
        const share = `${g.growthShare.toFixed(1)}%`.padStart(7);
        lines.push(
          `  ${red}${name}${reset} ${countDelta} ${retDelta} ${share}`,
        );
      }
      lines.push('');
    }

    // Top shrinkers (good news)
    if (report.topShrinkers.length > 0) {
      lines.push(`${bold}━━━ Memory Freed ━━━${reset}`);
      lines.push('');
      for (const s of report.topShrinkers.slice(0, 5)) {
        lines.push(
          `  ${green}▼${reset} ${s.className}: ${formatBytes(Math.abs(s.retainedDelta))} freed (${s.countDelta} instances removed)`,
        );
      }
      lines.push('');
    }

    // New classes
    if (report.newClasses.length > 0) {
      lines.push(`${bold}━━━ New Classes ━━━${reset}`);
      lines.push('');
      for (const cls of report.newClasses.slice(0, 5)) {
        lines.push(
          `  ${yellow}★${reset} ${cls.className}: ${cls.count} instances, ${formatBytes(cls.retainedSize)} retained`,
        );
      }
      lines.push('');
    }

    // Attribution
    if (report.attribution.length > 0) {
      lines.push(`${bold}━━━ Growth Attribution ━━━${reset}`);
      lines.push('');
      for (const attr of report.attribution.slice(0, 5)) {
        const bar = '█'.repeat(Math.max(1, Math.round(attr.percentage / 5)));
        lines.push(
          `  ${attr.source.padEnd(25)} ${bar} ${attr.percentage.toFixed(1)}% (${formatBytes(attr.bytes)})`,
        );
        lines.push(`  ${dim}${attr.explanation}${reset}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a markdown diff report.
   */
  static toMarkdown(report: SmartDiffReport): string {
    const lines: string[] = [
      '# Heap Snapshot Diff Report',
      '',
      `**Generated:** ${report.timestamp}`,
      report.timeDeltaMs
        ? `**Time between snapshots:** ${formatDuration(report.timeDeltaMs)}`
        : '',
      `**Net memory change:** ${formatBytes(report.netMemoryChange)} (${report.percentChange > 0 ? '+' : ''}${report.percentChange.toFixed(1)}%)`,
      '',
      `> ${report.summary}`,
      '',
    ];

    if (report.stories.length > 0) {
      lines.push('## Change Stories', '');
      for (const story of report.stories) {
        const icon =
          story.changeType === 'growth'
            ? '🔴'
            : story.changeType === 'shrinkage'
              ? '🟢'
              : story.changeType === 'new_retention'
                ? '🟡'
                : '🔵';
        lines.push(`### ${icon} ${story.title}`, '');
        lines.push(story.description, '');
        lines.push(
          `**Impact:** ${formatBytes(Math.abs(story.memoryImpact))} | **Classes:** ${story.involvedClasses.join(', ')}`,
          '',
        );

        if (story.suggestions.length > 0) {
          lines.push('**Suggestions:**');
          for (const s of story.suggestions) {
            lines.push(`- ${s}`);
          }
          lines.push('');
        }
      }
    }

    if (report.topGrowers.length > 0) {
      lines.push('## Top Growers', '');
      lines.push('| Class | Count Δ | Retained Δ | Share |');
      lines.push('|-------|---------|------------|-------|');
      for (const g of report.topGrowers.slice(0, 10)) {
        lines.push(
          `| ${g.className} | +${g.countDelta} | +${formatBytes(g.retainedDelta)} | ${g.growthShare.toFixed(1)}% |`,
        );
      }
      lines.push('');
    }

    if (report.attribution.length > 0) {
      lines.push('## Growth Attribution', '');
      for (const attr of report.attribution) {
        lines.push(
          `- **${attr.source}** (${attr.percentage.toFixed(1)}%, ${formatBytes(attr.bytes)}): ${attr.explanation}`,
        );
      }
    }

    return lines.join('\n');
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private generateStories(
    growers: ClassGrowthSummary[],
    shrinkers: ClassGrowthSummary[],
    newClasses: ClassSummary[],
    _disappearedClasses: ClassSummary[],
  ): ChangeStory[] {
    const stories: ChangeStory[] = [];

    // Story: Major growth cluster
    const majorGrowers = growers.filter((g) => g.retainedDelta > 100_000);
    if (majorGrowers.length > 0) {
      // Group by probable cause
      const stringGrowers = majorGrowers.filter((g) =>
        /string|concat/i.test(g.className),
      );
      const collectionGrowers = majorGrowers.filter((g) =>
        /map|set|array|cache/i.test(g.className),
      );
      const closureGrowers = majorGrowers.filter((g) =>
        /closure|function/i.test(g.className),
      );
      const objectGrowers = majorGrowers.filter(
        (g) =>
          !stringGrowers.includes(g) &&
          !collectionGrowers.includes(g) &&
          !closureGrowers.includes(g),
      );

      if (stringGrowers.length > 0) {
        const totalImpact = stringGrowers.reduce(
          (s, g) => s + g.retainedDelta,
          0,
        );
        stories.push({
          title: `String accumulation (+${formatBytes(totalImpact)})`,
          description:
            `${stringGrowers.length} string-related class${stringGrowers.length > 1 ? 'es' : ''} grew. ` +
            `This typically indicates log accumulation, JSON serialization artifacts, or template caching.`,
          changeType: 'growth',
          involvedClasses: stringGrowers.map((g) => g.className),
          memoryImpact: totalImpact,
          changes: stringGrowers.map((g) => ({
            what: `${g.className} grew by ${formatBytes(g.retainedDelta)}`,
            direction: 'grew' as const,
            className: g.className,
            countDelta: g.countDelta,
            sizeDelta: g.sizeDelta,
            retainedDelta: g.retainedDelta,
          })),
          confidence: 'medium',
          suggestions: [
            'Check if log strings are being accumulated in memory instead of written to disk',
            'Look for JSON.stringify() calls on large objects that produce retained strings',
          ],
        });
      }

      if (collectionGrowers.length > 0) {
        const totalImpact = collectionGrowers.reduce(
          (s, g) => s + g.retainedDelta,
          0,
        );
        stories.push({
          title: `Collection growth (+${formatBytes(totalImpact)})`,
          description:
            `${collectionGrowers.length} collection${collectionGrowers.length > 1 ? 's' : ''} (Map/Set/Array) grew. ` +
            `This suggests unbounded caching or accumulation without eviction.`,
          changeType: 'growth',
          involvedClasses: collectionGrowers.map((g) => g.className),
          memoryImpact: totalImpact,
          changes: collectionGrowers.map((g) => ({
            what: `${g.className} grew by ${formatBytes(g.retainedDelta)}`,
            direction: 'grew' as const,
            className: g.className,
            countDelta: g.countDelta,
            sizeDelta: g.sizeDelta,
            retainedDelta: g.retainedDelta,
          })),
          confidence: 'high',
          suggestions: [
            'Add LRU eviction or TTL expiration to caches',
            'Check for Maps/Sets that only ever add entries without removing them',
          ],
        });
      }

      if (closureGrowers.length > 0) {
        const totalImpact = closureGrowers.reduce(
          (s, g) => s + g.retainedDelta,
          0,
        );
        stories.push({
          title: `Closure accumulation (+${formatBytes(totalImpact)})`,
          description:
            `${closureGrowers.length} closure-related class${closureGrowers.length > 1 ? 'es' : ''} grew. ` +
            `Closures capturing large objects from their scope prevent garbage collection.`,
          changeType: 'growth',
          involvedClasses: closureGrowers.map((g) => g.className),
          memoryImpact: totalImpact,
          changes: closureGrowers.map((g) => ({
            what: `${g.className} grew by ${formatBytes(g.retainedDelta)}`,
            direction: 'grew' as const,
            className: g.className,
            countDelta: g.countDelta,
            sizeDelta: g.sizeDelta,
            retainedDelta: g.retainedDelta,
          })),
          confidence: 'medium',
          suggestions: [
            'Review event listener registrations — each uncleaned listener is a retained closure',
            'Check for callbacks passed to long-lived objects (timers, event emitters)',
          ],
        });
      }

      // Any remaining significant growers
      if (objectGrowers.length > 0) {
        const top3 = objectGrowers.slice(0, 3);
        const totalImpact = top3.reduce((s, g) => s + g.retainedDelta, 0);
        stories.push({
          title: `Object growth in ${top3.map((g) => g.className).join(', ')}`,
          description:
            `${top3.length} class${top3.length > 1 ? 'es' : ''} showed significant growth. ` +
            `The largest contributor is ${top3[0].className} (+${formatBytes(top3[0].retainedDelta)}, ` +
            `${top3[0].countDelta > 0 ? '+' : ''}${top3[0].countDelta} instances).`,
          changeType: 'growth',
          involvedClasses: top3.map((g) => g.className),
          memoryImpact: totalImpact,
          changes: top3.map((g) => ({
            what: `${g.className}: ${g.countDelta > 0 ? '+' : ''}${g.countDelta} instances, +${formatBytes(g.retainedDelta)} retained`,
            direction: 'grew' as const,
            className: g.className,
            countDelta: g.countDelta,
            sizeDelta: g.sizeDelta,
            retainedDelta: g.retainedDelta,
          })),
          confidence: 'medium',
          suggestions: [
            `Investigate the lifecycle of ${top3[0].className} — are instances being created faster than they're released?`,
          ],
        });
      }
    }

    // Story: Memory freed
    const majorShrinkers = shrinkers.filter((s) => s.retainedDelta < -100_000);
    if (majorShrinkers.length > 0) {
      const totalFreed = majorShrinkers.reduce(
        (s, g) => s + Math.abs(g.retainedDelta),
        0,
      );
      stories.push({
        title: `Memory freed: ${formatBytes(totalFreed)}`,
        description:
          `${majorShrinkers.length} class${majorShrinkers.length > 1 ? 'es' : ''} released memory. ` +
          `This could indicate GC cycles, cache evictions, or intentional cleanup.`,
        changeType: 'shrinkage',
        involvedClasses: majorShrinkers.map((g) => g.className),
        memoryImpact: -totalFreed,
        changes: majorShrinkers.map((g) => ({
          what: `${g.className}: ${formatBytes(Math.abs(g.retainedDelta))} freed`,
          direction: 'shrunk' as const,
          className: g.className,
          countDelta: g.countDelta,
          sizeDelta: g.sizeDelta,
          retainedDelta: g.retainedDelta,
        })),
        confidence: 'high',
        suggestions: [],
      });
    }

    // Story: New classes appeared
    if (newClasses.length > 0) {
      const totalNew = newClasses.reduce((s, c) => s + c.retainedSize, 0);
      stories.push({
        title: `${newClasses.length} new class${newClasses.length > 1 ? 'es' : ''} appeared`,
        description:
          `New classes in the heap that weren't present before: ${newClasses
            .slice(0, 5)
            .map((c) => c.className)
            .join(', ')}` +
          (newClasses.length > 5 ? ` and ${newClasses.length - 5} more` : '') +
          '. ' +
          `Total: ${formatBytes(totalNew)}.`,
        changeType: 'new_retention',
        involvedClasses: newClasses.map((c) => c.className),
        memoryImpact: totalNew,
        changes: newClasses.slice(0, 5).map((c) => ({
          what: `New: ${c.className} (${c.count} instances, ${formatBytes(c.retainedSize)})`,
          direction: 'added' as const,
          className: c.className,
          countDelta: c.count,
          sizeDelta: c.shallowSize,
          retainedDelta: c.retainedSize,
        })),
        confidence: 'high',
        suggestions: [
          'If these classes were unexpected, investigate what code path created them',
        ],
      });
    }

    // Sort stories by absolute impact
    stories.sort((a, b) => Math.abs(b.memoryImpact) - Math.abs(a.memoryImpact));

    return stories;
  }

  private computeAttribution(
    growers: ClassGrowthSummary[],
    shrinkers: ClassGrowthSummary[],
    newClasses: ClassSummary[],
    netChange: number,
  ): GrowthAttribution[] {
    const attrs: GrowthAttribution[] = [];

    // Top growers
    for (const g of growers.slice(0, 5)) {
      attrs.push({
        source: g.className,
        bytes: g.retainedDelta,
        percentage:
          netChange !== 0 ? (g.retainedDelta / Math.abs(netChange)) * 100 : 0,
        explanation: `+${g.countDelta} instances, +${formatBytes(g.retainedDelta)} retained`,
      });
    }

    // New classes
    for (const cls of newClasses.slice(0, 3)) {
      attrs.push({
        source: `${cls.className} (new)`,
        bytes: cls.retainedSize,
        percentage:
          netChange !== 0 ? (cls.retainedSize / Math.abs(netChange)) * 100 : 0,
        explanation: `New class with ${cls.count} instances`,
      });
    }

    // Sort by absolute bytes
    attrs.sort((a, b) => Math.abs(b.bytes) - Math.abs(a.bytes));

    return attrs;
  }

  private generateSummary(
    netChange: number,
    percentChange: number,
    growers: ClassGrowthSummary[],
    shrinkers: ClassGrowthSummary[],
    newClasses: ClassSummary[],
    _disappearedClasses: ClassSummary[],
  ): string {
    const parts: string[] = [];

    if (netChange > 0) {
      parts.push(
        `Memory grew by ${formatBytes(netChange)} (+${percentChange.toFixed(1)}%).`,
      );
    } else if (netChange < 0) {
      parts.push(
        `Memory decreased by ${formatBytes(Math.abs(netChange))} (${percentChange.toFixed(1)}%).`,
      );
    } else {
      parts.push('Memory is stable between snapshots.');
    }

    if (growers.length > 0) {
      parts.push(
        `${growers.length} class${growers.length > 1 ? 'es' : ''} grew (top: ${growers[0].className} +${formatBytes(growers[0].retainedDelta)}).`,
      );
    }

    if (newClasses.length > 0) {
      parts.push(
        `${newClasses.length} new class${newClasses.length > 1 ? 'es' : ''} appeared.`,
      );
    }

    if (shrinkers.length > 0) {
      const totalFreed = shrinkers.reduce(
        (s, g) => s + Math.abs(g.retainedDelta),
        0,
      );
      parts.push(
        `${formatBytes(totalFreed)} was freed across ${shrinkers.length} class${shrinkers.length > 1 ? 'es' : ''}.`,
      );
    }

    return parts.join(' ');
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}
