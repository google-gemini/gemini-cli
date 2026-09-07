/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConceptCategory, ConceptNode, MasteryLevel } from './ConceptNode.js';

export interface KnowledgeStats {
  total: number;
  introduced: number;
  practicing: number;
  mastered: number;
}

export class KnowledgeGraph {
  private concepts = new Map<string, ConceptNode>();

  public normalize(name: string): string {
    return name.trim().toLowerCase();
  }

  public addOrTouch(
    name: string,
    category: ConceptCategory = 'general',
    initialMastery: MasteryLevel = 'introduced'
  ): ConceptNode {
    const key = this.normalize(name);
    const existing = this.concepts.get(key);
    const now = Date.now();

    if (existing) {
      existing.lastPracticedAt = now;
      existing.practiceCount += 1;
      return existing;
    }

    const node: ConceptNode = {
      name: name.trim(),
      category,
      mastery: initialMastery,
      firstSeenAt: now,
      lastPracticedAt: now,
      practiceCount: 1,
      relatedConcepts: [],
    };
    this.concepts.set(key, node);
    return node;
  }

  public advanceMastery(name: string, level: MasteryLevel): ConceptNode {
    const key = this.normalize(name);
    const node = this.concepts.get(key);
    if (!node) {
      return this.addOrTouch(name, 'general', level);
    }
    node.mastery = level;
    node.lastPracticedAt = Date.now();
    return node;
  }

  public getConcept(name: string): ConceptNode | undefined {
    return this.concepts.get(this.normalize(name));
  }

  public getAll(): ConceptNode[] {
    return Array.from(this.concepts.values());
  }

  public getByMastery(level: MasteryLevel): ConceptNode[] {
    return this.getAll().filter((c) => c.mastery === level);
  }

  public linkConcepts(conceptA: string, conceptB: string): void {
    const a = this.addOrTouch(conceptA);
    const b = this.addOrTouch(conceptB);

    if (!a.relatedConcepts?.includes(b.name)) {
      a.relatedConcepts = [...(a.relatedConcepts || []), b.name];
    }
    if (!b.relatedConcepts?.includes(a.name)) {
      b.relatedConcepts = [...(b.relatedConcepts || []), a.name];
    }
  }

  public getStats(): KnowledgeStats {
    const all = this.getAll();
    return {
      total: all.length,
      introduced: all.filter((c) => c.mastery === 'introduced').length,
      practicing: all.filter((c) => c.mastery === 'practicing').length,
      mastered: all.filter((c) => c.mastery === 'mastered').length,
    };
  }

  public static formatProgressBar(value: number, total: number, width = 16): string {
    if (total <= 0) return `[${'░'.repeat(width)}] 0%`;
    const percentage = Math.min(100, Math.round((value / total) * 100));
    const filled = Math.min(width, Math.round((percentage / 100) * width));
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
  }

  public formatSummary(): string {
    const stats = this.getStats();
    if (stats.total === 0) {
      return 'No concepts recorded yet. Start exploring topics with /learn, /solve, or /explain.';
    }

    const lines: string[] = [
      '╭──────────────────────────────────────────────╮',
      '│ DEVELOPER KNOWLEDGE & CONCEPT MASTERY        │',
      '╰──────────────────────────────────────────────╯',
      `Overall Mastery: ${KnowledgeGraph.formatProgressBar(stats.mastered, stats.total)} (${stats.mastered}/${stats.total} Mastered)`,
      '',
    ];

    const mastered = this.getByMastery('mastered');
    if (mastered.length > 0) {
      lines.push('★ Mastered:');
      for (const c of mastered) {
        lines.push(`  • ${c.name} (${c.category}, practiced ${c.practiceCount}x)`);
      }
      lines.push('');
    }

    const practicing = this.getByMastery('practicing');
    if (practicing.length > 0) {
      lines.push('⚡ In-Progress / Practicing:');
      for (const c of practicing) {
        lines.push(`  • ${c.name} (${c.category}, practiced ${c.practiceCount}x)`);
      }
      lines.push('');
    }

    const introduced = this.getByMastery('introduced');
    if (introduced.length > 0) {
      lines.push('🌱 Introduced:');
      for (const c of introduced) {
        lines.push(`  • ${c.name} (${c.category})`);
      }
    }

    return lines.join('\n').trimEnd();
  }

  public formatPromptProfile(): string {
    const stats = this.getStats();
    if (stats.total === 0) {
      return '';
    }

    const mastered = this.getByMastery('mastered').map((c) => c.name);
    const practicing = this.getByMastery('practicing').map((c) => c.name);
    const introduced = this.getByMastery('introduced').map((c) => c.name);

    const parts: string[] = ['### DEVELOPER CONCEPT MASTERY PROFILE:'];
    if (mastered.length > 0) {
      parts.push(`- Mastered Concepts: ${mastered.join(', ')}`);
    }
    if (practicing.length > 0) {
      parts.push(`- In-Progress Concepts: ${practicing.join(', ')}`);
    }
    if (introduced.length > 0) {
      parts.push(`- Introduced Concepts: ${introduced.join(', ')}`);
    }
    parts.push(
      '- Instruction Directive: Do not re-explain Mastered Concepts from scratch; treat them as established tools. Calibrate questions and guidance to In-Progress topics.'
    );

    return parts.join('\n');
  }

  public toJSON(): Record<string, any> {
    const list = this.getAll();
    return {
      version: 1,
      updatedAt: Date.now(),
      concepts: list,
    };
  }

  public fromJSON(data: any): void {
    if (!data || !Array.isArray(data.concepts)) return;
    this.concepts.clear();
    for (const item of data.concepts) {
      if (item && item.name) {
        const key = this.normalize(item.name);
        this.concepts.set(key, {
          name: item.name,
          category: item.category || 'general',
          mastery: item.mastery || 'introduced',
          firstSeenAt: item.firstSeenAt || Date.now(),
          lastPracticedAt: item.lastPracticedAt || Date.now(),
          practiceCount: item.practiceCount || 1,
          notes: item.notes,
          relatedConcepts: item.relatedConcepts || [],
        });
      }
    }
  }
}
