/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  Suggestion,
  SuggestionContext,
  SuggestionRule,
  SuggestionPreferences,
  SuggestionFeedback,
  SuggestionStats,
} from './types.js';
import { DEFAULT_RULES } from './rules.js';

const DEFAULT_PREFERENCES: SuggestionPreferences = {
  enabled: true,
  autocompleteEnabled: true,
  minScore: 0.3,
  maxSuggestions: 5,
  showInline: true,
  enabledCategories: ['command', 'prompt', 'file', 'workflow', 'example', 'contextual'],
  enabledSources: ['git-detector', 'project-detector', 'file-detector', 'history-analyzer', 'pattern-matcher', 'autocomplete', 'manual'],
};

export class SuggestionEngine {
  private rules: SuggestionRule[] = [];
  private preferences: SuggestionPreferences = DEFAULT_PREFERENCES;
  private feedback: SuggestionFeedback[] = [];

  constructor(preferences?: Partial<SuggestionPreferences>) {
    this.rules = [...DEFAULT_RULES];
    if (preferences) {
      this.preferences = { ...DEFAULT_PREFERENCES, ...preferences };
    }
  }

  async generateSuggestions(context: SuggestionContext): Promise<Suggestion[]> {
    if (!this.preferences.enabled) {
      return [];
    }

    const suggestions: Suggestion[] = [];

    for (const rule of this.rules.filter((r) => r.enabled)) {
      try {
        if (rule.condition(context)) {
          const ruleSuggestions = rule.generate(context);
          suggestions.push(...ruleSuggestions);
        }
      } catch (error) {
        console.error(`Error in suggestion rule ${rule.id}:`, error);
      }
    }

    return this.rankAndFilter(suggestions);
  }

  private rankAndFilter(suggestions: Suggestion[]): Suggestion[] {
    return suggestions
      .filter((s) => s.score >= this.preferences.minScore)
      .filter((s) => this.preferences.enabledCategories.includes(s.category))
      .filter((s) => this.preferences.enabledSources.includes(s.source))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.preferences.maxSuggestions);
  }

  recordFeedback(feedback: SuggestionFeedback): void {
    this.feedback.push(feedback);
  }

  getStats(): SuggestionStats {
    const total = this.feedback.length;
    const accepted = this.feedback.filter((f) => f.accepted).length;
    const dismissed = this.feedback.filter((f) => f.dismissed).length;

    return {
      totalGenerated: total,
      totalAccepted: accepted,
      totalDismissed: dismissed,
      acceptanceRate: total > 0 ? accepted / total : 0,
      byCategory: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      avgScore: 0,
    };
  }

  addRule(rule: SuggestionRule): void {
    this.rules.push(rule);
  }

  setPreferences(preferences: Partial<SuggestionPreferences>): void {
    this.preferences = { ...this.preferences, ...preferences };
  }

  getPreferences(): SuggestionPreferences {
    return { ...this.preferences };
  }
}

let engineInstance: SuggestionEngine | null = null;

export function getSuggestionEngine(): SuggestionEngine {
  if (!engineInstance) {
    engineInstance = new SuggestionEngine();
  }
  return engineInstance;
}

export function resetSuggestionEngine(): void {
  engineInstance = null;
}
