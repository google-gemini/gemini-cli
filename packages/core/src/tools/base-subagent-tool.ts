/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseToolInvocation } from './tools.js';
import type { ToolResult } from './tools.js';
import { GrepTool } from './grep.js';
import { GlobTool } from './glob.js';
import { LSTool } from './ls.js';
import { ReadFileTool } from './read-file.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { WriteTodosTool } from './write-todos.js';
import { RipGrepTool } from './ripGrep.js';
import type { AnyDeclarativeTool } from '../tools/tools.js';
import type { FunctionDeclaration } from '@google/genai';

import type { Config } from '../config/config.js';
import {
  SubAgentScope,
  ContextState,
  SubagentTerminateMode,
} from '../core/subagent.js';
import type {
  ModelConfig,
  RunConfig,
  ToolConfig,
  OutputConfig,
  PromptConfig,
} from '../core/subagent.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/models.js';
import { ToolErrorType } from './tool-error.js';
import { WebFetchTool } from './web-fetch.js';

export abstract class BaseSubAgentInvocation<
  TInput,
  TOutput,
> extends BaseToolInvocation<
  TInput extends object ? TInput : never,
  ToolResult
> {
  constructor(
    protected config: Config,
    params: TInput extends object ? TInput : never,
  ) {
    super(params);
  }
  /**
   * Returns the name of the agent for logging and identification.
   */
  abstract getAgentName(): string;

  /**
   * Returns the system prompt that defines the agent's behavior.
   */
  abstract getSystemPrompt(): string;

  /**
   * Returns the name of the output schema for display in the prompt.
   */
  abstract getOutputSchemaName(): string;

  abstract getOutputSchema(): string;

  /**
   * Populates the context state with the necessary variables for the prompt.
   * @param contextState The context state to populate.
   */
  abstract populateContextState(contextState: ContextState): void;

  /**
   * An optional hook to perform post-processing on the raw JSON string
   * returned by the sub-agent before it is returned to the primary agent.
   * @param reportJson The raw JSON string from the sub-agent.
   * @returns A promise that resolves to the final, processed JSON string.
   */
  protected async postProcessResult(reportJson: string): Promise<string> {
    return reportJson;
  }

  protected getRequiredTools(): Array<
    FunctionDeclaration | AnyDeclarativeTool
  > {
    const required_tools: Array<FunctionDeclaration | AnyDeclarativeTool> = [
      new LSTool(this.config),
      new GlobTool(this.config),
      this.config.getUseRipgrep()
        ? new RipGrepTool(this.config)
        : new GrepTool(this.config),
      new ReadFileTool(this.config),
      new ReadManyFilesTool(this.config),
      new WriteTodosTool(),
    ];
    if (process.env['GEMINI_SUBAGENT_ADD_WEB_TOOL']) {
      required_tools.push(new WebFetchTool(this.config));
    }
    return required_tools;
  }

  private getSubagentModel(): string {
    const model = process.env['GEMINI_SUBAGENT_MODEL'];
    if (model) {
      if ([DEFAULT_GEMINI_FLASH_MODEL, DEFAULT_GEMINI_MODEL].includes(model)) {
        return model;
      }
      throw new Error(`Invalid subagent model: ${model}`);
    }
    return DEFAULT_GEMINI_MODEL;
  }

  async execute(): Promise<ToolResult> {
    // Fast Fail if the required tools are missing
    const toolRegistry = this.config.getToolRegistry();
    const requiredTools = this.getRequiredTools();
    for (const tool of requiredTools) {
      if (tool.name && !toolRegistry.getTool(tool.name)) {
        const message = `${this.getAgentName()} cannot run because a critical tool ('${tool.name}') is disabled in the current configuration.`;
        return {
          llmContent: `Error: ${message}`,
          returnDisplay: `Error: Critical tool '${tool.name}' is disabled.`,
          error: { message, type: ToolErrorType.EXECUTION_FAILED },
        };
      }
    }
    const modelConfig: ModelConfig = {
      model: this.getSubagentModel(), // Uses pro for reasoning
      temp: 0.1,
      top_p: 0.95,
    };
    const runConfig: RunConfig = { max_time_minutes: 5, max_turns: 25 };

    const toolConfig: ToolConfig = {
      tools: requiredTools,
    };

    const outputConfig: OutputConfig = {
      outputs: {
        report_json: `The final JSON report structured according to the schema:\n${this.getOutputSchema()} `,
      },
    };

    const promptConfig: PromptConfig = {
      systemPrompt: this.getSystemPrompt(),
    };

    // 2. Initialize and Run the Sub-Agent Scope
    let harvesterScope: SubAgentScope;
    try {
      harvesterScope = await SubAgentScope.create(
        this.getAgentName(),
        this.config,
        promptConfig,
        modelConfig,
        runConfig,
        { toolConfig, outputConfig },
      );
    } catch (error) {
      const message = `Error initializing ${this.getAgentName()}: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: message,
        returnDisplay: `Failed to start ${this.getAgentName()}.`,
        error: { message, type: ToolErrorType.EXECUTION_FAILED },
      };
    }

    // 3. Prepare the runtime context (for templating inputs into the prompt)
    const contextState = new ContextState();
    this.populateContextState(contextState);

    try {
      await harvesterScope.runNonInteractive(contextState);
    } catch (error) {
      const message = `${this.getAgentName()} encountered a runtime error: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: message,
        returnDisplay: `${this.getAgentName()} failed during execution.`,
        error: { message, type: ToolErrorType.EXECUTION_FAILED },
      };
    }

    // 4. Process the results
    const { terminate_reason, emitted_vars } = harvesterScope.output;
    const reportJson = emitted_vars['report_json'];

    if (terminate_reason === SubagentTerminateMode.GOAL && reportJson) {
      try {
        JSON.parse(reportJson) as TOutput;
        const finalReportJson = await this.postProcessResult(reportJson);
        console.log(finalReportJson);
        return {
          llmContent: `${this.getAgentName()} finished. Report:\n\`\`\`json\n${finalReportJson}\n\`\`\``,
          returnDisplay: `${this.getAgentName()} finished successfully. This is the report: \n ${finalReportJson}.`,
        };
      } catch (_) {
        const message = `Error: ${this.getAgentName()} returned invalid JSON in its final report.`;
        return {
          llmContent: `${message}\nInvalid Response:\n${reportJson}`,
          returnDisplay: `${this.getAgentName()} failed (Invalid JSON).`,
          error: { message, type: ToolErrorType.EXECUTION_FAILED },
        };
      }
    }

    let errorMessage = `Warning:${this.getAgentName()} did not complete successfully. Reason: ${terminate_reason}.`;
    if (!reportJson && terminate_reason === SubagentTerminateMode.GOAL) {
      errorMessage = `Error: ${this.getAgentName()} claimed success (GOAL) but failed to emit the required 'report_json'. This indicates a prompt adherence failure by the sub-agent.`;
    }

    return {
      llmContent: errorMessage,
      returnDisplay: `${this.getAgentName()} job finished incomplete (${terminate_reason}).`,
      error: { message: errorMessage, type: ToolErrorType.EXECUTION_FAILED },
    };
  }
}
