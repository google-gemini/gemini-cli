/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { runPipeline } from '../../visualization/index.js';

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
            const { getGitMermaidGraph } = await import('../../visualization/pipeline/gitGrapher.js');
            context.ui.setDebugMessage('Generating Git history graph...');
            spec = await getGitMermaidGraph(15);
            title = 'Git History';
        } else {
            const { getDepMermaidGraph } = await import('../../visualization/pipeline/depGrapher.js');
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
                text: `Successfully generated ${title} graph.`,
            });
        } catch (err: unknown) {
            context.ui.addItem({
                type: MessageType.ERROR,
                text: `Failed to render graph: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    },
};
