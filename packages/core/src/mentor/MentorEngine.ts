/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy, IntentType } from './MentorPolicy.js';
import { LearnPolicy } from './policies/LearnPolicy.js';
import { SolvePolicy } from './policies/SolvePolicy.js';
import { DebugPolicy } from './policies/DebugPolicy.js';
import { ReviewPolicy } from './policies/ReviewPolicy.js';
import { ExplainPolicy } from './policies/ExplainPolicy.js';
import { HintPolicy } from './policies/HintPolicy.js';
import { PonytailPolicy } from '../skills/ponytail/PonytailPolicy.js';
import { ArchifyPolicy } from '../skills/archify/ArchifyPolicy.js';
import { IntentClassifier } from './IntentClassifier.js';

export class MentorEngine {
  private policies = new Map<IntentType, MentorPolicy>();
  private activePolicy: MentorPolicy;
  private currentHintLevel = 1;

  constructor() {
    this.register(new LearnPolicy());
    this.register(new SolvePolicy());
    this.register(new DebugPolicy());
    this.register(new ReviewPolicy());
    this.register(new ExplainPolicy());
    this.register(new HintPolicy(1));
    this.register(new PonytailPolicy());
    this.register(new ArchifyPolicy());

    this.activePolicy = this.policies.get('explain')!;
  }

  public register(policy: MentorPolicy): void {
    this.policies.set(policy.intent, policy);
  }

  public hasPolicy(intent: string): boolean {
    return this.policies.has(intent as IntentType);
  }

  public getPolicy(intent: IntentType): MentorPolicy {
    if (intent === 'default') {
      return this.activePolicy;
    }
    const policy = this.policies.get(intent);
    if (!policy) {
      throw new Error(`Unknown policy: ${intent}`);
    }
    return policy;
  }

  public getActivePolicy(): MentorPolicy {
    return this.activePolicy;
  }

  public setActivePolicy(policy: MentorPolicy): void {
    this.activePolicy = policy;
  }

  public advanceHint(): HintPolicy {
    const hint = new HintPolicy(this.currentHintLevel);
    this.activePolicy = hint;
    this.currentHintLevel = this.currentHintLevel >= 3 ? 1 : this.currentHintLevel + 1;
    return hint;
  }

  public resetHint(): void {
    this.currentHintLevel = 1;
  }

  public evaluatePrompt(prompt: string): MentorPolicy {
    const intent = IntentClassifier.classify(prompt);
    if (intent === 'hint') {
      return this.advanceHint();
    }
    if (intent === 'default') {
      return this.activePolicy;
    }
    const policy = this.policies.get(intent) ?? this.activePolicy;
    this.activePolicy = policy;
    return policy;
  }
}
