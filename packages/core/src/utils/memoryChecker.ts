/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { debugLogger } from './debugLogger.js';
import { LlmRole } from '../telemetry/types.js';

const CHECK_PROMPT = `Analyze the conversation history above. Determine whether the conversation contains any **soft information** that would be valuable to persist in the user's long-term memory file for future sessions.

**What qualifies as worth remembering (answer true):**
- User preferences or opinions about tools, workflows, coding styles, libraries, or approaches (e.g., "I prefer tabs over spaces", "always use pnpm")
- User corrections to the agent's behavior or assumptions (e.g., "don't do X, do Y instead", "I told you to always run lint first")
- Background context about the user, their team, or their role that cannot be inferred from the codebase (e.g., "I'm the frontend lead", "we deploy to GCP")
- External resources, links, or references the user shared as important (e.g., "our design doc is at ...", "use this API endpoint")
- Project-level context that is not derivable from code: conventions, team agreements, historical decisions, or domain knowledge (e.g., "we stopped using Redux because of X", "the billing service is owned by team Y")
- Personal facts the user shared (e.g., name, timezone, communication preferences)

**What does NOT qualify (answer false):**
- Technical details fully captured in the codebase (file contents, function signatures, config values)
- Transient session context: specific bugs being fixed, files being edited, current task progress
- Information the agent can re-derive by reading the project next session
- Generic coding knowledge or well-known best practices
- Anything already present in the system instruction or memory context provided at the start of the conversation

Answer conservatively. Only return true if there is a clear, specific piece of soft information worth persisting.`;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    reasoning: {
      type: 'string',
      description:
        'Brief explanation of why the conversation does or does not contain information worth persisting to memory.',
    },
    should_consolidate: {
      type: 'boolean',
      description:
        'Whether the conversation contains soft information that should be saved to long-term memory.',
    },
  },
  required: ['reasoning', 'should_consolidate'],
};

export interface MemoryCheckResponse {
  reasoning: string;
  should_consolidate: boolean;
}

export async function checkMemoryConsolidation(
  chat: GeminiChat,
  baseLlmClient: BaseLlmClient,
  abortSignal: AbortSignal,
  promptId: string,
): Promise<MemoryCheckResponse | null> {
  const curatedHistory = chat.getHistory(/* curated */ true);

  if (curatedHistory.length === 0) {
    return null;
  }

  const lastMessage = curatedHistory[curatedHistory.length - 1];
  if (!lastMessage || lastMessage.role !== 'model') {
    return null;
  }

  const contents: Content[] = [
    ...curatedHistory,
    { role: 'user', parts: [{ text: CHECK_PROMPT }] },
  ];

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsedResponse = (await baseLlmClient.generateJson({
      modelConfigKey: { model: 'memory-checker' },
      contents,
      schema: RESPONSE_SCHEMA,
      abortSignal,
      promptId,
      role: LlmRole.UTILITY_MEMORY_CHECKER,
    })) as unknown as MemoryCheckResponse;

    if (
      parsedResponse &&
      typeof parsedResponse.should_consolidate === 'boolean'
    ) {
      return parsedResponse;
    }
    return null;
  } catch (error) {
    debugLogger.warn('Failed to check memory consolidation need.', error);
    return null;
  }
}
