/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import {
  runPipeline,
} from '../../visualization/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

      // 1. Run the headless browser rendering pipeline
      const result = await runPipeline({
        spec,
        diagramType: 'mermaid',
        theme: 'dark',
      });

      // 2. Render the artifact
      const { renderVisualArtifact } = await import('../../visualization/render/visualArtifact.js');
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
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to visualize diagram: ${err instanceof Error ? err.message : String(err)
          }`,
      });
    }
  },
};
