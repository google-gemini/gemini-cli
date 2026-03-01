/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HierarchicalMemory {
  global?: string;
  extension?: string;
  workspace?: string;
  /** @deprecated Use workspace instead */
  project?: string;
}

/**
 * Flattens hierarchical memory into a single string for display or legacy use.
 */
export function flattenMemory(memory?: string | HierarchicalMemory): string {
  if (!memory) return '';
  if (typeof memory === 'string') return memory;

  const sections: Array<{ name: string; content: string }> = [];
  if (memory.global?.trim()) {
    sections.push({ name: 'Global', content: memory.global.trim() });
  }
  if (memory.extension?.trim()) {
    sections.push({ name: 'Extension', content: memory.extension.trim() });
  }
  if (memory.workspace?.trim()) {
    sections.push({ name: 'Workspace', content: memory.workspace.trim() });
  } else if (memory.project?.trim()) {
    sections.push({ name: 'Workspace', content: memory.project.trim() });
  }

  if (sections.length === 0) return '';

  return sections.map((s) => `--- ${s.name} ---\n${s.content}`).join('\n\n');
}
