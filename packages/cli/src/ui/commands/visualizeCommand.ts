/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { runPipeline, renderVisualArtifact } from '../../visualization/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  description: 'Render a Mermaid diagram (or other supported graphics) inline in the terminal',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const fileArg = args.trim();
    if (!fileArg) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /visualize <path-to-file.mmd>',
      });
      return;
    }

    const filePath = resolve(process.cwd(), fileArg);
    if (!existsSync(filePath)) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `File not found: ${filePath}`,
      });
      return;
    }

    try {
      context.ui.setDebugMessage(`Visualizing ${filePath}...`);
      const spec = readFileSync(filePath, 'utf8');

      // 1. Run the headless browser rendering pipeline
      const result = await runPipeline({
        spec,
        diagramType: 'mermaid',
        theme: 'dark',
      });

      // 2. Render the artifact
      // We'll capture the ASCII fallback specifically to show it via addItem if needed,
      // as direct stdout writes can be cleared by Ink's rendering loop.
      const caps = (await import('../../visualization/caps/detect.js')).detectTerminalCaps();
      
      if (caps.protocol === 'ascii') {
        const ascii = (await import('../../visualization/render/ascii.js')).renderMermaidAscii(spec, caps.columns);
        context.ui.addItem({
          type: MessageType.INFO,
          text: `\n${ascii}\n\nSuccessfully rendered ASCII visualization for \`${fileArg}\`.`,
        });
      } else {
        // For graphics protocols, we still write to stdout, but we also provide a confirmation
        await renderVisualArtifact(result, { spec, showMeta: true });
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Successfully rendered ${caps.protocol.toUpperCase()} visualization for \`${fileArg}\`.`,
        });
      }
    } catch (err: unknown) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to visualize diagram: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  },
};
