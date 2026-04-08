/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ConcreteNode } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { getResponseText } from '../../utils/partUtils.js';

export interface SemanticCompressionProcessorOptions {
  nodeThresholdTokens: number;
}

export class SemanticCompressionProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: SemanticCompressionProcessorOptions,
  ): SemanticCompressionProcessor {
    return new SemanticCompressionProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      nodeThresholdTokens: {
        type: 'number',
        description: 'The token threshold above which nodes are summarized.',
      },
    },
    required: ['nodeThresholdTokens'],
  };

  readonly id = 'SemanticCompressionProcessor';
  readonly name = 'SemanticCompressionProcessor';
  readonly options: SemanticCompressionProcessorOptions;
  private env: ContextEnvironment;

  constructor(
    env: ContextEnvironment,
    options: SemanticCompressionProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  private async generateSummary(
    text: string,
    contextInfo: string,
  ): Promise<string> {
    try {
      const response = await this.env.llmClient.generateContent(
        {
          role: 'utility_compressor' as import('../../telemetry/llmRole.js').LlmRole,
          modelConfigKey: { model: 'default' },
          promptId: this.env.promptId,
          abortSignal: new AbortController().signal,
          contents: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          systemInstruction: {
            role: 'system',
            parts: [
              {
                text: `You are an expert context compressor. Your job is to drastically shorten the following ${contextInfo} while preserving the absolute core semantic meaning, facts, and intent. Omit all conversational filler, pleasantries, or redundant information. Return ONLY the compressed summary.`,
              },
            ],
          },
        }
      );
      return getResponseText(response) || text;
    } catch (e) {
      debugLogger.warn(`SemanticCompressionProcessor failed to summarize ${contextInfo}`, e);
      return text; // Fallback to original text on API failure
    }
  }

  async process({ targets }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    const semanticConfig = this.options;
    const limitTokens = semanticConfig.nodeThresholdTokens;
    const thresholdChars = this.env.tokenCalculator.tokensToChars(limitTokens);
    
    const returnedNodes: ConcreteNode[] = [];

    // Scan the target working buffer and unconditionally apply the configured hyperparameter threshold
    for (const node of targets) {
      // 1. Compress User Prompts
      if (node.type === 'USER_PROMPT') {
        const prompt = node;
        let modified = false;
        const newParts = [...prompt.semanticParts];

        for (let j = 0; j < prompt.semanticParts.length; j++) {
          const part = prompt.semanticParts[j];
          if (part.type !== 'text') continue;

          if (part.text.length > thresholdChars) {
            const summary = await this.generateSummary(part.text, 'User Prompt');
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: part.text }]);
            
            console.log(`SMOKING GUN (User Prompt): text.length=${part.text.length}, threshold=${thresholdChars}, newTokens=${newTokens}, oldTokens=${oldTokens}, summary='${summary}'`);

            if (newTokens < oldTokens) {
              newParts[j] = { type: 'text', text: summary };
              modified = true;
              console.log('SMOKING GUN (User Prompt): modified=true');
            } else {
              console.log('SMOKING GUN (User Prompt): modified=false');
            }
          }
        }

        if (modified) {
           returnedNodes.push({
             ...prompt,
             id: this.env.idGenerator.generateId(),
             semanticParts: newParts,
           });
        } else {
           returnedNodes.push(node);
        }
        continue;
      }

      // 2. Compress Model Thoughts
      if (node.type === 'AGENT_THOUGHT') {
        const thought = node;
        if (thought.text.length > thresholdChars) {
           const summary = await this.generateSummary(thought.text, 'Agent Thought');
           const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
           const oldTokens = this.env.tokenCalculator.getTokenCost(thought);

           if (newTokens < oldTokens) {
             returnedNodes.push({
                ...thought,
                id: this.env.idGenerator.generateId(),
                text: summary,
             });
             continue;
           }
        }
        returnedNodes.push(node);
        continue;
      }

      // 3. Compress Tool Observations
      if (node.type === 'TOOL_EXECUTION') {
         const tool = node;
         const rawObs = tool.observation;

         let stringifiedObs = '';
         if (typeof rawObs === 'string') {
            stringifiedObs = rawObs;
         } else {
            try {
              stringifiedObs = JSON.stringify(rawObs);
            } catch {
              stringifiedObs = String(rawObs);
            }
         }

         if (stringifiedObs.length > thresholdChars) {
            const summary = await this.generateSummary(stringifiedObs, tool.toolName || 'unknown');
            const newObsObject = { summary };

            const newObsTokens = this.env.tokenCalculator.estimateTokensForParts([
              {
                functionResponse: {
                  name: tool.toolName || 'unknown',
                  response: newObsObject,
                  id: tool.id,
                },
              },
            ]);

            const oldObsTokens = tool.tokens?.observation ?? this.env.tokenCalculator.getTokenCost(tool);
            const intentTokens = tool.tokens?.intent ?? 0;

            if (newObsTokens < oldObsTokens) {
               returnedNodes.push({
                 ...tool,
                 id: this.env.idGenerator.generateId(),
                 observation: newObsObject as Record<string, unknown>,
                 tokens: {
                   intent: intentTokens,
                   observation: newObsTokens,
                 },
               });
               continue;
            }
         }
         returnedNodes.push(node);
         continue;
      }

      returnedNodes.push(node);
    }

    return returnedNodes;
  }
}
