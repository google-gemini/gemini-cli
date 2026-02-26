/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Config } from '../config/config.js';
import type { Content } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';
import { LlmRole } from '../telemetry/types.js';

const MICRO_CONSOLIDATION_PROMPT = `
You are the background subconscious memory module of an autonomous engineering agent.
Your task is to analyze the recent sequence of actions and extract a single, highly condensed factual takeaway, grouped under a specific Theme/Goal.

Rules:
1. Identify the overarching "Theme" or "Active Goal" of these actions (e.g., "Fixing Auth Bug", "Setting up CI", "Exploring Codebase").
2. Focus STRICTLY on hard technical facts, file paths discovered, tool outcomes, or immediate workarounds.
3. Output MUST be exactly ONE line using the following strict format:
   **[Theme: <Your Inferred Theme>]** <Your factual takeaway in 1-2 sentences>
4. Do NOT output markdown code blocks (\`\`\`).
5. If the interaction contains NO hard technical facts (e.g., just conversational filler), output exactly: NO_SIGNIFICANT_FACTS

Example Outputs:
- **[Theme: Build Configuration]** \`npm run build\` failed because of a missing dependency \`chalk\` in packages/cli/package.json.
- **[Theme: Code Exploration]** Found the user authentication logic in src/auth/login.ts; it uses JWT.
- **[Theme: Bug Fixing]** Attempted to use the \`replace\` tool on file.txt but failed due to mismatched whitespace.
- NO_SIGNIFICANT_FACTS
`.trim();

export class MemoryConsolidationService {
  constructor(private readonly config: Config) {}

  /**
   * Triggers a fire-and-forget background task to summarize the latest turn.
   */
  triggerMicroConsolidation(latestTurnContext: Content[]): void {
    if (!this.config.getIsForeverMode()) {
      return;
    }

    if (latestTurnContext.length === 0) {
      return;
    }

    // Fire and forget
    void this.performConsolidation(latestTurnContext).catch((err) => {
      // Subconscious failures should not block the main thread, only log to debug
      debugLogger.error('Micro-consolidation failed (non-fatal)', err);
    });
  }

  private async performConsolidation(
    latestTurnContext: Content[],
  ): Promise<void> {
    const baseClient = this.config.getBaseLlmClient();

    // Force the use of gemini-3-flash-preview for micro-consolidation
    const modelAlias = 'gemini-3-flash-preview';

    try {
      // Serialize the context to avoid Gemini API 400 errors regarding functionCall/functionResponse turn sequence
      const serializedContext = JSON.stringify(latestTurnContext);

      const response = await baseClient.generateContent({
        modelConfigKey: { model: modelAlias, isChatModel: false },
        contents: [
          {
            role: 'user',
            parts: [{ text: serializedContext }],
          },
        ],
        systemInstruction: MICRO_CONSOLIDATION_PROMPT,
        abortSignal: new AbortController().signal,
        promptId: `micro-consolidation-${Date.now()}`,
        role: LlmRole.UTILITY_SUMMARIZER,
        maxAttempts: 1, // Disable retries for this background task
      });

      const fact = response.text?.trim();

      if (fact && fact !== 'NO_SIGNIFICANT_FACTS') {
        const knowledgeDir = this.config.storage.getKnowledgeDir();
        await fs.mkdir(knowledgeDir, { recursive: true });

        const hippocampusPath = path.join(knowledgeDir, 'hippocampus.md');

        // Append to the file with a timestamp for chronological tracking
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
        const logEntry = `[${timestamp}] - ${fact}\n`;

        await fs.appendFile(hippocampusPath, logEntry);
      }
    } catch (e) {
      debugLogger.error('Failed to run micro-consolidation', e);
    }
  }
}
