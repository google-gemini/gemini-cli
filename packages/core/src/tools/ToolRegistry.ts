/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Tool, ToolContext } from './Tool.js';
import { ReadFileTool } from './filesystem/ReadFileTool.js';
import { SearchFilesTool } from './filesystem/SearchFilesTool.js';
import { GitInspectTool } from './git/GitInspectTool.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor() {
    this.register(new ReadFileTool());
    this.register(new SearchFilesTool());
    this.register(new GitInspectTool());
  }

  public register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  public async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: Unknown tool "${name}". Available tools: ${Array.from(this.tools.keys()).join(', ')}`;
    }

    // Enforce capability permission check
    context.permissions.assertAllowed(tool.capability);

    return await tool.execute(args, context);
  }

  public getPromptDescriptions(): string {
    const lines = ['Available read-only inspection tools:'];
    for (const tool of this.tools.values()) {
      lines.push(`- Tool: ${tool.name}`);
      lines.push(`  Description: ${tool.description}`);
      lines.push(`  Parameters: ${JSON.stringify(tool.parameters)}`);
    }
    return lines.join('\n');
  }
}
