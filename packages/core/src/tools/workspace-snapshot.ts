/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { BaseDeclarativeTool, BaseToolInvocation, Kind, type ToolInvocation, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import { WORKSPACE_SNAPSHOT_TOOL_NAME } from './tool-names.js';

export interface WorkspaceSnapshotParams {
  depth?: number;
}

class WorkspaceSnapshotInvocation extends BaseToolInvocation<WorkspaceSnapshotParams, ToolResult> {
  protected async doExecute(): Promise<ToolResult> {
    const targetDir = this.config.getTargetDir();
    const depth = this.params.depth ?? 2;
    
    // 1. Scan directory structure
    const structure = await this.scanDir(targetDir, depth);
    
    // 2. Detect tech stack
    const stack = await this.detectStack(targetDir);
    
    // 3. Find key files (README, etc.)
    const entryPoints = await this.findEntryPoints(targetDir);

    const summary = [
      '# Workspace Snapshot',
      `**Location**: ${targetDir}`,
      '',
      '## Tech Stack',
      stack.length > 0 ? stack.map(s => `- ${s}`).join('\n') : 'No specific stack detected.',
      '',
      '## Entry Points & Configs',
      entryPoints.length > 0 ? entryPoints.map(e => `- ${e}`).join('\n') : 'None found.',
      '',
      '## Directory Structure',
      '```text',
      structure,
      '```'
    ].join('\n');

    return {
      content: summary,
    };
  }

  private async scanDir(dir: string, maxDepth: number, currentDepth = 0): Promise<string> {
    if (currentDepth > maxDepth) return '';
    
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      let result = '';
      
      for (const file of files) {
        if (file.name === 'node_modules' || file.name === '.git') continue;
        
        const indent = '  '.repeat(currentDepth);
        result += `${indent}${file.isDirectory() ? '📂' : '📄'} ${file.name}\n`;
        
        if (file.isDirectory()) {
          result += await this.scanDir(path.join(dir, file.name), maxDepth, currentDepth + 1);
        }
      }
      return result;
    } catch {
      return '';
    }
  }

  private async detectStack(dir: string): Promise<string[]> {
    const stack: string[] = [];
    const files = await fs.readdir(dir);
    
    if (files.includes('package.json')) stack.push('Node.js / TypeScript');
    if (files.includes('requirements.txt') || files.includes('pyproject.toml')) stack.push('Python');
    if (files.includes('go.mod')) stack.push('Go');
    if (files.includes('Cargo.toml')) stack.push('Rust');
    if (files.some(f => f.endsWith('.ini') || f.endsWith('.cfg'))) stack.push('Config/Modding (Detected .cfg/.ini)');
    
    return stack;
  }

  private async findEntryPoints(dir: string): Promise<string[]> {
    const common = ['README.md', 'index.ts', 'main.py', 'app.py', 'src/index.ts', '.env'];
    const files = await fs.readdir(dir);
    return common.filter(c => files.includes(c));
  }
}

export class WorkspaceSnapshotTool extends BaseDeclarativeTool<WorkspaceSnapshotParams, ToolResult> {
  static readonly Name = 'workspace_snapshot';

  constructor(private readonly config: Config, messageBus: MessageBus) {
    super(
      WorkspaceSnapshotTool.Name,
      'WorkspaceSnapshot',
      'Provides a comprehensive high-level summary of the workspace, including tech stack, entry points, and directory structure.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          depth: { type: 'number', description: 'Scan depth (default 2)' }
        }
      },
      messageBus
    );
  }

  protected createInvocation(params: WorkspaceSnapshotParams, messageBus: MessageBus): ToolInvocation<WorkspaceSnapshotParams, ToolResult> {
    return new WorkspaceSnapshotInvocation(this.config, params, messageBus);
  }
}
