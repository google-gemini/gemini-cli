/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { VISUALIZE_TOOL_NAME } from './tool-names.js';
import { VISUALIZE_DEFINITION } from './definitions/visualize.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { renderDiagram, type DiagramType } from '../utils/diagramRenderer.js';

interface VisualizeParams {
  mermaid: string;
  diagramType?: DiagramType;
  title?: string;
}

function applyLayoutHint(
  mermaid: string,
  diagramType: DiagramType | undefined,
  title: string | undefined,
): string {
  if (diagramType !== 'flowchart') {
    return mermaid;
  }

  const lowerMermaid = mermaid.toLowerCase();
  if (
    lowerMermaid.includes('%% layout: stack') ||
    lowerMermaid.includes('%% layout: queue')
  ) {
    return mermaid;
  }

  const lowerTitle = title?.toLowerCase() ?? '';
  if (lowerTitle.includes('stack')) {
    return `%% layout: stack\n${mermaid}`;
  }
  if (lowerTitle.includes('queue')) {
    return `%% layout: queue\n${mermaid}`;
  }

  return mermaid;
}

class VisualizeInvocation extends BaseToolInvocation<
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
    const diagramType = this.params.diagramType ?? 'diagram';
    return `Rendering a ${diagramType} diagram.`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const hintedMermaid = applyLayoutHint(
        this.params.mermaid,
        this.params.diagramType,
        this.params.title,
      );
      const rendered = renderDiagram(hintedMermaid, this.params.diagramType);
      const finalOutput = this.params.title
        ? `${this.params.title}\n${rendered}`
        : rendered;

      return {
        llmContent: finalOutput,
        returnDisplay: finalOutput,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Failed to render diagram: ${message}`,
        returnDisplay: `Failed to render diagram: ${message}`,
        error: {
          message,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

export class VisualizeTool extends BaseDeclarativeTool<
  VisualizeParams,
  ToolResult
> {
  static readonly Name = VISUALIZE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      VisualizeTool.Name,
      'Visualize',
      VISUALIZE_DEFINITION.base.description!,
      Kind.Read,
      VISUALIZE_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(params: VisualizeParams, messageBus: MessageBus) {
    return new VisualizeInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(VISUALIZE_DEFINITION, modelId);
  }
}
