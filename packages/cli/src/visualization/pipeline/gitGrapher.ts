/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Generates a Mermaid graph representing the Git history.
 */
export async function getGitMermaidGraph(limit = 15): Promise<string> {
    try {
        // h: hash, p: parents, s: subject, D: refs
        const log = execSync(
            `git log --oneline --pretty=format:"%h|%p|%s|%D" -n ${limit}`,
            { maxBuffer: 1024 * 1024 }
        ).toString();

        const lines = log.split('\n').filter(Boolean);
        let mermaid = 'graph BT\n'; // Bottom to Top (Oldest at bottom)

        const nodes = new Set<string>();

        for (const line of lines) {
            const [hash, parents, subject, refs] = line.split('|');
            if (!hash) continue;

            const cleanSubject = subject.replace(/["()]/g, "'").substring(0, 40);
            const nodeLabel = refs ? `[${hash}: ${refs}]` : `(${hash}: ${cleanSubject})`;

            mermaid += `  ${hash}${nodeLabel}\n`;
            nodes.add(hash);

            if (parents) {
                const parentList = parents.split(' ').filter(Boolean);
                for (const p of parentList) {
                    mermaid += `  ${hash} --> ${p}\n`;
                }
            }
        }

        // Ensure we don't have dangling edges to commits outside the limit
        // (Actually Mermaid handles this by creating empty nodes, which is okay)

        return mermaid;
    } catch (err) {
        return `graph TD\n  Error[Git Log Failed: ${String(err).replace(/\n/g, ' ')}]`;
    }
}
