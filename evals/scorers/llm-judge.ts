/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../../packages/core/src/core/contentGenerator.js';
import type { Scorer, AgentTrace, ScorerResult } from './scorer.js';

/**
 * LLM-as-a-Judge scorer: uses a second Gemini call to evaluate whether the
 * agent's response satisfies an arbitrary rubric.
 *
 * This is the primary quality scorer for open-ended model outputs — it avoids
 * fragile regex checks by letting a model grade the model's answer.
 *
 * Judge prompt structure (matches `<criteria>/<response>/<verdict>` XML
 * convention used in `packages/core/src/prompts/snippets.ts`):
 *
 * ```
 * <criteria>
 *   {rubric}
 * </criteria>
 * <response>
 *   {trace.finalResponse}
 * </response>
 *
 * Grade the response against the criteria above.
 * Reply ONLY with valid XML in this exact format:
 * <verdict>PASS</verdict><score>0.95</score><reason>…one sentence…</reason>
 * ```
 */
export class LlmJudgeScorer implements Scorer {
  constructor(
    /** The evaluation rubric — a single question or requirement statement. */
    private readonly rubric: string,
    /** Injected ContentGenerator — the same one the CLI uses for API calls. */
    private readonly contentGenerator: ContentGenerator,
    /** Judge model. Defaults to a fast, capable model. */
    private readonly judgeModel = 'gemini-2.0-flash',
  ) {}

  async score(trace: AgentTrace): Promise<ScorerResult> {
    const judgePrompt = this.buildJudgePrompt(trace.finalResponse);

    try {
      let judgeText = '';
      const stream = await this.contentGenerator.generateContentStream(
        {
          model: this.judgeModel,
          contents: [{ role: 'user', parts: [{ text: judgePrompt }] }],
        },
        '',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        'user' as import('../../packages/core/src/telemetry/llmRole.js').LlmRole,
      );

      for await (const chunk of stream) {
        const part = chunk.candidates?.[0]?.content?.parts?.[0];
        if (part && 'text' in part) judgeText += part.text;
      }

      return this.parseJudgeResponse(judgeText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        scorer: 'llm_judge',
        pass: false,
        score: 0,
        reason: `Judge call failed: ${msg}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildJudgePrompt(response: string): string {
    return [
      '<criteria>',
      this.rubric,
      '</criteria>',
      '<response>',
      response,
      '</response>',
      '',
      'Grade the response against the criteria above.',
      'Reply ONLY with valid XML in this exact format (no other text):',
      '<verdict>PASS</verdict><score>0.95</score><reason>one sentence</reason>',
    ].join('\n');
  }

  private parseJudgeResponse(raw: string): ScorerResult {
    const verdict = raw.match(/<verdict>(PASS|FAIL)<\/verdict>/i)?.[1] ?? '';
    const scoreStr = raw.match(/<score>([\d.]+)<\/score>/)?.[1] ?? '0';
    const reason =
      raw.match(/<reason>([\s\S]*?)<\/reason>/)?.[1]?.trim() ??
      'No reason provided.';

    const pass = verdict.toUpperCase() === 'PASS';
    const score = Math.max(0, Math.min(1, parseFloat(scoreStr) || 0));

    return { scorer: 'llm_judge', pass, score, reason };
  }
}
