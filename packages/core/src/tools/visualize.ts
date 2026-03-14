/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type {
  VisualizeToolParams,
  DiagramData,
  BrowserPreview,
} from './visualize/types.js';
import { parseMermaid } from './visualize/parsers/mermaid-parser.js';
import { layoutDiagram } from './visualize/layout/dagre-layout.js';
import { generateDepGraphMermaid } from './visualize/analyzers/dep-graph.js';
import {
  VISUALIZE_DEFINITION,
  VISUALIZE_TOOL_NAME,
  VISUALIZE_DISPLAY_NAME,
} from './definitions/visualize-declarations.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

class VisualizeToolInvocation extends BaseToolInvocation<
  VisualizeToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: VisualizeToolParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  override getDescription(): string {
    if (this.params.title) {
      return this.params.title;
    }
    switch (this.params.type) {
      case 'mermaid':
        return 'Rendering Mermaid diagram';
      case 'dependency_graph':
        return `Visualizing dependencies from ${this.params.file_path ?? 'manifest'}`;
      case 'git_history':
        return 'Visualizing git history';
      case 'html_preview':
        return 'Opening HTML preview in browser';
      default:
        return 'Visualize';
    }
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    switch (this.params.type) {
      case 'mermaid':
        return this.executeMermaid();
      case 'dependency_graph':
        return this.executeDependencyGraph();
      case 'git_history':
        return this.executeGitHistory();
      case 'html_preview':
        return this.executeHtmlPreview();
      default:
        return {
          llmContent: `Error: Unknown visualization type "${String(this.params.type)}"`,
          returnDisplay: `Unknown visualization type`,
          error: {
            message: `Unknown visualization type: ${String(this.params.type)}`,
          },
        };
    }
  }

  private async executeMermaid(): Promise<ToolResult> {
    const content = this.params.content!;
    return this.renderMermaidContent(content);
  }

  private async executeDependencyGraph(): Promise<ToolResult> {
    const filePath = this.params.file_path!;
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.config.getTargetDir(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      return {
        llmContent: `Error: File not found: ${resolvedPath}`,
        returnDisplay: `File not found: ${resolvedPath}`,
        error: { message: `File not found: ${resolvedPath}` },
      };
    }

    const mermaidCode = generateDepGraphMermaid(resolvedPath);
    return this.renderMermaidContent(mermaidCode);
  }

  private async executeGitHistory(): Promise<ToolResult> {
    try {
      // Get recent commits (no stash, no reflog noise)
      const logOutput = execSync(
        'git log --all --exclude=refs/stash --format="%h %p %s" -n 10',
        {
          cwd: this.config.getTargetDir(),
          encoding: 'utf8',
          timeout: 10000,
        },
      );

      // Get branch tips for decoration
      const branchOutput = execSync(
        'git branch -a --format="%(objectname:short) %(refname:short)"',
        {
          cwd: this.config.getTargetDir(),
          encoding: 'utf8',
          timeout: 10000,
        },
      );

      const branchMap = new Map<string, string[]>();
      for (const line of branchOutput.trim().split('\n').filter(Boolean)) {
        const [hash, ...nameParts] = line.split(' ');
        const name = nameParts.join(' ');
        if (!branchMap.has(hash)) branchMap.set(hash, []);
        branchMap.get(hash)!.push(name);
      }

      const lines = logOutput.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        return {
          llmContent: 'No git history found.',
          returnDisplay: 'No git history found.',
        };
      }

      // Parse: format is "shorthash parent1 parent2... subject"
      const commits: Array<{
        hash: string;
        parents: string[];
        subject: string;
      }> = [];
      const allHashes = new Set<string>();

      for (const line of lines) {
        const parts = line.split(' ');
        const hash = parts[0];
        allHashes.add(hash);
        const parents: string[] = [];
        let msgStart = 1;

        for (let i = 1; i < parts.length; i++) {
          if (/^[0-9a-f]{6,}$/.test(parts[i])) {
            parents.push(parts[i]);
            msgStart = i + 1;
          } else {
            break;
          }
        }

        const subject = parts.slice(msgStart).join(' ').slice(0, 25);
        commits.push({ hash, parents, subject });
      }

      // Build compact flowchart
      const mermaidLines = ['graph TD'];
      const declared = new Set<string>();

      for (const commit of commits) {
        const id = 'c' + commit.hash;
        if (!declared.has(id)) {
          const branches = branchMap.get(commit.hash);
          const label = branches
            ? `${commit.hash} ${branches[0]}`
            : `${commit.hash} ${commit.subject}`;
          // Use safe chars only
          const safeLabel = label.replace(/[^\w\s./\->,#]/g, '');
          mermaidLines.push(`  ${id}[${safeLabel}]`);
          declared.add(id);
        }

        for (const parent of commit.parents) {
          const parentId = 'c' + parent;
          if (allHashes.has(parent)) {
            mermaidLines.push(`  ${id} --> ${parentId}`);
          }
        }
      }

      const mermaidCode = mermaidLines.join('\n');
      return await this.renderMermaidContent(mermaidCode);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get git history';
      return {
        llmContent: `Error: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }

  private executeHtmlPreview(): ToolResult {
    const html = this.params.html!;
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `gemini-preview-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf8');

    const platform = process.platform;
    try {
      if (platform === 'win32') {
        execSync(`start "" "${tmpFile}"`, { shell: 'cmd.exe' });
      } else if (platform === 'darwin') {
        execSync(`open "${tmpFile}"`);
      } else {
        execSync(`xdg-open "${tmpFile}"`);
      }
    } catch {
      // If opening fails, still return the path
    }

    const preview: BrowserPreview = {
      isBrowserPreview: true,
      imagePath: tmpFile,
      title: this.params.title,
    };
    return {
      llmContent: `HTML preview opened in browser: ${tmpFile}`,
      returnDisplay: preview,
    };
  }

  private async renderMermaidContent(content: string): Promise<ToolResult> {
    const parsed = await parseMermaid(content);
    const terminalWidth = process.stdout.columns || 80;

    // Detect direction from mermaid code
    let direction: 'LR' | 'TD' | 'RL' | 'BT' = 'TD';
    const firstLine = content.trim().split('\n')[0].trim();
    const dirMatch = firstLine.match(/\b(LR|TD|RL|BT|TB)\b/i);
    if (dirMatch) {
      const d = dirMatch[1].toUpperCase();
      if (d === 'TB') {
        direction = 'TD';
      } else if (d === 'LR' || d === 'TD' || d === 'RL' || d === 'BT') {
        direction = d;
      }
    }

    const layoutResult = layoutDiagram(parsed.nodes, parsed.edges, {
      direction,
      terminalWidth,
    });

    const diagram: DiagramData = {
      isDiagram: true,
      diagramType: parsed.diagramType,
      nodes: layoutResult.nodes,
      edges: layoutResult.edges,
      title: this.params.title,
      raw: content,
    };

    return {
      llmContent: `Diagram rendered successfully (${parsed.nodes.length} nodes, ${parsed.edges.length} edges)`,
      returnDisplay: diagram,
    };
  }
}

/**
 * Tool for generating and rendering visual diagrams and previews.
 */
export class VisualizeTool extends BaseDeclarativeTool<
  VisualizeToolParams,
  ToolResult
> {
  static readonly Name = VISUALIZE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      VisualizeTool.Name,
      VISUALIZE_DISPLAY_NAME,
      VISUALIZE_DEFINITION.base.description!,
      Kind.Other,
      VISUALIZE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: VisualizeToolParams,
  ): string | null {
    if (params.type === 'mermaid' && !params.content) {
      return "The 'content' parameter is required when type is 'mermaid'.";
    }
    if (params.type === 'dependency_graph' && !params.file_path) {
      return "The 'file_path' parameter is required when type is 'dependency_graph'.";
    }
    if (params.type === 'html_preview' && !params.html) {
      return "The 'html' parameter is required when type is 'html_preview'.";
    }
    return null;
  }

  protected createInvocation(
    params: VisualizeToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<VisualizeToolParams, ToolResult> {
    return new VisualizeToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(VISUALIZE_DEFINITION, modelId);
  }
}
