/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ChallengeGenerator, CURATED_CHALLENGES } from './ChallengeGenerator.js';
import { KnowledgeGraph } from '../memory/KnowledgeGraph.js';

describe('ChallengeGenerator', () => {
  it('retrieves curated challenge for known engineering concepts', () => {
    const challenge = ChallengeGenerator.generateForConcept('closures');
    expect(challenge.concept).toBe('closures');
    expect(challenge.title).toContain('Memory Leak');
    expect(challenge.type).toBe('debug-scenario');
    expect(challenge.scenario).toContain('WebSocket');
    expect(challenge.keyCriteria.length).toBeGreaterThanOrEqual(2);
  });

  it('generates dynamic challenge for arbitrary concept', () => {
    const challenge = ChallengeGenerator.generateForConcept('gRPC streaming');
    expect(challenge.concept).toBe('gRPC streaming');
    expect(challenge.type).toBe('trade-off');
    expect(challenge.title).toContain('Architectural Trade-offs in gRPC streaming');
    expect(challenge.question).toContain('first principles');
  });

  it('selects challenge targeting practicing concept from KnowledgeGraph', () => {
    const graph = new KnowledgeGraph();
    graph.addOrTouch('Closures', 'language');
    graph.advanceMastery('Closures', 'mastered');
    graph.addOrTouch('Rate Limiting', 'architecture');
    graph.advanceMastery('Rate Limiting', 'practicing');

    const selected = ChallengeGenerator.selectForGraph(graph);
    expect(selected.concept).toBe('rate limiting');
    expect(selected.title).toContain('Sliding Window vs Token Bucket');
  });

  it('formats terminal card with ASCII header and scenario', () => {
    const challenge = CURATED_CHALLENGES['event loops'];
    const card = ChallengeGenerator.formatCard(challenge);
    expect(card).toContain('SOCRATIC ENGINEERING CHALLENGE');
    expect(card).toContain('Concept: event loops');
    expect(card).toContain('Microtask Queue Starvation');
    expect(card).toContain('Scenario:');
    expect(card).toContain('Challenge Question:');
  });
});
