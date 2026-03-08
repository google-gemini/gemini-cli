/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { runPipeline } from '../../visualization/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  description:
    'Render a Mermaid diagram (or other supported graphics) inline in the terminal',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const inputArg = args.trim();
    if (!inputArg) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /visualize <path-to-file.mmd> or /visualize "prompt"',
      });
      return;
    }

    let spec: string | null = null;
    let sourceLabel = '';

    // Strip surrounding quotes if present (common when users copy-paste prompts)
    let processedArg = inputArg;
    if (
      (processedArg.startsWith('"') && processedArg.endsWith('"')) ||
      (processedArg.startsWith("'") && processedArg.endsWith("'"))
    ) {
      processedArg = processedArg.substring(1, processedArg.length - 1);
    }

    // 1. Try treating it as a file if it has a common diagram extension
    const isDiagramFile = /\.(mmd|mermaid|md|mdx)$/i.test(processedArg);
    const filePath = resolve(process.cwd(), processedArg);

    if (isDiagramFile && existsSync(filePath)) {
      context.ui.setDebugMessage(`Visualizing file: ${filePath}...`);
      spec = readFileSync(filePath, 'utf8');
      sourceLabel = `file \`${processedArg}\``;
    } else {
      // 2. Otherwise, treat it as a prompt for generative visualization
      const { generateMermaid } = await import('../../visualization/index.js');
      spec = await generateMermaid(context, processedArg);
      sourceLabel = `prompt: "${processedArg}"`;
    }

    if (!spec) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Could not obtain diagram spec from ${sourceLabel}.`,
      });
      return;
    }

    try {
      context.ui.setDebugMessage(`Rendering diagram...`);

      const { detectTerminalCaps } = await import(
        '../../visualization/caps/detect.js'
      );
      const caps = detectTerminalCaps();
      const asciiOnly = caps.protocol === 'ascii';

      // 1. Run the headless browser rendering pipeline
      const result = await runPipeline({
        spec,
        diagramType: 'mermaid',
        theme: 'dark',
        asciiOnly,
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
        text: `Successfully visualized diagram from ${sourceLabel}.`,
      });
    } catch (err: unknown) {
      const errMsg = formatUnknownError(err);
      context.ui.setDebugMessage(`Visualization render error:\n${errMsg}`);
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
            `ASCII fallback failed: ${formatUnknownError(fallbackErr)}`,
          );
        } catch {
          // Never block on debug message formatting.
        }
      }

      if (fallbackRendered) {
        context.ui.addItem({
          type: MessageType.WARNING,
          text: `Graphics rendering failed (${shortErr}). Displayed ASCII fallback instead.`,
        });
        return;
      }

      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to visualize diagram: ${errMsg}`,
      });
    }
  },
};
