import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/types.js';
import { getResponseText } from '../../utils/partUtils.js';
import type { ConcreteNode, UserPrompt, AgentThought, ToolExecution } from '../ir/types.js';

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
  private modelToUse: string = 'gemini-2.5-flash';

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
        },
        this.modelToUse
      );
      return getResponseText(response) || text;
    } catch (e) {
      debugLogger.warn(`SemanticCompressionProcessor failed to summarize ${contextInfo}`, e);
      return text; // Fallback to original text on API failure
    }
  }

  async process({ targets, state }: ProcessArgs): Promise<ReadonlyArray<ConcreteNode>> {
    if (state.isBudgetSatisfied) {
      return targets;
    }

    const semanticConfig = this.options;
    const limitTokens = semanticConfig.nodeThresholdTokens;
    const thresholdChars = this.env.tokenCalculator.tokensToChars(limitTokens);
    
    let currentDeficit = state.deficitTokens;
    const returnedNodes: ConcreteNode[] = [];

    // Scan backwards (oldest to newest would also work, but older is safer to degrade first)
    for (const node of targets) {
      if (currentDeficit <= 0) {
        returnedNodes.push(node);
        continue;
      }

      // 1. Compress User Prompts
      if (node.type === 'USER_PROMPT') {
        const prompt = node as UserPrompt;
        let modified = false;
        const newParts = [...prompt.semanticParts];

        for (let j = 0; j < prompt.semanticParts.length; j++) {
          const part = prompt.semanticParts[j];
          if (currentDeficit <= 0) break;
          if (part.type !== 'text') continue;

          if (part.text.length > thresholdChars) {
            const summary = await this.generateSummary(part.text, 'User Prompt');
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: part.text }]);

            if (newTokens < oldTokens) {
              newParts[j] = { type: 'text', text: summary };
              currentDeficit -= (oldTokens - newTokens);
              modified = true;
            }
          }
        }

        if (modified) {
           const newTokens = this.env.tokenCalculator.estimateTokensForParts(newParts as any);
           returnedNodes.push({
             ...prompt,
             id: this.env.idGenerator.generateId(),
             semanticParts: newParts,
             metadata: {
                ...prompt.metadata,
                currentTokens: newTokens,
                transformations: [
                  ...prompt.metadata.transformations,
                  { processorName: this.name, action: 'SUMMARIZED', timestamp: Date.now() }
                ]
             }
           });
        } else {
           returnedNodes.push(node);
        }
        continue;
      }

      // 2. Compress Model Thoughts
      if (node.type === 'AGENT_THOUGHT') {
        const thought = node as AgentThought;
        if (thought.text.length > thresholdChars) {
           const summary = await this.generateSummary(thought.text, 'Agent Thought');
           const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
           const oldTokens = thought.metadata.currentTokens;
           console.log(`Agent Thought compression: newTokens=${newTokens}, oldTokens=${oldTokens}`);

           if (newTokens < oldTokens) {
             currentDeficit -= (oldTokens - newTokens);
             returnedNodes.push({
                ...thought,
                id: this.env.idGenerator.generateId(),
                text: summary,
                metadata: {
                  ...thought.metadata,
                  currentTokens: newTokens,
                  transformations: [
                    ...thought.metadata.transformations,
                    { processorName: this.name, action: 'SUMMARIZED', timestamp: Date.now() }
                  ]
                }
             });
             continue;
           }
        }
        returnedNodes.push(node);
        continue;
      }

      // 3. Compress Tool Observations
      if (node.type === 'TOOL_EXECUTION') {
         const tool = node as ToolExecution;
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

            const oldObsTokens = tool.tokens?.observation ?? tool.metadata.currentTokens;
            const intentTokens = tool.tokens?.intent ?? 0;

            if (newObsTokens < oldObsTokens) {
               currentDeficit -= (oldObsTokens - newObsTokens);
               returnedNodes.push({
                 ...tool,
                 id: this.env.idGenerator.generateId(),
                 observation: newObsObject as Record<string, unknown>,
                 tokens: {
                   intent: intentTokens,
                   observation: newObsTokens,
                 },
                 metadata: {
                   ...tool.metadata,
                   currentTokens: intentTokens + newObsTokens,
                   transformations: [
                     ...tool.metadata.transformations,
                     { processorName: this.name, action: 'SUMMARIZED', timestamp: Date.now() }
                   ]
                 }
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
