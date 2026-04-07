/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode } from './types.js';

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
  
  constructor(episodes: Episode[]) {
    this.originalMap = new Map(episodes.map(e => [e.id, e]));
    this.workingOrder = episodes.map(e => e.id);
    this.workingMap = new Map(episodes.map(e => [e.id, e]));
  }
  
  /**
   * Provides a readonly view of the current working state of the episodes.
   * Processors should iterate over this to decide what to mutate.
   */
  get episodes(): readonly Episode[] {
    return this.workingOrder.map(id => this.workingMap.get(id)!);
  }
  
  /**
   * Safely edits an existing episode.
   * The framework will handle deeply cloning the episode before passing it to the mutator,
   * guaranteeing that original references are never modified.
   */
  editEpisode(id: string, action: string, mutator: (draft: Episode) => void) {
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
    if (!this.mutations.find(m => m.episodeId === id)) {
        this.mutations.push({ episodeId: id, type: 'modified', action, episode: draft });
    }
  }

  /**
   * Inserts a brand new episode into the graph at the specified index.
   */
  insertEpisode(index: number, newEpisode: Episode, action: string) {
     this.workingMap.set(newEpisode.id, newEpisode);
     this.workingOrder.splice(index, 0, newEpisode.id);
     this.mutations.push({ episodeId: newEpisode.id, type: 'inserted', action, episode: newEpisode });
  }
  
  /**
   * Replaces a set of older episodes with a single new episode (e.g., a Summary or Snapshot).
   * It inserts the new episode at the lowest index of the removed episodes.
   */
  replaceEpisodes(oldIds: string[], newEpisode: Episode, action: string) {
     const indices = oldIds.map(id => this.workingOrder.indexOf(id)).filter(i => i !== -1);
     if (indices.length === 0) return;
     
     const insertIndex = Math.min(...indices);
     
     // Remove old
     this.workingOrder = this.workingOrder.filter(id => !oldIds.includes(id));
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
        episode: newEpisode
     });
  }

  /**
   * Removes episodes from the graph completely (e.g., emergency truncation).
   */
  removeEpisodes(oldIds: string[], action: string) {
      this.workingOrder = this.workingOrder.filter(id => !oldIds.includes(id));
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
    return this.workingOrder.map(id => this.workingMap.get(id)!);
  }
  
  /**
   * Retrieves a log of all structural and property mutations performed by this editor.
   * Called by the Orchestrator to emit VariantReady events.
   */
  getMutations(): MutationRecord[] {
    return this.mutations;
  }
}
