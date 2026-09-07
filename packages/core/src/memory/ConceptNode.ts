/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type MasteryLevel = 'introduced' | 'practicing' | 'mastered';

export type ConceptCategory =
  | 'architecture'
  | 'language'
  | 'concurrency'
  | 'testing'
  | 'security'
  | 'data-structures'
  | 'general';

export interface ConceptNode {
  name: string;
  category: ConceptCategory;
  mastery: MasteryLevel;
  firstSeenAt: number;
  lastPracticedAt: number;
  practiceCount: number;
  notes?: string;
  relatedConcepts?: string[];
}
