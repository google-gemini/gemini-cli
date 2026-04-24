/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LLM Analysis Bridge
 *
 * Converts LeakReport + ProfileSummary to a compact prompt (<2000 tokens)
 * for Gemini and parses the structured response back into a typed result.
 */

import type { LeakReport, RetainerChainNode } from './diff-engine.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ProfileSummary {
  topBySelfTime?: Array<{ name: string; percentage: number }>;
  totalSamples?: number;
  duration?: number;
}

export interface AnalysisSummary {
  topLeakCandidates: Array<{
    constructor: string;
    count: number;
    retainedSizeDelta: number;
    retainerChain: string; // truncated to 5 hops, readable
    confidence: string;
  }>;
  cpuHotFunctions?: Array<{ name: string; selfPercent: number }>;
  gcPressureLevel: 'none' | 'low' | 'medium' | 'high';
  totalLeakedBytes: number;
  snapshotGrowthBytes: [number, number]; // S1->S2 and S2->S3
}

export interface LLMAnalysisResult {
  rootCause: string;
  pattern:
    | 'event-listener'
    | 'closure'
    | 'timer'
    | 'detached-dom'
    | 'global-reference'
    | 'circular-reference'
    | 'promise-chain'
    | 'stream'
    | 'unbounded-cache'
    | 'unknown';
  confidence: number; // 0-1
  remediation: string;
  shouldExtendRetainerDepth: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_PATTERNS = [
  'event-listener',
  'closure',
  'timer',
  'detached-dom',
  'global-reference',
  'circular-reference',
  'promise-chain',
  'stream',
  'unbounded-cache',
  'unknown',
] as const;

// ---------------------------------------------------------------------------
// LLMBridge class
// ---------------------------------------------------------------------------

export class LLMBridge {
  /**
   * Rough token count estimate: chars / 4.
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Format a retainer chain as a readable string (max 5 hops).
   */
  private formatRetainerChain(chain: RetainerChainNode[], maxHops = 5): string {
    return chain
      .slice(0, maxHops)
      .map((n, i) => {
        const prefix = i === 0 ? '' : ` --[${n.edgeType}:${n.edgeName}]--> `;
        return `${prefix}${n.name || '(anon)'}(${n.type})`;
      })
      .join('');
  }

  /**
   * Determine GC pressure level based on snapshot growth.
   */
  private calcGcPressure(
    snapshotSizes: [number, number, number],
  ): AnalysisSummary['gcPressureLevel'] {
    const [s1, _s2, s3] = snapshotSizes;
    if (s1 === 0) return 'none';
    const growthRate = (s3 - s1) / s1;
    if (growthRate > 0.5) return 'high';
    if (growthRate > 0.2) return 'medium';
    if (growthRate > 0.05) return 'low';
    return 'none';
  }

  /**
   * Build an AnalysisSummary from a LeakReport and optional profile.
   */
  buildAnalysisSummary(
    leakReport: LeakReport,
    profileSummary?: ProfileSummary,
  ): AnalysisSummary {
    const top = leakReport.candidates.slice(0, 5).map((c) => ({
      constructor: c.constructorName,
      count: c.count,
      retainedSizeDelta: c.retainedSizeDelta,
      retainerChain: this.formatRetainerChain(c.retainerChain, 5),
      confidence: c.confidence,
    }));

    const cpuHotFunctions = profileSummary?.topBySelfTime
      ?.slice(0, 5)
      .map((f) => ({ name: f.name, selfPercent: f.percentage }));

    const [s1Size, s2Size, s3Size] = leakReport.snapshotSizes;

    return {
      topLeakCandidates: top,
      cpuHotFunctions,
      gcPressureLevel: this.calcGcPressure(leakReport.snapshotSizes),
      totalLeakedBytes: leakReport.totalLeakedBytes,
      snapshotGrowthBytes: [s2Size - s1Size, s3Size - s2Size],
    };
  }

  /**
   * Build a structured prompt for Gemini that fits within ~2000 tokens.
   */
  buildPrompt(summary: AnalysisSummary): string {
    const lines: string[] = [
      'You are a Node.js memory-leak expert. Analyze the following heap snapshot differential report and identify the root cause.',
      '',
      '## Snapshot Growth',
      `S1→S2: ${summary.snapshotGrowthBytes[0]} bytes  |  S2→S3: ${summary.snapshotGrowthBytes[1]} bytes`,
      `Total leaked bytes: ${summary.totalLeakedBytes}  |  GC pressure: ${summary.gcPressureLevel}`,
      '',
      '## Top Leak Candidates (objects in S2 and S3 but NOT in S1)',
    ];

    for (const c of summary.topLeakCandidates) {
      lines.push(
        `- [${c.confidence}] ${c.constructor} × ${c.count}  Δsize=${c.retainedSizeDelta}B`,
        `  chain: ${c.retainerChain}`,
      );
    }

    if (summary.cpuHotFunctions && summary.cpuHotFunctions.length > 0) {
      lines.push('', '## CPU Hot Functions');
      for (const f of summary.cpuHotFunctions) {
        lines.push(`- ${f.name}: ${f.selfPercent}%`);
      }
    }

    lines.push(
      '',
      '## Instructions',
      'Respond ONLY with a JSON object matching this exact schema (no markdown fences):',
      '{',
      '  "rootCause": "<one sentence>",',
      '  "pattern": "<one of: event-listener|closure|timer|detached-dom|global-reference|circular-reference|promise-chain|stream|unbounded-cache|unknown>",',
      '  "confidence": <0.0-1.0>,',
      '  "remediation": "<actionable fix>",',
      '  "shouldExtendRetainerDepth": <true|false>',
      '}',
    );

    const prompt = lines.join('\n');

    // Safety: if > 2000 tokens, truncate candidates
    if (
      this.estimateTokenCount(prompt) > 2000 &&
      summary.topLeakCandidates.length > 2
    ) {
      return this.buildPrompt({
        ...summary,
        topLeakCandidates: summary.topLeakCandidates.slice(0, 2),
      });
    }

    return prompt;
  }

  /**
   * Parse a Gemini response string into a LLMAnalysisResult.
   * Handles both raw JSON and JSON embedded in markdown fences.
   */
  parseLLMResponse(response: string): LLMAnalysisResult {
    // Strip markdown fences if present
    let raw = response.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      raw = fenceMatch[1].trim();
    }

    let parsed: Record<string, unknown>;
    try {
      const rawParsed: unknown = JSON.parse(raw);
      if (typeof rawParsed !== 'object' || rawParsed === null) {
        return {
          rootCause: 'Unable to parse LLM response',
          pattern: 'unknown',
          confidence: 0,
          remediation: 'Manual investigation required',
          shouldExtendRetainerDepth: false,
        };
      }
      parsed = Object.fromEntries(Object.entries(rawParsed));
    } catch {
      // Return safe default on parse failure
      return {
        rootCause: 'Unable to parse LLM response',
        pattern: 'unknown',
        confidence: 0,
        remediation: 'Manual investigation required',
        shouldExtendRetainerDepth: false,
      };
    }

    const patternValue = parsed['pattern'];
    function isKnownPattern(v: unknown): v is LLMAnalysisResult['pattern'] {
      return (
        typeof v === 'string' &&
        (KNOWN_PATTERNS as readonly string[]).includes(v)
      );
    }
    const pattern: LLMAnalysisResult['pattern'] = isKnownPattern(patternValue)
      ? patternValue
      : 'unknown';

    const rawConf = Number(parsed['confidence']);
    const confidence = isNaN(rawConf) ? 0 : Math.min(1, Math.max(0, rawConf));

    return {
      rootCause: String(parsed['rootCause'] ?? ''),
      pattern,
      confidence,
      remediation: String(parsed['remediation'] ?? ''),
      shouldExtendRetainerDepth: Boolean(parsed['shouldExtendRetainerDepth']),
    };
  }
}
