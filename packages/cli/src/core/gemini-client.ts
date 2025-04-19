/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentConfig,
  GoogleGenAI,
  Part,
  Chat,
  Type,
  SchemaUnion,
  PartListUnion,
  Content,
} from '@google/genai';
import { CoreSystemPrompt } from './prompts.js';
import process from 'node:process';
import { toolRegistry } from '../tools/tool-registry.js';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { GeminiEventType, GeminiStream } from './gemini-stream.js';
import { Config } from '../config/config.js';
import { Turn } from './turn.js';

export class GeminiClient {
  private config: Config;
  private ai: GoogleGenAI;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(config: Config) {
    this.config = config;
    this.ai = new GoogleGenAI({ apiKey: config.getApiKey() });
  }

  private async getEnvironment(): Promise<Part> {
    const cwd = process.cwd();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;

    const folderStructure = await getFolderStructure(cwd);

    const context = `
  Okay, just setting up the context for our chat.
  Today is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    return { text: context };
  }

  async startChat(): Promise<Chat> {
    const envPart = await this.getEnvironment();
    const model = this.config.getModel();
    const tools = toolRegistry.getToolSchemas();

    try {
      const chat = this.ai.chats.create({
        model,
        config: {
          systemInstruction: CoreSystemPrompt,
          ...this.generateContentConfig,
          tools,
        },
        history: [
          // --- Add the context as a single part in the initial user message ---
          {
            role: 'user',
            parts: [envPart], // Pass the single Part object in an array
          },
          // --- Add an empty model response to balance the history ---
          {
            role: 'model',
            parts: [{ text: 'Got it. Thanks for the context!' }], // A slightly more conversational model response
          },
          // --- End history modification ---
        ],
      });
      return chat;
    } catch (error) {
      console.error('Error initializing Gemini chat session:', error);
      const message = error instanceof Error ? error.message : 'Unknown error.';
      throw new Error(`Failed to initialize chat: ${message}`);
    }
  }

  async *sendMessageStream(
    chat: Chat,
    request: PartListUnion,
    signal?: AbortSignal,
  ): GeminiStream {
    let turns = 0;

    try {
      while (turns < this.MAX_TURNS) {
        turns++;
        // A turn either yields a text response or returns
        // function responses to be used in the next turn.
        // This callsite is responsible to handle the buffered
        // function responses and use it on the next turn.
        const turn = new Turn(chat);
        const resultStream = turn.run(request, signal);

        for await (const event of resultStream) {
          yield event;
        }
        const fnResponses = turn.getFunctionResponses();
        if (fnResponses.length > 0) {
          request = fnResponses;
          continue; // use the responses in the next turn
        }

        const history = chat.getHistory();
        const checkPrompt = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).

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
  \`\`\`
  }`;

        // Schema Idea
        const responseSchema: SchemaUnion = {
          type: Type.OBJECT,
          properties: {
            reasoning: {
              type: Type.STRING,
              description:
                "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn.",
            },
            next_speaker: {
              type: Type.STRING,
              enum: ['user', 'model'], // Enforce the choices
              description:
                'Who should speak next based *only* on the preceding turn and the decision rules',
            },
          },
          required: ['reasoning', 'next_speaker'],
        };

        try {
          // Use the new generateJson method, passing the history and the check prompt
          const parsedResponse = await this.generateJson(
            [
              ...history,
              {
                role: 'user',
                parts: [{ text: checkPrompt }],
              },
            ],
            responseSchema,
          );

          // Safely extract the next speaker value
          const nextSpeaker: string | undefined =
            typeof parsedResponse?.next_speaker === 'string'
              ? parsedResponse.next_speaker
              : undefined;

          if (nextSpeaker === 'model') {
            request = { text: 'alright' }; // Or potentially a more meaningful continuation prompt
          } else {
            // 'user' should speak next, or value is missing/invalid. End the turn.
            break;
          }
        } catch (error) {
          console.error(
            `[Turn ${turns}] Failed to get or parse next speaker check:`,
            error,
          );
          // If the check fails, assume user should speak next to avoid infinite loops
          break;
        }
      }

      if (turns >= this.MAX_TURNS) {
        console.warn(
          'sendMessageStream: Reached maximum tool call turns limit.',
        );
        yield {
          type: GeminiEventType.Content,
          value:
            '\n\n[System Notice: Maximum interaction turns reached. The conversation may be incomplete.]',
        };
      }
    } catch (error: unknown) {
      // TODO(jbd): There is so much of packing/unpacking of error types.
      // Figure out a way to remove the redundant work.
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Gemini stream request aborted by user.');
        throw error;
      } else {
        console.error(`Error during Gemini stream or tool interaction:`, error);
        const message = error instanceof Error ? error.message : String(error);
        yield {
          type: GeminiEventType.Content,
          value: `\n\n[Error: An unexpected error occurred during the chat: ${message}]`,
        };
        throw error;
      }
    }
  }

  /**
   * Generates structured JSON content based on conversational history and a schema.
   * @param contents The conversational history (Content array) to provide context.
   * @param schema The SchemaUnion defining the desired JSON structure.
   * @returns A promise that resolves to the parsed JSON object matching the schema.
   * @throws Throws an error if the API call fails or the response is not valid JSON.
   */
  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
  ): Promise<Record<string, unknown>> {
    const model = this.config.getModel();
    try {
      const result = await this.ai.models.generateContent({
        model,
        config: {
          ...this.generateContentConfig,
          systemInstruction: CoreSystemPrompt,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents, // Pass the full Content array
      });

      const responseText = result.text;
      if (!responseText) {
        throw new Error('API returned an empty response.');
      }

      try {
        const parsedJson = JSON.parse(responseText);
        // TODO: Add schema validation if needed
        return parsedJson;
      } catch (parseError) {
        console.error('Failed to parse JSON response:', responseText);
        throw new Error(
          `Failed to parse API response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
      }
    } catch (error) {
      console.error('Error generating JSON content:', error);
      const message =
        error instanceof Error ? error.message : 'Unknown API error.';
      throw new Error(`Failed to generate JSON content: ${message}`);
    }
  }
}
