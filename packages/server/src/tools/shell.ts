/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import { Config } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';

export interface ShellToolParams {
  command: string;
  description?: string;
}

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'execute_bash_command';
  private readonly rootDirectory: string;
  private readonly config: Config;

  constructor(rootDirectory: string, config: Config) {
    const toolDisplayName = 'Shell';
    const descriptionUrl = new URL('shell.md', import.meta.url);
    const toolDescription = fs.readFileSync(descriptionUrl, 'utf-8');
    const schemaUrl = new URL('shell.json', import.meta.url);
    const toolParameterSchema = JSON.parse(fs.readFileSync(schemaUrl, 'utf-8'));
    super(
      ShellTool.Name,
      toolDisplayName,
      toolDescription,
      toolParameterSchema,
    );
    this.config = config;
    this.rootDirectory = path.resolve(rootDirectory);
  }

  async execute(_params: ShellToolParams): Promise<ToolResult> {
    return {
      llmContent: 'hello',
      returnDisplay: 'hello',
    };
  }
}
