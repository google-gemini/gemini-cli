/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';

export interface RunExpectToolParams {
  script: string;
}

export class RunExpectTool extends BaseTool<RunExpectToolParams, ToolResult> {
  static readonly Name = 'run_expect';

  constructor() {
    super(
      RunExpectTool.Name,
      'RunExpect',
      'Runs an expect script to automate interactive CLI applications.',
      {
        properties: {
          script: {
            description: 'The expect script to run.',
            type: 'string',
          },
        },
        required: ['script'],
        type: 'object',
      },
    );
  }

  validateToolParams(params: RunExpectToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    return null;
  }

  async execute(
    params: RunExpectToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn('expect', ['-c', params.script]);
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
        child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
        child.on('error', (err) =>
          reject(new Error(`Failed to start expect: ${err.message}`)),
        );
        child.on('close', (code) => {
          const stdoutData = Buffer.concat(stdoutChunks).toString('utf8');
          const stderrData = Buffer.concat(stderrChunks).toString('utf8');
          if (code === 0) {
            resolve(stdoutData);
          } else {
            reject(new Error(`expect exited with code ${code}: ${stderrData}`));
          }
        });
      });
      return {
        llmContent: `Expect script executed successfully:\n${output}`,
        returnDisplay: output,
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      return {
        llmContent: `Error executing expect script: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}
