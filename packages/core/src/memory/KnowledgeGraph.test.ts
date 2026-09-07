/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from './KnowledgeGraph.js';

describe('KnowledgeGraph', () => {
  it('adds and touches concepts with practice counts', () => {
    const graph = new KnowledgeGraph();
    const node1 = graph.addOrTouch('Closures', 'language', 'introduced');
    expect(node1.name).toBe('Closures');
    expect(node1.mastery).toBe('introduced');
    expect(node1.practiceCount).toBe(1);

    const node2 = graph.addOrTouch('closures');
    expect(node2.practiceCount).toBe(2);
    expect(graph.getAll().length).toBe(1);
  });

  it('advances mastery levels from introduced to practicing to mastered', () => {
    const graph = new KnowledgeGraph();
    graph.addOrTouch('async/await', 'language');

    const practicing = graph.advanceMastery('async/await', 'practicing');
    expect(practicing.mastery).toBe('practicing');

    const mastered = graph.advanceMastery('async/await', 'mastered');
    expect(mastered.mastery).toBe('mastered');

    const stats = graph.getStats();
    expect(stats.total).toBe(1);
    expect(stats.mastered).toBe(1);
    expect(stats.practicing).toBe(0);
    expect(stats.introduced).toBe(0);
  });

  it('links related concepts bidirectionally', () => {
    const graph = new KnowledgeGraph();
    graph.linkConcepts('Promises', 'async/await');

    const promises = graph.getConcept('promises');
    const asyncAwait = graph.getConcept('async/await');

    expect(promises?.relatedConcepts).toContain('async/await');
    expect(asyncAwait?.relatedConcepts).toContain('Promises');
  });

  it('formats progress bar accurately', () => {
    const bar = KnowledgeGraph.formatProgressBar(5, 10, 10);
    expect(bar).toContain('50%');
    expect(bar).toContain('█████░░░░░');
  });

  it('formats summary dashboard with progress bars and tiers', () => {
    const graph = new KnowledgeGraph();
    graph.addOrTouch('Closures', 'language');
    graph.advanceMastery('Closures', 'mastered');
    graph.addOrTouch('Event Loops', 'concurrency');
    graph.advanceMastery('Event Loops', 'practicing');
    graph.addOrTouch('Rate Limiting', 'architecture');

    const summary = graph.formatSummary();
    expect(summary).toContain('DEVELOPER KNOWLEDGE & CONCEPT MASTERY');
    expect(summary).toContain('★ Mastered:');
    expect(summary).toContain('Closures');
    expect(summary).toContain('⚡ In-Progress / Practicing:');
    expect(summary).toContain('Event Loops');
    expect(summary).toContain('🌱 Introduced:');
    expect(summary).toContain('Rate Limiting');
  });

  it('formats calibrated prompt profile for system instruction injection', () => {
    const graph = new KnowledgeGraph();
    graph.addOrTouch('Closures', 'language');
    graph.advanceMastery('Closures', 'mastered');
    graph.addOrTouch('Event Loops', 'concurrency');
    graph.advanceMastery('Event Loops', 'practicing');

    const profile = graph.formatPromptProfile();
    expect(profile).toContain('### DEVELOPER CONCEPT MASTERY PROFILE:');
    expect(profile).toContain('Mastered Concepts: Closures');
    expect(profile).toContain('In-Progress Concepts: Event Loops');
    expect(profile).toContain('Do not re-explain Mastered Concepts from scratch');
  });

  it('serializes to and from JSON', () => {
    const graph = new KnowledgeGraph();
    graph.addOrTouch('Docker', 'architecture');
    graph.advanceMastery('Docker', 'mastered');

    const json = graph.toJSON();
    const newGraph = new KnowledgeGraph();
    newGraph.fromJSON(json);

    const restored = newGraph.getConcept('docker');
    expect(restored?.name).toBe('Docker');
    expect(restored?.mastery).toBe('mastered');
  });
});
