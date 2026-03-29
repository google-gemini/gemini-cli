/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CPU Profiling Script
 *
 * Captures and analyzes CPU profiles using Node.js inspector API.
 * Supports profiling live processes and generating flame graphs.
 */

import * as fs from 'node:fs/promises';
import { PerfettoTraceBuilder } from '../../../shared/perfetto.js';

interface CPUProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
}

interface CPUProfile {
  nodes: CPUProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

interface ProfileSummary {
  duration: number;
  totalSamples: number;
  topBySelfTime: Array<{ name: string; samples: number; percentage: number }>;
  topByTotalTime: Array<{ name: string; samples: number; percentage: number }>;
  hotPaths: Array<{ path: string; samples: number; percentage: number }>;
}

function isCPUProfile(v: unknown): v is CPUProfile {
  return (
    typeof v === 'object' &&
    v !== null &&
    'nodes' in v &&
    Array.isArray((v as Record<string, unknown>)['nodes']) &&
    'samples' in v &&
    'timeDeltas' in v
  );
}

/**
 * Capture CPU profile using Node.js inspector
 */
export async function captureCPUProfile(
  durationMs: number,
): Promise<CPUProfile> {
  const inspector = await import('node:inspector');
  const session = new inspector.Session();
  session.connect();

  return new Promise((resolve, reject) => {
    // Enable profiler
    session.post('Profiler.enable', (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Set sampling interval (default is ~1000μs)
      session.post(
        'Profiler.setSamplingInterval',
        { interval: 100 },
        (err2) => {
          if (err2) {
            reject(err2);
            return;
          }

          // Start profiling
          session.post('Profiler.start', (err3) => {
            if (err3) {
              reject(err3);
              return;
            }

            // Stop after duration
            setTimeout(() => {
              session.post('Profiler.stop', (err4, result) => {
                if (err4) {
                  reject(err4);
                } else {
                  function hasCPUProfile(
                    v: unknown,
                  ): v is { profile: CPUProfile } {
                    return (
                      typeof v === 'object' && v !== null && 'profile' in v
                    );
                  }
                  if (hasCPUProfile(result)) {
                    resolve(result.profile);
                  } else {
                    reject(new Error('Profiler.stop did not return a profile'));
                  }
                }
                session.disconnect();
              });
            }, durationMs);
          });
        },
      );
    });
  });
}

/**
 * Build node map for efficient lookup
 */
function buildNodeMap(nodes: CPUProfileNode[]): Map<number, CPUProfileNode> {
  const map = new Map<number, CPUProfileNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
}

/**
 * Calculate self time (samples where this function is executing)
 */
function calculateSelfTime(profile: CPUProfile): Map<number, number> {
  const selfTime = new Map<number, number>();

  // Count samples per node
  for (const nodeId of profile.samples) {
    selfTime.set(nodeId, (selfTime.get(nodeId) || 0) + 1);
  }

  return selfTime;
}

/**
 * Calculate total time (self + all descendants)
 */
function calculateTotalTime(
  profile: CPUProfile,
  selfTime: Map<number, number>,
): Map<number, number> {
  const totalTime = new Map<number, number>();
  const nodeMap = buildNodeMap(profile.nodes);

  function getTotalTime(nodeId: number): number {
    if (totalTime.has(nodeId)) {
      return totalTime.get(nodeId)!;
    }

    const node = nodeMap.get(nodeId);
    if (!node) return 0;

    let total = selfTime.get(nodeId) || 0;

    if (node.children) {
      for (const childId of node.children) {
        total += getTotalTime(childId);
      }
    }

    totalTime.set(nodeId, total);
    return total;
  }

  // Calculate for all nodes
  for (const node of profile.nodes) {
    getTotalTime(node.id);
  }

  return totalTime;
}

/**
 * Summarize CPU profile
 */
export function summarizeProfile(profile: CPUProfile): ProfileSummary {
  const selfTime = calculateSelfTime(profile);
  const totalTime = calculateTotalTime(profile, selfTime);
  const nodeMap = buildNodeMap(profile.nodes);
  const totalSamples = profile.samples.length;
  const duration = profile.endTime - profile.startTime;

  // Top by self time
  const bySelfTime = [...selfTime.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, samples]) => {
      const node = nodeMap.get(nodeId);
      return {
        name: node?.callFrame.functionName || '(anonymous)',
        samples,
        percentage: Math.round((samples / totalSamples) * 1000) / 10,
      };
    });

  // Top by total time
  const byTotalTime = [...totalTime.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, samples]) => {
      const node = nodeMap.get(nodeId);
      return {
        name: node?.callFrame.functionName || '(anonymous)',
        samples,
        percentage: Math.round((samples / totalSamples) * 1000) / 10,
      };
    });

  // Hot paths (call chains)
  const pathCounts = new Map<string, number>();

  function tracePath(nodeId: number, currentPath: string[] = []): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const functionName = node.callFrame.functionName || '(anonymous)';
    const newPath = [functionName, ...currentPath];
    const pathStr = newPath.join(' → ');

    pathCounts.set(
      pathStr,
      (pathCounts.get(pathStr) || 0) + (selfTime.get(nodeId) || 0),
    );

    if (node.children) {
      for (const childId of node.children) {
        tracePath(childId, newPath);
      }
    }
  }

  // Find root nodes (nodes not referenced as children)
  const childIds = new Set<number>();
  for (const node of profile.nodes) {
    if (node.children) {
      for (const childId of node.children) {
        childIds.add(childId);
      }
    }
  }

  const rootNodes = profile.nodes.filter((n) => !childIds.has(n.id));
  for (const root of rootNodes) {
    tracePath(root.id);
  }

  const hotPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, samples]) => ({
      path,
      samples,
      percentage: Math.round((samples / totalSamples) * 1000) / 10,
    }));

  return {
    duration,
    totalSamples,
    topBySelfTime: bySelfTime,
    topByTotalTime: byTotalTime,
    hotPaths,
  };
}

/**
 * Compare two profiles for regression detection
 */
export function compareProfiles(
  baseline: ProfileSummary,
  current: ProfileSummary,
): {
  regressions: Array<{
    name: string;
    baselinePct: number;
    currentPct: number;
    change: number;
  }>;
  improvements: Array<{
    name: string;
    baselinePct: number;
    currentPct: number;
    change: number;
  }>;
  summary: string;
} {
  const baselineMap = new Map(
    baseline.topBySelfTime.map((f) => [f.name, f.percentage]),
  );
  const currentMap = new Map(
    current.topBySelfTime.map((f) => [f.name, f.percentage]),
  );

  const allFunctions = new Set([...baselineMap.keys(), ...currentMap.keys()]);

  const regressions: Array<{
    name: string;
    baselinePct: number;
    currentPct: number;
    change: number;
  }> = [];
  const improvements: Array<{
    name: string;
    baselinePct: number;
    currentPct: number;
    change: number;
  }> = [];

  for (const func of allFunctions) {
    const baselinePct = baselineMap.get(func) || 0;
    const currentPct = currentMap.get(func) || 0;
    const change = currentPct - baselinePct;

    if (change > 5) {
      regressions.push({ name: func, baselinePct, currentPct, change });
    } else if (change < -5) {
      improvements.push({ name: func, baselinePct, currentPct, change });
    }
  }

  regressions.sort((a, b) => b.change - a.change);
  improvements.sort((a, b) => a.change - b.change);

  let summary = '';
  if (regressions.length > 0) {
    summary += `Found ${regressions.length} regressions. `;
  }
  if (improvements.length > 0) {
    summary += `Found ${improvements.length} improvements.`;
  }
  if (regressions.length === 0 && improvements.length === 0) {
    summary = 'No significant performance changes detected.';
  }

  return { regressions, improvements, summary };
}

/**
 * Generate simple flame graph data
 */
export function generateFlameGraphData(profile: CPUProfile): string {
  const selfTime = calculateSelfTime(profile);
  const nodeMap = buildNodeMap(profile.nodes);

  // Build folded stack format
  const stacks: string[] = [];

  function buildStack(nodeId: number, prefix: string[] = []): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const name = node.callFrame.functionName || '(anonymous)';
    const fullName = [...prefix, name].join(';');
    const samples = selfTime.get(nodeId) || 0;

    if (samples > 0) {
      stacks.push(`${fullName} ${samples}`);
    }

    if (node.children) {
      for (const childId of node.children) {
        buildStack(childId, [...prefix, name]);
      }
    }
  }

  // Find roots
  const childIds = new Set<number>();
  for (const node of profile.nodes) {
    if (node.children) {
      for (const childId of node.children) {
        childIds.add(childId);
      }
    }
  }

  const roots = profile.nodes.filter((n) => !childIds.has(n.id));
  for (const root of roots) {
    buildStack(root.id);
  }

  return stacks.join('\n');
}

/**
 * Convert CPU profile to Perfetto trace
 */
export function profileToPerfetto(profile: CPUProfile): string {
  const builder = new PerfettoTraceBuilder();
  const trackUuid = builder.createTrack('CPU Profile');
  const nodeMap = buildNodeMap(profile.nodes);

  // Convert samples to track events
  let _currentTime = profile.startTime;

  for (let i = 0; i < profile.samples.length; i++) {
    const nodeId = profile.samples[i];
    const delta = profile.timeDeltas[i] || 0;
    _currentTime += delta;

    const node = nodeMap.get(nodeId);
    if (node) {
      // Add as memory snapshot event repurposed for CPU
      const metaData: Record<string, number> = {
        sampleIndex: i,
        nodeIdNum: nodeId,
      };
      builder.addMemorySnapshot(trackUuid, 0, 0, delta, 0, metaData);
      void (node.callFrame.functionName || '(anonymous)'); // referenced to avoid unused warning
    }
  }

  return builder.build();
}

/**
 * CLI interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'capture') {
    const durationIndex = args.indexOf('--duration');
    const duration =
      durationIndex > -1 ? parseInt(args[durationIndex + 1], 10) : 5000;
    const outputIndex = args.indexOf('--output');
    const outputPath =
      outputIndex > -1 ? args[outputIndex + 1] : 'profile.cpuprofile';

    process.stdout.write(`Capturing CPU profile for ${duration}ms...\n`);
    const profile = await captureCPUProfile(duration);
    await fs.writeFile(outputPath, JSON.stringify(profile), 'utf-8');

    const summary = summarizeProfile(profile);
    process.stdout.write('\nProfile Summary:\n');
    process.stdout.write(`Duration: ${summary.duration}ms\n`);
    process.stdout.write(`Total samples: ${summary.totalSamples}\n`);
    process.stdout.write(`\nTop by self time:\n`);
    summary.topBySelfTime.slice(0, 5).forEach((f, i) => {
      process.stdout.write(
        `${i + 1}. ${f.name}: ${f.samples} samples (${f.percentage}%)\n`,
      );
    });
    process.stdout.write(`\nSaved to ${outputPath}\n`);
  } else if (command === 'flame') {
    const inputIndex = args.indexOf('--input');
    const inputPath =
      inputIndex > -1 ? args[inputIndex + 1] : 'profile.cpuprofile';
    const outputIndex = args.indexOf('--output');
    const outputPath = outputIndex > -1 ? args[outputIndex + 1] : 'flame.txt';

    const data = await fs.readFile(inputPath, 'utf-8');
    const parsedFlame: unknown = JSON.parse(data);
    if (!isCPUProfile(parsedFlame))
      throw new Error('Invalid CPU profile format');
    const profile = parsedFlame;
    const flameData = generateFlameGraphData(profile);
    await fs.writeFile(outputPath, flameData, 'utf-8');
    process.stdout.write(`Flame graph data saved to ${outputPath}\n`);
  } else if (command === 'compare') {
    const baselineIndex = args.indexOf('--baseline');
    const currentIndex = args.indexOf('--current');

    if (baselineIndex === -1 || currentIndex === -1) {
      process.stderr.write(
        'Usage: compare --baseline <path> --current <path>\n',
      );
      return;
    }

    const baselineData = await fs.readFile(args[baselineIndex + 1], 'utf-8');
    const currentData = await fs.readFile(args[currentIndex + 1], 'utf-8');

    const parsedBaseline: unknown = JSON.parse(baselineData);
    const parsedCurrent: unknown = JSON.parse(currentData);
    if (!isCPUProfile(parsedBaseline))
      throw new Error('Invalid baseline CPU profile format');
    if (!isCPUProfile(parsedCurrent))
      throw new Error('Invalid current CPU profile format');
    const baselineProfile = parsedBaseline;
    const currentProfile = parsedCurrent;

    const baselineSummary = summarizeProfile(baselineProfile);
    const currentSummary = summarizeProfile(currentProfile);

    const comparison = compareProfiles(baselineSummary, currentSummary);

    process.stdout.write('\nProfile Comparison\n');
    process.stdout.write('==================\n');
    process.stdout.write(comparison.summary + '\n');

    if (comparison.regressions.length > 0) {
      process.stdout.write('\nRegressions:\n');
      comparison.regressions.forEach((r) => {
        process.stdout.write(
          `  ${r.name}: ${r.baselinePct}% → ${r.currentPct}% (+${r.change}%)\n`,
        );
      });
    }

    if (comparison.improvements.length > 0) {
      process.stdout.write('\nImprovements:\n');
      comparison.improvements.forEach((imp) => {
        process.stdout.write(
          `  ${imp.name}: ${imp.baselinePct}% → ${imp.currentPct}% (${imp.change}%)\n`,
        );
      });
    }
  } else if (command === 'to-perfetto') {
    const inputIndex = args.indexOf('--input');
    const outputIndex = args.indexOf('--output');

    if (inputIndex === -1 || outputIndex === -1) {
      process.stderr.write(
        'Usage: to-perfetto --input <cpuprofile> --output <trace.json>\n',
      );
      return;
    }

    const data = await fs.readFile(args[inputIndex + 1], 'utf-8');
    const parsedPerfetto: unknown = JSON.parse(data);
    if (!isCPUProfile(parsedPerfetto))
      throw new Error('Invalid CPU profile format');
    const profile = parsedPerfetto;
    const trace = profileToPerfetto(profile);
    await fs.writeFile(args[outputIndex + 1], trace, 'utf-8');
    process.stdout.write(`Perfetto trace saved to ${args[outputIndex + 1]}\n`);
  } else {
    process.stdout.write(`
Usage:
  ts-node cpu-profile.ts capture [--duration <ms>] [--output <path>]
  ts-node cpu-profile.ts flame --input <cpuprofile> [--output <path>]
  ts-node cpu-profile.ts compare --baseline <path> --current <path>
  ts-node cpu-profile.ts to-perfetto --input <cpuprofile> --output <trace.json>
    \n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n');
  });
}
