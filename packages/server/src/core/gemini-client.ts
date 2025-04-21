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
  SchemaUnion,
  PartListUnion,
  Content,
  FunctionDeclaration,
  Tool,
} from '@google/genai';
import { CoreSystemPrompt } from './prompts.js';
import process from 'node:process';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import { Turn, ServerTool, ServerGeminiStreamEvent } from './turn.js';

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;
  private generateContentConfig: GenerateContentConfig = {
    temperature: 0,
    topP: 1,
  };
  private readonly MAX_TURNS = 100;

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey: apiKey });
    this.model = model;
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

  async startChat(toolDeclarations: FunctionDeclaration[]): Promise<Chat> {
    const envPart = await this.getEnvironment();
    // const tools: Tool[] = toolDeclarations.map((declaration) => ({
    //   functionDeclarations: [declaration],
    // }));
    // merge all functions into a single tool, as seems to be required for gemini 2.5 series
    // can test by asking "what tools do you have?", which lists single function unless merged
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    try {
      const chat = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction: CoreSystemPrompt,
          ...this.generateContentConfig,
          tools: tools,
        },
        history: [
          {
            role: 'user',
            parts: [envPart],
          },
          {
            role: 'model',
            parts: [{ text: 'Got it. Thanks for the context!' }],
          },
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
    availableTools: ServerTool[],
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    let turns = 0;
    try {
      while (turns < this.MAX_TURNS) {
        turns++;
        const turn = new Turn(chat, availableTools);
        const resultStream = turn.run(request, signal);
        for await (const event of resultStream) {
          yield event;
        }

        const confirmations = turn.getConfirmationDetails();
        if (confirmations.length > 0) {
          break;
        }

        // What do we do when we have both function responses and confirmations?

        const fnResponses = turn.getFunctionResponses();
        if (fnResponses.length > 0) {
          request = fnResponses;
          continue;
        } else {
          break;
        }
      }
      if (turns >= this.MAX_TURNS) {
        console.warn(
          'sendMessageStream: Reached maximum tool call turns limit.',
        );
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Gemini stream request aborted by user.');
        throw error;
      }
      console.error(`Error during Gemini stream or tool interaction:`, error);
      throw error;
    }
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
  ): Promise<Record<string, unknown>> {
    try {
      const result = await this.ai.models.generateContent({
        model: this.model,
        config: {
          ...this.generateContentConfig,
          systemInstruction: CoreSystemPrompt,
          responseSchema: schema,
          responseMimeType: 'application/json',
        },
        contents,
      });
      const responseText = result.text;
      if (!responseText) {
        throw new Error('API returned an empty response.');
      }
      try {
        const parsedJson = JSON.parse(responseText);
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
