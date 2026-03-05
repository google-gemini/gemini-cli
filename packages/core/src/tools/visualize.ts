/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { VISUALIZE_DEFINITION } from './definitions/visualizeTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  VISUALIZE_TOOL_NAME,
  VISUALIZE_PARAM_DIAGRAM_TYPE,
  VISUALIZE_PARAM_CONTENT,
  VISUALIZE_PARAM_TITLE,
} from './definitions/base-declarations.js';
import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { renderDiagram, type DiagramType } from '../utils/diagramRenderer.js';

// ─── Tool params ──────────────────────────────────────────────────────────────

interface VisualizeParams {
  [VISUALIZE_PARAM_DIAGRAM_TYPE]: DiagramType;
  [VISUALIZE_PARAM_CONTENT]: string;
  [VISUALIZE_PARAM_TITLE]?: string;
}

// ─── Invocation ───────────────────────────────────────────────────────────────

class VisualizeToolInvocation extends BaseToolInvocation<
  VisualizeParams,
  ToolResult
> {
  constructor(
    params: VisualizeParams,
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    const title = this.params[VISUALIZE_PARAM_TITLE];
    const type = this.params[VISUALIZE_PARAM_DIAGRAM_TYPE];
    return title
      ? `Generating ${type} diagram: "${title}"`
      : `Generating ${type} diagram`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    const type = this.params[VISUALIZE_PARAM_DIAGRAM_TYPE];
    const content = this.params[VISUALIZE_PARAM_CONTENT];
    const title = this.params[VISUALIZE_PARAM_TITLE];

    const asciiArt = renderDiagram(type, content);

    const headerLine = title
      ? `\n── ${type.toUpperCase()} DIAGRAM: ${title} ──\n`
      : `\n── ${type.toUpperCase()} DIAGRAM ──\n`;

    const displayText = headerLine + asciiArt;

    return {
      llmContent: `Diagram rendered successfully as ASCII art (${type}${title ? `: ${title}` : ''}).\n\n${displayText}`,
      returnDisplay: displayText,
    };
  }
}

// ─── Tool class ───────────────────────────────────────────────────────────────

export class VisualizeTool extends BaseDeclarativeTool<
  VisualizeParams,
  ToolResult
> {
  static readonly Name = VISUALIZE_TOOL_NAME;

  constructor(config: Config, messageBus: MessageBus) {
    const declaration = resolveToolDeclaration(
      VISUALIZE_DEFINITION,
      config.getModel(),
    );
    super(
      VISUALIZE_TOOL_NAME,
      VISUALIZE_TOOL_NAME,
      declaration.description ?? '',
      Kind.Read,
      declaration.parametersJsonSchema ?? {},
      messageBus,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: VisualizeParams,
    messageBus: MessageBus,
    toolName?: string,
  ): VisualizeToolInvocation {
    return new VisualizeToolInvocation(
      params,
      messageBus,
      toolName ?? VISUALIZE_TOOL_NAME,
    );
  }
}
