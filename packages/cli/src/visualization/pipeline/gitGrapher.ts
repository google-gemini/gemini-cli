/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

function toNodeId(hash: string): string {
  return `c_${hash}`;
}

function sanitizeLabel(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, "'")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

function buildCommitLabel(hash: string, subject: string, refs: string): string {
  const shortHash = hash.slice(0, 8);
  const cleanSubject = sanitizeLabel(subject).slice(0, 72);
  const cleanRefs = sanitizeLabel(refs).slice(0, 96);

  if (cleanRefs.length > 0) {
    return `${shortHash}: ${cleanRefs}`;
  }
  if (cleanSubject.length > 0) {
    return `${shortHash}: ${cleanSubject}`;
  }
  return shortHash;
}

/**
 * Generates a Mermaid graph representing the Git history.
 */
export async function getGitMermaidGraph(limit = 15): Promise<string> {
  try {
    // h: hash, p: parents, s: subject, D: refs
    const log = execSync(
      `git log --oneline --pretty=format:"%h|%p|%s|%D" -n ${limit}`,
      { maxBuffer: 1024 * 1024 },
    ).toString();

    const lines = log.split('\n').filter(Boolean);
    const inRangeHashes = new Set(
      lines
        .map((line) => line.split('|')[0]?.trim())
        .filter((hash): hash is string => Boolean(hash)),
    );

    const mermaidLines: string[] = ['graph BT']; // Bottom to Top (Oldest at bottom)

    const nodes = new Set<string>();
    const edges = new Set<string>();

    for (const line of lines) {
      const [hash, parents, subject, refs] = line.split('|');
      if (!hash) continue;

      const nodeId = toNodeId(hash);
      const label = buildCommitLabel(hash, subject ?? '', refs ?? '');
      mermaidLines.push(`  ${nodeId}["${label}"]`);
      nodes.add(hash);

      if (parents) {
        const parentList = parents.split(' ').filter(Boolean);
        for (const p of parentList) {
          // Only synthesize placeholder nodes for parents outside the
          // requested commit window. In-range parents will get full labels
          // when their own log entries are processed.
          if (!inRangeHashes.has(p) && !nodes.has(p)) {
            mermaidLines.push(
              `  ${toNodeId(p)}["${sanitizeLabel(p.slice(0, 8))}"]`,
            );
            nodes.add(p);
          }

          edges.add(`  ${nodeId} --> ${toNodeId(p)}`);
        }
      }
    }

    mermaidLines.push(...edges);
    return `${mermaidLines.join('\n')}\n`;
  } catch (err) {
    return `graph TD\n  Error[Git Log Failed: ${String(err).replace(/\n/g, ' ')}]`;
  }
}
