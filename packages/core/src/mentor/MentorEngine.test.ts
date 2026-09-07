/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { IntentClassifier } from './IntentClassifier.js';
import { MentorEngine } from './MentorEngine.js';
import { HintPolicy } from './policies/HintPolicy.js';

describe('IntentClassifier', () => {
  it('classifies explicit commands', () => {
    expect(IntentClassifier.classify('/learn closures')).toBe('learn');
    expect(IntentClassifier.classify('/solve architecture')).toBe('solve');
    expect(IntentClassifier.classify('/debug TypeError')).toBe('debug');
    expect(IntentClassifier.classify('/review index.ts')).toBe('review');
    expect(IntentClassifier.classify('/explain flow')).toBe('explain');
    expect(IntentClassifier.classify('/hint')).toBe('hint');
    expect(IntentClassifier.classify('/ponytail src/app.ts')).toBe('ponytail');
    expect(IntentClassifier.classify('/simplify')).toBe('ponytail');
    expect(IntentClassifier.classify('/archify')).toBe('archify');
    expect(IntentClassifier.classify('/diagram auth')).toBe('archify');
    expect(IntentClassifier.classify('/challenge')).toBe('challenge');
    expect(IntentClassifier.classify('/quiz closures')).toBe('challenge');
  });

  it('classifies natural language heuristics', () => {
    expect(IntentClassifier.classify('why is this breaking with null pointer error?')).toBe('debug');
    expect(IntentClassifier.classify('teach me about async event loops')).toBe('learn');
    expect(IntentClassifier.classify('how do I build a rate limiter?')).toBe('solve');
    expect(IntentClassifier.classify('review my database connection logic')).toBe('review');
    expect(IntentClassifier.classify('what does this project do?')).toBe('explain');
    expect(IntentClassifier.classify('where does authentication happen?')).toBe('explain');
    expect(IntentClassifier.classify('how can I simplify this architecture?')).toBe('ponytail');
    expect(IntentClassifier.classify('what can I delete here?')).toBe('ponytail');
    expect(IntentClassifier.classify('draw a diagram of the auth flow')).toBe('archify');
    expect(IntentClassifier.classify('visualize the architecture')).toBe('archify');
    expect(IntentClassifier.classify('quiz me on rate limiting')).toBe('challenge');
    expect(IntentClassifier.classify('give me a challenge on event loops')).toBe('challenge');
  });
});

describe('MentorEngine', () => {
  it('evaluates prompt and sets active policy', () => {
    const mentor = new MentorEngine();
    const policy = mentor.evaluatePrompt('why is this crashing with an exception?');
    expect(policy.intent).toBe('debug');
    expect(mentor.getActivePolicy().intent).toBe('debug');
    expect(policy.getDirectives()).toContain('ROOT-CAUSE DEBUGGING');
  });

  it('advances hints progressively across calls', () => {
    const mentor = new MentorEngine();

    const hint1 = mentor.evaluatePrompt('/hint');
    expect(hint1.intent).toBe('hint');
    expect((hint1 as HintPolicy).getLevel()).toBe(1);
    expect(hint1.getDirectives()).toContain('LEVEL 1 (CONCEPTUAL)');

    const hint2 = mentor.evaluatePrompt('/hint');
    expect((hint2 as HintPolicy).getLevel()).toBe(2);
    expect(hint2.getDirectives()).toContain('LEVEL 2 (DIRECTIONAL)');

    const hint3 = mentor.evaluatePrompt('/hint');
    expect((hint3 as HintPolicy).getLevel()).toBe(3);
    expect(hint3.getDirectives()).toContain('LEVEL 3 (TARGETED)');

    // Cycles back to 1
    const hint4 = mentor.evaluatePrompt('/hint');
    expect((hint4 as HintPolicy).getLevel()).toBe(1);
  });

  it('registers and evaluates PonytailPolicy', () => {
    const mentor = new MentorEngine();
    const policy = mentor.evaluatePrompt('/ponytail src/app.ts');
    expect(policy.intent).toBe('ponytail');
    expect(policy.name).toBe('Ponytail Minimalist Philosopher');
    expect(policy.getDirectives()).toContain('CODE DELETION OVER ADDITION');
  });

  it('registers and evaluates ArchifyPolicy', () => {
    const mentor = new MentorEngine();
    const policy = mentor.evaluatePrompt('/archify');
    expect(policy.intent).toBe('archify');
    expect(policy.name).toBe('Archify Visual Reasoner');
    expect(policy.getDirectives()).toContain('THINK SPATIALLY & ARCHITECTURALLY');
  });

  it('registers and evaluates ChallengePolicy', () => {
    const mentor = new MentorEngine();
    const policy = mentor.evaluatePrompt('/challenge closures');
    expect(policy.intent).toBe('challenge');
    expect(policy.name).toBe('Socratic Challenge Evaluator');
    expect(policy.getDirectives()).toContain('RIGOROUS FIRST-PRINCIPLES SCRUTINY');
  });
});
