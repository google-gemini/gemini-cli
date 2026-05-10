/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LlmRole, type BaseLlmClient } from '@google/gemini-cli-core';

export interface JudgeOptions {
  /**
   * The number of parallel generations to run for majority voting.
   * Defaults to 1. Use 3 or 5 for self-consistency.
   */
  selfConsistencyRuns?: number;
  /**
   * The model to use for judging. Defaults to gemini-3-flash-base.
   */
  model?: string;
}

export interface JudgeResult {
  verdict: boolean;
  reasoning: string[];
  votes: { yes: number; no: number; other: number };
}

/**
 * A reusable LLM-as-a-judge utility for behavioral evaluations.
 */
export class LLMJudge {
  constructor(private readonly llmClient: BaseLlmClient) {}

  /**
   * Asks the LLM a Yes/No question and returns a boolean verdict.
   * If selfConsistencyRuns > 1, it runs in parallel and returns the majority vote.
   */
  async judgeYesNo(
    question: string,
    options: JudgeOptions = {},
  ): Promise<JudgeResult> {
    const runs = options.selfConsistencyRuns ?? 1;
    const model = options.model ?? 'gemini-3-flash-base';

    const systemPrompt = `You are a strict, impartial expert judge. Read the provided evidence and question carefully. You MUST answer the question with ONLY "YES" or "NO". Do not provide any conversational filler or explanation before your answer.`;

    const generateCall = async (): Promise<string> => {
      try {
        const response = await this.llmClient.generateContent({
          modelConfigKey: { model },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemPrompt }],
          },
          promptId: 'llm-judge-eval',
          role: LlmRole.UTILITY_TOOL,
          abortSignal: new AbortController().signal,
        });

        const text =
          response.candidates?.[0]?.content?.parts?.[0]?.text
            ?.trim()
            ?.toUpperCase() || 'ERROR';
        return text;
      } catch (e: any) {
        return `ERROR: ${e.message}`;
      }
    };

    const promises = Array.from({ length: runs }).map(() => generateCall());
    const rawResults = await Promise.all(promises);

    let yes = 0;
    let no = 0;
    let other = 0;

    for (const res of rawResults) {
      // Remove any punctuation the model might have appended
      const cleanRes = res.replace(/[^A-Z]/g, '');
      if (cleanRes.startsWith('YES')) yes++;
      else if (cleanRes.startsWith('NO')) no++;
      else other++;
    }

    // Pass if YES > NO and YES > OTHER (plurality)
    const pass = yes > no && yes > other;

    return {
      verdict: pass,
      reasoning: rawResults,
      votes: { yes, no, other },
    };
  }
}
