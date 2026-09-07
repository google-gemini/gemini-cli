/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Challenge } from './ChallengeModel.js';
import type { KnowledgeGraph } from '../memory/KnowledgeGraph.js';
import { AsciiBox } from '../skills/archify/AsciiBox.js';

export const CURATED_CHALLENGES: Record<string, Challenge> = {
  closures: {
    id: 'ch-closures-01',
    concept: 'closures',
    type: 'debug-scenario',
    title: 'Memory Leak via Retained Closure Scope',
    scenario:
      'A WebSocket connection handler registers an event listener callback. The callback references only a small string ID, but the enclosing lexical scope also instantiates a 20MB buffer before returning.',
    question:
      'Explain why the V8 garbage collector may retain the entire 20MB buffer in memory. How would you restructure the code to guarantee the buffer is collected without killing the handler?',
    keyCriteria: [
      'Lexical scope retention in V8 context objects',
      'Shared closure contexts between multiple inner functions',
      'Explicit scope detachment or nulling out buffer references',
    ],
    solutionPoints: [
      'Inner closures sharing the same context object will hold references to all outer variables.',
      'Explicitly setting the buffer variable to null or moving the handler to a separate function frees the memory.',
    ],
  },
  'event loops': {
    id: 'ch-event-loops-01',
    concept: 'event loops',
    type: 'trade-off',
    title: 'Microtask Queue Starvation',
    scenario:
      'A background queue worker processes incoming messages by recursively chaining `queueMicrotask()` or resolved `Promise.resolve().then(...)`. When throughput spikes, network I/O and timers stop executing.',
    question:
      'Why does recursive microtask scheduling freeze network sockets and setTimeout? What platform scheduling primitive (e.g. setImmediate) should you use instead to allow I/O interleaving?',
    keyCriteria: [
      'Microtask queue drained completely before next event loop phase',
      'Starvation of timers and poll/check phases',
      'setImmediate vs process.nextTick / microtask semantics',
    ],
    solutionPoints: [
      'The microtask queue must be completely emptied before the event loop advances to the next phase.',
      'setImmediate schedules callbacks in the Check phase, allowing the Poll phase (I/O) to process traffic.',
    ],
  },
  'rate limiting': {
    id: 'ch-rate-limiting-01',
    concept: 'rate limiting',
    type: 'trade-off',
    title: 'Sliding Window vs Token Bucket Under High Concurrency',
    scenario:
      'An API gateway protects a downstream service from burst traffic. You must choose between a Sliding Window Counter and a Token Bucket algorithm in a distributed multi-node cluster with Redis.',
    question:
      'What are the memory and concurrency trade-offs between Sliding Window Log and Token Bucket? How do you prevent race conditions between checking limits and incrementing counters?',
    keyCriteria: [
      'Sliding Window Log memory overhead (O(N) requests stored)',
      'Token bucket state efficiency (2 keys: tokens, lastTimestamp)',
      'Atomic execution using Redis Lua scripts or MULTI/EXEC',
    ],
    solutionPoints: [
      'Sliding window log requires storing timestamps for every request, consuming excessive memory.',
      'Token bucket requires only token count and timestamp, executed atomically via Redis Lua scripts.',
    ],
  },
  'async/await': {
    id: 'ch-async-01',
    concept: 'async/await',
    type: 'debug-scenario',
    title: 'Error Suppression in Promise Combinators',
    scenario:
      'A service batches 10 external requests using `Promise.all()`. If request #3 fails with a 504 Gateway Timeout, the remaining 9 requests are orphaned or their errors swallowed.',
    question:
      'How does `Promise.all()` handle partial failures versus `Promise.allSettled()`? When is fail-fast desirable versus collecting all results?',
    keyCriteria: [
      'Promise.all rejects immediately on first rejection (fail-fast)',
      'Promise.allSettled waits for all outcomes (settled state array)',
      'Resource cleanup for outstanding in-flight requests using AbortController',
    ],
    solutionPoints: [
      'Promise.all rejects immediately upon the first failure, but still allows pending promises to run to completion.',
      'Use Promise.allSettled to inspect every result, combined with AbortController to cancel remaining requests.',
    ],
  },
};

export class ChallengeGenerator {
  public static generateForConcept(conceptName: string): Challenge {
    const key = conceptName.trim().toLowerCase();
    if (CURATED_CHALLENGES[key]) {
      return CURATED_CHALLENGES[key];
    }

    // Dynamic challenge generation for any concept
    return {
      id: `ch-dyn-${Date.now()}`,
      concept: conceptName.trim(),
      type: 'trade-off',
      title: `Architectural Trade-offs in ${conceptName}`,
      scenario: `You are architecting a mission-critical subsystem where ${conceptName} is a core design constraint under high load and stringent reliability requirements.`,
      question: `What are the primary performance, simplicity, and failure-mode trade-offs of applying ${conceptName}? Defend your design choices using first principles.`,
      keyCriteria: [
        'Identification of primary trade-offs (simplicity vs abstraction)',
        'Failure modes and recovery behavior',
        'Standard library or platform primitives utilization',
      ],
      solutionPoints: [
        'Address edge cases, state lifecycles, and operational overhead.',
        'Choose concrete implementations over speculative abstractions.',
      ],
    };
  }

  public static selectForGraph(graph: KnowledgeGraph): Challenge {
    const practicing = graph.getByMastery('practicing');
    if (practicing.length > 0) {
      // Pick concept with lowest practice count
      practicing.sort((a, b) => a.practiceCount - b.practiceCount);
      return this.generateForConcept(practicing[0].name);
    }

    const introduced = graph.getByMastery('introduced');
    if (introduced.length > 0) {
      return this.generateForConcept(introduced[0].name);
    }

    // Default to curated closures challenge
    return CURATED_CHALLENGES['closures'];
  }

  public static formatCard(challenge: Challenge): string {
    const header = AsciiBox.create(
      [
        `Concept: ${challenge.concept}`,
        `Type:    ${challenge.type.toUpperCase()}`,
        `Title:   ${challenge.title}`,
      ],
      { title: 'SOCRATIC ENGINEERING CHALLENGE', style: 'double', minWidth: 62 }
    );

    const lines: string[] = [
      header,
      '',
      '### Scenario:',
      challenge.scenario,
      '',
      '### Challenge Question:',
      challenge.question,
      '',
      'Respond with your proposed architectural solution and trade-off defense.',
    ];

    return lines.join('\n');
  }
}
