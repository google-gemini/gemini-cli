/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { runPipeline } from '../../visualization/index.js';

interface ErrorLike {
  message?: unknown;
  stack?: unknown;
}

function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message ?? err.toString();
  }

  if (typeof err === 'object' && err !== null) {
    const errorLike = err as ErrorLike;
    const message =
      typeof errorLike.message === 'string' ? errorLike.message : '';
    const stack = typeof errorLike.stack === 'string' ? errorLike.stack : '';

    const details: string[] = [];
    if (message.length > 0) details.push(message);
    if (stack.length > 0) details.push(stack);

    try {
      const json = JSON.stringify(
        err,
        Object.getOwnPropertyNames(Object(err)),
      );
      if (json && json !== '{}') {
        details.push(json);
      }
    } catch {
      // Ignore serialization failures.
    }

    if (details.length > 0) {
      return details.join('\n');
    }
  }

  return String(err);
}

export const graphCommand: SlashCommand = {
  name: 'graph',
  description: 'Generate codebase visualizations (git history or dependencies)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const type = args.trim().toLowerCase();
    if (!['git', 'deps'].includes(type)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /graph git or /graph deps',
      });
      return;
    }

    let spec = '';
    let title = '';

    if (type === 'git') {
      const { getGitMermaidGraph } = await import(
        '../../visualization/pipeline/gitGrapher.js'
      );
      context.ui.setDebugMessage('Generating Git history graph...');
      spec = await getGitMermaidGraph(15);
      title = 'Git History';
    } else {
      const { getDepMermaidGraph } = await import(
        '../../visualization/pipeline/depGrapher.js'
      );
      context.ui.setDebugMessage('Scraping workspace dependencies...');
      const root = context.services.config?.getTargetDir() || process.cwd();
      spec = await getDepMermaidGraph(root);
      title = 'Workspace Dependencies';
    }

    if (!spec || spec.startsWith('graph TD\n  Error')) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: spec || 'Failed to generate graph.',
      });
      return;
    }

    try {
      context.ui.setDebugMessage(`Rendering ${title} graph...`);

      // 1. Run the headless browser rendering pipeline
      const result = await runPipeline({
        spec,
        diagramType: 'mermaid',
        theme: 'dark',
      });

      // 2. Render the artifact
      const { renderVisualArtifact } = await import(
        '../../visualization/render/visualArtifact.js'
      );
      const output = await renderVisualArtifact(result, {
        spec,
        showMeta: true,
      });

      if (output) {
        const { writeSync } = await import('node:fs');
        writeSync(1, '\n');
        writeSync(1, output);
        writeSync(1, '\n');
      }

      context.ui.addItem({
        type: MessageType.INFO,
        text: `Successfully generated ${title} graph.`,
      });
    } catch (err: unknown) {
      const errMsg = formatUnknownError(err);
      const shortErr = errMsg.split('\n')[0]?.trim() || 'Unknown error';

      let fallbackRendered = false;
      try {
        const { renderMermaidAscii } = await import(
          '../../visualization/index.js'
        );
        const { writeSync } = await import('node:fs');
        const ascii = renderMermaidAscii(spec, process.stdout.columns ?? 80);
        writeSync(1, '\n');
        writeSync(1, ascii);
        writeSync(1, '\n');
        fallbackRendered = true;
      } catch (fallbackErr) {
        try {
          context.ui.setDebugMessage(
            `Graph ASCII fallback failed: ${formatUnknownError(fallbackErr)}`,
          );
        } catch {
          // Never block on debug message formatting.
        }
      }

      if (fallbackRendered) {
        context.ui.addItem({
          type: MessageType.WARNING,
          text: `Graph rendering failed (${shortErr}). Displayed ASCII fallback instead.`,
        });
        return;
      }

      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to render graph: ${errMsg}`,
      });
    }
  },
};
