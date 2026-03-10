/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../../packages/core/src/core/contentGenerator.js';
import type { Scorer, AgentTrace, ScorerResult } from './scorer.js';

/**
 * Likert scale levels for reasoning quality evaluation.
 * Maps numeric score (1–5) to a descriptive label.
 */
export const LIKERT_LABELS: Record<number, string> = {
  1: 'No reasoning — response is wrong or completely off-topic',
  2: 'Poor reasoning — major logical gaps or factual errors',
  3: 'Adequate reasoning — correct but shallow or missing nuance',
  4: 'Good reasoning — sound argument with minor gaps',
  5: 'Excellent reasoning — thorough, well-structured, and accurate',
};

/**
 * LLM-as-a-Judge scorer that grades reasoning quality on a **Likert 1–5 scale**.
 *
 * Unlike the binary `LlmJudgeScorer`, this scorer captures nuanced quality
 * gradations from "no reasoning" (1) to "excellent" (5). This is specifically
 * useful for GSoC evaluation rubrics where partial credit matters.
 *
 * Judge prompt format:
 * ```xml
 * <criteria>...</criteria>
 * <response>...</response>
 * Grade the reasoning quality on a 1-5 Likert scale.
 * Reply ONLY with: <score>N</score><reason>one sentence</reason>
 * ```
 *
 * @example
 * ```ts
 * const scorer = new LikertJudgeScorer(
 *   'Does the agent explain WHY it chose the files it read?',
 *   contentGenerator,
 *   'gemini-2.0-flash',
 *   4,
 * );
 * const result = await scorer.score(trace);
 * // result.score is normalised to [0,1]: (likertScore - 1) / 4
 * ```
 */
export class LikertJudgeScorer implements Scorer {
  constructor(
    /** The evaluation criterion (what aspect of reasoning to grade). */
    private readonly rubric: string,
    /** The ContentGenerator used to call the judge model. */
    private readonly contentGenerator: ContentGenerator,
    /** Judge model. Defaults to flash for cost efficiency. */
    private readonly judgeModel = 'gemini-2.0-flash',
    /** Minimum Likert score (1–5) to be considered `pass`. Defaults to 4. */
    private readonly passThreshold = 4,
  ) {}

  async score(trace: AgentTrace): Promise<ScorerResult> {
    const prompt = this.buildPrompt(trace.finalResponse);

    try {
      let judgeText = '';
      const stream = await this.contentGenerator.generateContentStream({
        model: this.judgeModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      for await (const chunk of stream) {
        const part = chunk.candidates?.[0]?.content?.parts?.[0];
        if (part && 'text' in part) judgeText += part.text;
      }

      return this.parseResponse(judgeText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        scorer: 'likert_judge',
        pass: false,
        score: 0,
        reason: `Judge call failed: ${msg}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildPrompt(response: string): string {
    const scaleDesc = Object.entries(LIKERT_LABELS)
      .map(([k, v]) => `  ${k} = ${v}`)
      .join('\n');

    return [
      '<criteria>',
      this.rubric,
      '</criteria>',
      '<response>',
      response,
      '</response>',
      '',
      'Grade the reasoning quality of the response against the criteria above.',
      'Use this Likert scale:',
      scaleDesc,
      '',
      'Reply ONLY with valid XML (no other text):',
      '<score>N</score><reason>one sentence explaining the grade</reason>',
    ].join('\n');
  }

  private parseResponse(raw: string): ScorerResult {
    const scoreStr = raw.match(/<score>([1-5])<\/score>/)?.[1] ?? '1';
    const reason =
      raw.match(/<reason>([\s\S]*?)<\/reason>/)?.[1]?.trim() ??
      'No reason provided.';

    const likert = Math.max(1, Math.min(5, parseInt(scoreStr, 10)));
    // Normalise to [0, 1]: score=1 → 0.0, score=5 → 1.0
    const normalised = (likert - 1) / 4;
    const pass = likert >= this.passThreshold;

    return {
      scorer: 'likert_judge',
      pass,
      score: normalised,
      reason: `Likert ${likert}/5 — ${reason}`,
    };
  }
}
