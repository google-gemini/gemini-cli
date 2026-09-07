/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { KnowledgeGraph } from './KnowledgeGraph.js';
import type { ConceptCategory, ConceptNode, MasteryLevel } from './ConceptNode.js';

export interface KnowledgeStoreOptions {
  storagePath?: string;
  autoSave?: boolean;
}

export class KnowledgeStore {
  private graph: KnowledgeGraph;
  private filePath: string | null = null;
  private autoSave: boolean;

  constructor(workspaceRoot?: string, options: KnowledgeStoreOptions = {}) {
    this.graph = new KnowledgeGraph();
    this.autoSave = options.autoSave ?? true;

    if (options.storagePath) {
      this.filePath = options.storagePath;
    } else if (workspaceRoot) {
      this.filePath = path.join(workspaceRoot, '.zoe', 'knowledge.json');
    }

    if (this.filePath) {
      this.load();
    }
  }

  public getGraph(): KnowledgeGraph {
    return this.graph;
  }

  public getFilePath(): string | null {
    return this.filePath;
  }

  public load(): boolean {
    if (!this.filePath) return false;
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(content);
        this.graph.fromJSON(parsed);
        return true;
      }
    } catch (_e) {
      // Graceful fallback on read error
    }
    return false;
  }

  public save(): boolean {
    if (!this.filePath) return false;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(this.graph.toJSON(), null, 2);
      fs.writeFileSync(this.filePath, data, 'utf8');
      return true;
    } catch (_e) {
      // Graceful fallback on write error
    }
    return false;
  }

  public addOrTouch(
    name: string,
    category: ConceptCategory = 'general',
    initialMastery: MasteryLevel = 'introduced'
  ): ConceptNode {
    const node = this.graph.addOrTouch(name, category, initialMastery);
    if (this.autoSave) {
      this.save();
    }
    return node;
  }

  public advanceMastery(name: string, level: MasteryLevel): ConceptNode {
    const node = this.graph.advanceMastery(name, level);
    if (this.autoSave) {
      this.save();
    }
    return node;
  }
}
