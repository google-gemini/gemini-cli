/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IntentType } from './MentorPolicy.js';

export class IntentClassifier {
  public static classify(input: string): IntentType {
    const trimmed = input.trim().toLowerCase();

    // Check explicit command prefixes
    if (trimmed.startsWith('/learn')) return 'learn';
    if (trimmed.startsWith('/solve')) return 'solve';
    if (trimmed.startsWith('/debug')) return 'debug';
    if (trimmed.startsWith('/review')) return 'review';
    if (trimmed.startsWith('/explain')) return 'explain';
    if (trimmed.startsWith('/hint')) return 'hint';
    if (trimmed.startsWith('/ponytail') || trimmed.startsWith('/simplify')) return 'ponytail';
    if (trimmed.startsWith('/archify') || trimmed.startsWith('/diagram')) return 'archify';

    // Heuristics for Archify visual reasoning & diagrams
    if (
      trimmed.includes('draw a diagram') ||
      trimmed.includes('visualize the architecture') ||
      trimmed.includes('visualize the flow') ||
      trimmed.includes('system topology') ||
      trimmed.includes('ascii diagram') ||
      trimmed.includes('architecture diagram') ||
      trimmed.includes('show the data flow') ||
      trimmed.startsWith('diagram ')
    ) {
      return 'archify';
    }

    // Heuristics for Ponytail minimalism & code simplification
    if (
      trimmed.includes('simplify') ||
      trimmed.includes('minimalist') ||
      trimmed.includes('delete code') ||
      trimmed.includes('remove unused') ||
      trimmed.includes('prune') ||
      trimmed.includes('remove dependency') ||
      trimmed.includes('replace with standard library') ||
      trimmed.includes('stdlib alternative') ||
      trimmed.includes('reduce complexity') ||
      trimmed.startsWith('what can i delete') ||
      trimmed.startsWith('can we delete')
    ) {
      return 'ponytail';
    }

    // Heuristics for debugging
    if (
      trimmed.includes('error') ||
      trimmed.includes('exception') ||
      trimmed.includes('crash') ||
      trimmed.includes('failing') ||
      trimmed.includes('fails') ||
      trimmed.includes('traceback') ||
      trimmed.includes('bug') ||
      trimmed.includes('why is this breaking') ||
      trimmed.includes('stack trace')
    ) {
      return 'debug';
    }

    // Heuristics for learning
    if (
      trimmed.startsWith('teach me') ||
      trimmed.startsWith('learn about') ||
      trimmed.includes('explain the concept') ||
      trimmed.includes('what is the concept of')
    ) {
      return 'learn';
    }

    // Heuristics for code review
    if (
      trimmed.startsWith('review') ||
      trimmed.includes('code review') ||
      trimmed.includes('critique') ||
      trimmed.includes('find potential problems') ||
      trimmed.includes('security audit')
    ) {
      return 'review';
    }

    // Heuristics for problem solving & architecture design
    if (
      trimmed.startsWith('how do i build') ||
      trimmed.startsWith('how can i implement') ||
      trimmed.startsWith('design a') ||
      trimmed.startsWith('architect a') ||
      trimmed.includes('how should i implement') ||
      trimmed.includes('what should i work on next')
    ) {
      return 'solve';
    }

    // Heuristics for explanation
    if (
      trimmed.startsWith('explain') ||
      trimmed.includes('what does this project do') ||
      trimmed.includes('how does this work') ||
      trimmed.startsWith('where does') ||
      trimmed.startsWith('trace what happens') ||
      trimmed.includes('why is')
    ) {
      return 'explain';
    }

    return 'default';
  }
}
