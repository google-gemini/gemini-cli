/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UniversalMessage, ModelProviderType } from '../providers/types.js';

const CHECK_PROMPT = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).
**Decision Rules (apply in order):**
1.  **Model Continues:** If your last response explicitly states an immediate next action *you* intend to take (e.g., "Next, I will...", "Now I'll process...", "Moving on to analyze...", "接下来我将...", "现在我要...", indicates an intended tool call that didn't execute), OR if the response seems clearly incomplete (cut off mid-thought without a natural conclusion), then the **'model'** should speak next.
2.  **Question to User:** If your last response ends with a direct question specifically addressed *to the user*, then the **'user'** should speak next.
3.  **Waiting for User:** If your last response completed a thought, statement, or task *and* does not meet the criteria for Rule 1 (Model Continues) or Rule 2 (Question to User), it implies a pause expecting user input or reaction. In this case, the **'user'** should speak next.

Respond with a JSON object containing:
{
  "reasoning": "Brief explanation of your decision",
  "next_speaker": "user" or "model"
}`;

export interface NextSpeakerResponse {
  reasoning: string;
  next_speaker: 'user' | 'model';
}

/**
 * Get the appropriate model for next speaker check based on provider type
 */
function getCheckModel(providerType: ModelProviderType): string {
  switch (providerType) {
    case 'gemini':
      // Use Flash for Gemini (cheaper and faster)
      return 'gemini-2.5-flash';
    case 'openai':
      // Use nano for OpenAI (cheaper tier)
      return 'gpt-4.1-nano';
    case 'anthropic':
      // Use Claude Haiku for Anthropic (cheapest and fastest)
      return 'claude-3-5-haiku-20241022';
    default:
      // Default to the current model if unknown provider
      return '';
  }
}

/**
 * Check if the model should continue speaking or wait for user input
 * @param messages The conversation history
 * @param providerType The current provider type
 * @param sendCheckMessage Function to send a check message to the model
 * @returns Promise resolving to whether the model should continue
 */
export async function checkNextSpeaker(
  messages: UniversalMessage[],
  providerType: ModelProviderType,
  sendCheckMessage: (messages: UniversalMessage[], model?: string) => Promise<string>
): Promise<NextSpeakerResponse | null> {
  // Ensure there's a model response to analyze
  if (messages.length === 0) {
    return null;
  }

  const lastMessage = messages[messages.length - 1];

  // If the last message is a tool response, model should continue
  if (lastMessage.role === 'tool') {
    return {
      reasoning: 'The last message was a tool response, so the model should speak next.',
      next_speaker: 'model'
    };
  }

  // If the last message is not from assistant, no need to check
  if (lastMessage.role !== 'assistant') {
    return null;
  }

  // If the last assistant message has tool calls, wait for tool responses
  if (lastMessage.toolCalls && lastMessage.toolCalls.length > 0) {
    return null; // Let the normal flow handle tool responses
  }

  // If the last message is empty or whitespace only, model should continue
  if (!lastMessage.content || !lastMessage.content.trim()) {
    return {
      reasoning: 'The last message was empty or contained no meaningful content, model should speak next.',
      next_speaker: 'model'
    };
  }

  try {
    // Prepare check prompt
    const checkMessages: UniversalMessage[] = [
      ...messages,
      { role: 'user', content: CHECK_PROMPT }
    ];

    // Get appropriate check model
    const checkModel = getCheckModel(providerType);

    // Send check message and get response
    const responseText = await sendCheckMessage(checkMessages, checkModel);

    // Try to parse JSON response
    let parsedResponse: NextSpeakerResponse;
    try {
      // Extract JSON from response (handle markdown code blocks if present)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('[NextSpeakerChecker] Failed to parse response as JSON:', parseError);

      // Fallback: try to detect from text
      const lowerResponse = responseText.toLowerCase();
      if (lowerResponse.includes('"model"') || lowerResponse.includes('model should')) {
        return {
          reasoning: 'Detected model should continue from response text',
          next_speaker: 'model'
        };
      } else if (lowerResponse.includes('"user"') || lowerResponse.includes('user should')) {
        return {
          reasoning: 'Detected user should respond from response text',
          next_speaker: 'user'
        };
      }

      return null;
    }

    // Validate response
    if (parsedResponse &&
        parsedResponse.next_speaker &&
        ['user', 'model'].includes(parsedResponse.next_speaker)) {
      return parsedResponse;
    }

    return null;
  } catch (error) {
    console.warn('[NextSpeakerChecker] Failed to check next speaker:', error);
    return null;
  }
}

