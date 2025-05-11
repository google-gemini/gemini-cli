/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chat, Content, SchemaUnion, Type } from '@google/genai';
import { GeminiClient } from '../core/client.js';

const CHECK_PROMPT = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).
**Decision Rules (apply in order):**
1.  **Model Continues:** If your last response explicitly states an immediate next action *you* intend to take (e.g., "Next, I will...", "Now I'll process...", "Moving on to analyze...", indicates an intended tool call that didn't execute), OR if the response seems clearly incomplete (cut off mid-thought without a natural conclusion), then the **'model'** should speak next.
2.  **Question to User:** If your last response ends with a direct question specifically addressed *to the user*, then the **'user'** should speak next.
3.  **Waiting for User:** If your last response completed a thought, statement, or task *and* does not meet the criteria for Rule 1 (Model Continues) or Rule 2 (Question to User), it implies a pause expecting user input or reaction. In this case, the **'user'** should speak next.
**Output Format:**
Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.
\`\`\`json
{
  "type": "object",
  "properties": {
    "reasoning": {
        "type": "string",
        "description": "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn."
    },
    "next_speaker": {
      "type": "string",
      "enum": ["user", "model"],
      "description": "Who should speak next based *only* on the preceding turn and the decision rules."
    }
  },
  "required": ["next_speaker", "reasoning"]
}
\`\`\`
`;

const RESPONSE_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn.",
    },
    next_speaker: {
      type: Type.STRING,
      enum: ['user', 'model'],
      description:
        'Who should speak next based *only* on the preceding turn and the decision rules',
    },
  },
  required: ['reasoning', 'next_speaker'],
};

export interface NextSpeakerResponse {
  reasoning: string;
  next_speaker: 'user' | 'model';
}

export async function checkNextSpeaker(
  chat: Chat,
  geminiClient: GeminiClient,
): Promise<NextSpeakerResponse | null> {
  // We need to capture the curated history because there are many moments when the model will return invalid turns
  // that when passed back up to the endpoint will break subsequent calls. An example of this is when the model decides
  // to respond with an empty part collection if you were to send that message back to the server it will respond with
  // a 400 indicating that model part collections MUST have content.
  const history = await chat.getHistory(/* curated */ true);

  // Ensure there's a model response to analyze
  if (history.length === 0 || history[history.length - 1].role !== 'model') {
    // Cannot determine next speaker if the last turn wasn't from the model
    // or if history is empty.
    return null;
  }

  const contents: Content[] = [
    ...history,
    { role: 'user', parts: [{ text: CHECK_PROMPT }] },
  ];

  try {
    const parsedResponse = (await geminiClient.generateJson(
      contents,
      RESPONSE_SCHEMA,
    )) as unknown as NextSpeakerResponse;

    if (
      parsedResponse &&
      parsedResponse.next_speaker &&
      ['user', 'model'].includes(parsedResponse.next_speaker)
    ) {
      return parsedResponse;
    }
    return null;
  } catch (error) {
    console.warn(
      'Failed to talk to Gemiin endpoint when seeing if conversation should continue.',
      error,
    );
    return null;
  }
}
