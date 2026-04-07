/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode, IrNode } from './types.js';

export interface MutationRecord {
  episodeId: string;
  type: 'modified' | 'inserted' | 'replaced' | 'deleted';
  action: string;
  originalIds?: string[]; // If replaced
  episode?: Episode; // For new or modified
}

export class EpisodeEditor {
  private originalMap: Map<string, Episode>;
  private workingOrder: string[];
  private workingMap: Map<string, Episode>;
  private mutations: MutationRecord[] = [];
  private targetNodes?: Set<string>;

  constructor(episodes: Episode[], targetNodes?: Set<string>) {
    this.originalMap = new Map(episodes.map((e) => [e.id, e]));
    this.workingOrder = episodes.map((e) => e.id);
    this.workingMap = new Map(episodes.map((e) => [e.id, e]));
    this.targetNodes = targetNodes;
  }

  /**
   * Provides a readonly view of the specific targets this processor is allowed to touch.
   * If no targets were specified (e.g. fallback pipeline), it returns the entire history.
   */
  get targets(): Array<{ episode: Episode; node: IrNode | Episode }> {
    const results: Array<{ episode: Episode; node: IrNode | Episode }> = [];
    
    for (const epId of this.workingOrder) {
      const ep = this.workingMap.get(epId)!;
      
      // If we don't have restricted targets, everything is a target
      if (!this.targetNodes) {
        results.push({ episode: ep, node: ep });
        continue;
      }
      
      // Check episode itself
      if (this.targetNodes.has(ep.id)) {
        results.push({ episode: ep, node: ep });
      }
      // Check trigger
      if (this.targetNodes.has(ep.trigger.id)) {
        results.push({ episode: ep, node: ep.trigger });
      }
      // Check steps
      for (const step of ep.steps) {
        if (this.targetNodes.has(step.id)) {
          results.push({ episode: ep, node: step });
        }
      }
      // Check yield
      if (ep.yield && this.targetNodes.has(ep.yield.id)) {
        results.push({ episode: ep, node: ep.yield });
      }
    }
    
    return results;
  }
  
  /**
   * Returns the full history for READ-ONLY context purposes.
   * Processors should not iterate over this array to decide what to mutate.
   * They should iterate over `editor.targets`.
   */
  getFullHistory(): readonly Episode[] {
    return this.workingOrder.map((id) => this.workingMap.get(id)!);
  }

  private isTargeted(episodeId: string): boolean {
     if (!this.targetNodes) return true;
     if (this.targetNodes.has(episodeId)) return true;
     
     const ep = this.workingMap.get(episodeId);
     if (!ep) return false;
     
     if (this.targetNodes.has(ep.trigger.id)) return true;
     if (ep.yield && this.targetNodes.has(ep.yield.id)) return true;
     for (const step of ep.steps) {
        if (this.targetNodes.has(step.id)) return true;
     }
     
     return false;
  }

  /**
   * Safely edits an existing episode.
   * The framework will handle deeply cloning the episode before passing it to the mutator.
   * Throws an error if the processor attempts to edit a non-targeted node.
   */
  editEpisode(id: string, action: string, mutator: (draft: Episode) => void) {
    if (!this.isTargeted(id)) {
       throw new Error(`EpisodeEditor: Processor attempted to edit Episode ${id} which is outside its allowed target scope.`);
    }

    const ep = this.workingMap.get(id);
    if (!ep) return;

    // Lazy deep clone only if it's the original reference
    if (ep === this.originalMap.get(id)) {
      const clone = structuredClone(ep);
      this.workingMap.set(id, clone);
    }

    const draft = this.workingMap.get(id)!;
    mutator(draft);

    // Log mutation if not already tracked as modified/inserted/replaced
    if (!this.mutations.find((m) => m.episodeId === id)) {
      this.mutations.push({
        episodeId: id,
        type: 'modified',
        action,
        episode: draft,
      });
    }
  }

  /**
   * Inserts a brand new episode into the graph at the specified index.
   */
  insertEpisode(index: number, newEpisode: Episode, action: string) {
    this.workingMap.set(newEpisode.id, newEpisode);
    this.workingOrder.splice(index, 0, newEpisode.id);
    this.mutations.push({
      episodeId: newEpisode.id,
      type: 'inserted',
      action,
      episode: newEpisode,
    });
  }

  /**
   * Replaces a set of older episodes with a single new episode (e.g., a Summary or Snapshot).
   * It inserts the new episode at the lowest index of the removed episodes.
   */
  replaceEpisodes(oldIds: string[], newEpisode: Episode, action: string) {
    for (const id of oldIds) {
      if (!this.isTargeted(id)) {
        throw new Error(`EpisodeEditor: Processor attempted to replace Episode ${id} which is outside its allowed target scope.`);
      }
    }

    const indices = oldIds
      .map((id) => this.workingOrder.indexOf(id))
      .filter((i) => i !== -1);
    if (indices.length === 0) return;

    const insertIndex = Math.min(...indices);

    // Remove old
    this.workingOrder = this.workingOrder.filter((id) => !oldIds.includes(id));
    for (const id of oldIds) {
      this.workingMap.delete(id);
    }

    // Insert new
    this.workingOrder.splice(insertIndex, 0, newEpisode.id);
    this.workingMap.set(newEpisode.id, newEpisode);

    this.mutations.push({
      episodeId: newEpisode.id,
      type: 'replaced',
      action,
      originalIds: oldIds,
      episode: newEpisode,
    });
  }

  /**
   * Removes episodes from the graph completely (e.g., emergency truncation).
   */
  removeEpisodes(oldIds: string[], action: string) {
    for (const id of oldIds) {
      if (!this.isTargeted(id)) {
        throw new Error(`EpisodeEditor: Processor attempted to remove Episode ${id} which is outside its allowed target scope.`);
      }
    }

    this.workingOrder = this.workingOrder.filter((id) => !oldIds.includes(id));
    for (const id of oldIds) {
      this.workingMap.delete(id);
      this.mutations.push({ episodeId: id, type: 'deleted', action });
    }
  }

  /**
   * Retrieves the final, finalized array of episodes.
   * Called by the Orchestrator.
   */
  getFinalEpisodes(): Episode[] {
    return this.workingOrder.map((id) => this.workingMap.get(id)!);
  }

  /**
   * Retrieves a log of all structural and property mutations performed by this editor.
   * Called by the Orchestrator to emit VariantReady events.
   */
  getMutations(): MutationRecord[] {
    return this.mutations;
  }
}
