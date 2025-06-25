/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { Config, ConfigParameters } from '../config/config.js';
import {
  SubAgentScope,
  SubagentTerminateMode,
  ContextState,
} from '../core/subagent.js';
import { LSTool } from './ls.js';
import { GrepTool } from './grep.js';
import { EditTool } from './edit.js';
import { ReadFileTool } from './read-file.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
/**
 * Parameters for the CleanDocstring tool
 */
export interface CleanDocstringToolParams {
  /**
   * The absolute path to the directory to list
   */
  path: string;
}

/**
 * Implementation of the CleanDocstring tool logic
 */
export class CleanDocstringTool extends BaseTool<
  CleanDocstringToolParams,
  ToolResult
> {
  static readonly Name = 'clean_docstrings';

  /**
   * Creates a new instance of the CleanDocstringTool.
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   * @param config Configuration object.
   */
  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      CleanDocstringTool.Name,
      'CleanDocstring',
      'Given a file, clean up the docstrings for it. Ensure that each function has a valid docstring.',
      {
        properties: {
          path: {
            description: 'This is the path to the file to do the cleanup on.',
            type: 'string',
          },
        },
        required: ['path'],
        type: 'object',
      },
    );

    // Set the root directory
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Executes the clean docstring operation using a subagent and orchestrator.
   * @param params Parameters for the clean docstring operation.
   * @param _signal AbortSignal (not used).
   * @returns A ToolResult object.  Returns an error object if the operation fails.
   */
  async execute(
    params: CleanDocstringToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    // let's create the subagent, and invoke it with these params
    // give it access to the specific tools
    const configParams: ConfigParameters = {
      sessionId: 'smarttool-cleandocstring-session',
      targetDir: '.',
      debugMode: false,
      cwd: process.cwd(),
      model: DEFAULT_GEMINI_FLASH_MODEL,
    };


    // Prompt Config
    const promptConfig = {
      plan: `Your job is to read the file located at ${params.path} and edit it to make sure that it has full coverage of proper docstrings for the language. 
How you approach your work:
1. Start by loading the file into memory via ${ReadFileTool.name}.
2. Then, think to yourself to find all the function defintions / function headers in that file.
3. For each function, check the file to see if the docstring is valid or not.
4. If the docstring is pretty good, don't make any edits, just continue on.
5. If the docstring needs updating, then edit the file to update it.

Rules for great docstrings:
* Docstrings should include a description of what the function does
* Docstrings should ensure that it properly describes input / return parameters

Important notes about your task:
* Do not try to edit the whole file at once. Try to make smaller edits so you don't accidentially make a mistake. It's ok to make an edit, clear your history, and re-read the file in again. that's a good thing.
* Be cafeful not to edit any part of the file that would cause errors. Make sure you do the right replacement functions to ensure the functions are correct, etc etc.
* Be careful not to duplicate any existing docstrings. If there's an existing docstring, you should review it, or edit it.
* Avoid re-writing an existing docstring, unless it is incorrect, or out of date, or non-existant. 
* Remember, a Docstring isn't just any random string, it's a SPECIFIC comment that's attached to a function that describes the arguments and returns.
* Do not edit any other part of the file, unrelated to the docstring.
* Your job is to JUST update the docstrings - Do not change any code, do not change inline comments. 
`,
      goals:
        '* Ensure that the target file has correct docstrings for all functions',
      outputs: {
        summary: 'a small list of the edits you made to the target file.',
      },
      tools: [ReadFileTool.Name, EditTool.Name, LSTool.Name, GrepTool.Name],
    };

    // Model Config
    const modelConfig = {
      model: DEFAULT_GEMINI_FLASH_MODEL,
      temp: 0.2,
      top_p: 0.95,
    };

    // Run Config
    const runConfig = {
      max_time_minutes: 2,
    };

    // Context
    const context = new ContextState();

    const orchestrator = new SubAgentScope(
      configParams,
      promptConfig,
      modelConfig,
      runConfig,
    );

    try {
      await orchestrator.runNonInteractive(context);

      if (orchestrator.output.terminate_reason === SubagentTerminateMode.GOAL) {
        return {
          llmContent: 'Docstrings updated successfully',
          returnDisplay: 'Docstrings updated successfully',
        };
      }
    } catch (error) {
      console.error('Orchestrator run failed:', error);
    }
    return {
      llmContent: `Error: An error occured while trying to fix up the docstrings for ${params.path}`,
      returnDisplay: `Error: An error occured while trying to fix up the docstrings for ${params.path}`,
    };
  }
}
