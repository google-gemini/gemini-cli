/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolCallRequestInfo,
  ContextHarvesterInput,
  CodebaseInvestigatorInput,
  SolutionPlannerInput,
} from '@google/gemini-cli-core';
import {
  CodebaseInvestigatorTool,
  ContextHarvesterTool,
  executeToolCall,
  FatalInputError,
  FatalTurnLimitedError,
  GeminiEventType,
  isTelemetrySdkInitialized,
  parseAndFormatApiError,
  shutdownTelemetry,
  SolutionPlannerTool,
} from '@google/gemini-cli-core';
import type { Content, Part } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  try {
    consolePatcher.patch();
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    const geminiClient = config.getGeminiClient();

    const abortController = new AbortController();

    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: input,
      config,
      addItem: (_item, _timestamp) => 0,
      onDebugMessage: () => {},
      messageId: Date.now(),
      signal: abortController.signal,
    });

    if (!shouldProceed || !processedQuery) {
      // An error occurred during @include processing (e.g., file not found).
      // The error message is already logged by handleAtCommand.
      throw new FatalInputError(
        'Exiting due to an error processing the @ command.',
      );
    }

    let currentMessages: Content[] = [
      { role: 'user', parts: processedQuery as Part[] },
    ];

    const subAgentName = process.env['GEMINI_SUBAGENT_NAME'];
    const includeFileContent = process.env['GEMINI_SUBAGENT_FILE_CONTENT'];

    if (subAgentName) {
      if (subAgentName === 'contextHarvester') {
        const subAgentTool = new ContextHarvesterTool(config);
        const analysis_questions = [
          'Based on the user query, what is the primary goal?',
          'Identify all relevant files, functions, and classes related to the user a request.',
          'Provide a summary of the existing implementation.',
          'What is the best file to start with to implement the user a request?',
        ];
        const subAgentInput: ContextHarvesterInput = {
          user_objective: input,
          analysis_questions,
        };

        const invocation = subAgentTool.build(subAgentInput);
        const result = await invocation.execute(abortController.signal);

        if (result.llmContent) {
          (currentMessages[0].parts as Part[]).push(
            {
              text: `\n--- The user Ran the tool '${subAgentTool.name}'. The description of the tool is '${subAgentTool.description}'. 
              The questions the user asked are: '${analysis_questions}'.
              This is the result of the tool: ---\n`,
            },
            { text: result.llmContent as string },
          );
        }
      } else if (subAgentName === 'codebase_investigator') {
        const subAgentTool = new CodebaseInvestigatorTool(config);
        const subAgentInput: CodebaseInvestigatorInput = {
          user_objective: input,
          include_file_content: includeFileContent === 'true',
        };

        const invocation = subAgentTool.build(subAgentInput);
        const result = await invocation.execute(abortController.signal);

        if (result.llmContent) {
          (currentMessages[0].parts as Part[]).push(
            {
              text: `\n--- The user Ran the tool '${subAgentTool.name}'. The description of the tool is '${subAgentTool.description}' and this is the result of the tool: ---\n`,
            },
            { text: result.llmContent as string },
          );
        }
      } else if (subAgentName === 'planner') {
        const subAgentTool = new SolutionPlannerTool(config);
        const subAgentInput: SolutionPlannerInput = {
          user_objective: input,
          include_file_content: includeFileContent === 'true',
        };

        const invocation = subAgentTool.build(subAgentInput);
        const result = await invocation.execute(abortController.signal);

        if (result.llmContent) {
          (currentMessages[0].parts as Part[]).push(
            {
              text: `\n--
              The user Ran the tool '${subAgentTool.name}'. The description of the tool is '${subAgentTool.description}'.
              Follow the tool's plan. 
              **This is your most critical function. Your scratchpad is your memory and your plan.
              ** 1.  **Initialization:** On your very first turn, you **MUST** create the \`<scratchpad>\` section. **Analyze the \`step_by_step_plan\` provided by the Planner and create an initial very detailed \`Checklist\`  of steps.**  
              2.  **Constant Updates:** After **every** \`turn\`, you **MUST** update the scratchpad. * Mark checklist items as complete: \`[x]\`. * **Dynamically add new checklist items** as you uncover more complexity. 
              3. **Thinking on Paper:** The scratchpad shows your work. It must always reflect your current understanding of the codebase and what your next immediate step should be. \n\n Here is the context and plan given by the planner:  ---\n`,
            },
            { text: result.llmContent as string },
          );
        }
      } else if (subAgentName === 'flexible_planner') {
        const subAgentTool = new SolutionPlannerTool(config);
        const subAgentInput: SolutionPlannerInput = {
          user_objective: input,
          include_file_content: includeFileContent === 'true',
        };

        const invocation = subAgentTool.build(subAgentInput);
        const result = await invocation.execute(abortController.signal);

        if (result.llmContent) {
          (currentMessages[0].parts as Part[]).push(
            {
              text: `\n--
              The user Ran the tool '${subAgentTool.name}'. The description of the tool is '${subAgentTool.description}'.
              Here is the context and plan given by the planner:  ---\n`,
            },
            { text: result.llmContent as string },
          );
        }
      }
    }

    let turnCount = 0;
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        throw new FatalTurnLimitedError(
          'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
      }
      const toolCallRequests: ToolCallRequestInfo[] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts || [],
        abortController.signal,
        prompt_id,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }

        if (event.type === GeminiEventType.Content) {
          process.stdout.write(event.value);
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          toolCallRequests.push(event.value);
        }
      }

      if (toolCallRequests.length > 0) {
        const toolResponseParts: Part[] = [];
        for (const requestInfo of toolCallRequests) {
          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            abortController.signal,
          );

          if (toolResponse.error) {
            console.error(
              `Error executing tool ${requestInfo.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
          }

          if (toolResponse.responseParts) {
            toolResponseParts.push(...toolResponse.responseParts);
          }
        }
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    throw error;
  } finally {
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}
