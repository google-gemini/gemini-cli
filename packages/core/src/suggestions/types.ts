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

/**
 * Smart Suggestions Type Definitions
 *
 * Context-aware command suggestions and autocomplete system
 *
 * @module suggestions/types
 */

/**
 * Context information for generating suggestions
 */
export interface SuggestionContext {
  /** Current working directory */
  cwd: string;
  /** Git repository status */
  git?: GitContext;
  /** Project type (if detectable) */
  projectType?: ProjectType;
  /** Recent files accessed */
  recentFiles: string[];
  /** User's input so far */
  partialInput?: string;
  /** Command history */
  recentCommands?: string[];
  /** Current conversation context */
  conversationContext?: string;
}

/**
 * Git context information
 */
export interface GitContext {
  /** Is this a git repository? */
  isRepo: boolean;
  /** Current branch name */
  branch?: string;
  /** Has uncommitted changes? */
  hasChanges?: boolean;
  /** Number of untracked files */
  untrackedFiles?: number;
  /** Has conflicts? */
  hasConflicts?: boolean;
}

/**
 * Detected project type
 */
export type ProjectType =
  | 'nodejs'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'typescript'
  | 'react'
  | 'vue'
  | 'angular'
  | 'unknown';

/**
 * A single suggestion
 */
export interface Suggestion {
  /** Unique identifier */
  id: string;
  /** The suggested command or text */
  text: string;
  /** Human-readable description */
  description: string;
  /** Category of suggestion */
  category: SuggestionCategory;
  /** Relevance score (0-1) */
  score: number;
  /** Reason for this suggestion */
  reason?: string;
  /** Example usage */
  example?: string;
  /** Source that generated this suggestion */
  source: SuggestionSource;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Category of suggestion
 */
export type SuggestionCategory =
  | 'command' // Slash command
  | 'prompt' // Prompt template
  | 'file' // File path
  | 'workflow' // Workflow suggestion
  | 'example' // Example from library
  | 'contextual'; // Context-specific suggestion

/**
 * Source that generated the suggestion
 */
export type SuggestionSource =
  | 'git-detector'
  | 'project-detector'
  | 'file-detector'
  | 'history-analyzer'
  | 'pattern-matcher'
  | 'autocomplete'
  | 'manual';

/**
 * Suggestion rule for pattern matching
 */
export interface SuggestionRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Priority (higher = more important) */
  priority: number;
  /** Condition to check */
  condition: (context: SuggestionContext) => boolean;
  /** Generate suggestions if condition met */
  generate: (context: SuggestionContext) => Suggestion[];
  /** Is this rule enabled? */
  enabled: boolean;
}

/**
 * Autocomplete result
 */
export interface AutocompleteResult {
  /** Matched suggestions */
  suggestions: Suggestion[];
  /** Completion prefix */
  prefix: string;
  /** Completion suffix */
  suffix?: string;
  /** Total matches found */
  totalMatches: number;
}

/**
 * Suggestion feedback
 */
export interface SuggestionFeedback {
  /** Suggestion ID */
  suggestionId: string;
  /** Was it accepted? */
  accepted: boolean;
  /** Was it dismissed? */
  dismissed?: boolean;
  /** User rating (1-5) */
  rating?: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Suggestion preferences
 */
export interface SuggestionPreferences {
  /** Enable suggestions? */
  enabled: boolean;
  /** Enable autocomplete? */
  autocompleteEnabled: boolean;
  /** Minimum score threshold (0-1) */
  minScore: number;
  /** Maximum suggestions to show */
  maxSuggestions: number;
  /** Show inline suggestions? */
  showInline: boolean;
  /** Enabled categories */
  enabledCategories: SuggestionCategory[];
  /** Enabled sources */
  enabledSources: SuggestionSource[];
}

/**
 * Suggestion statistics
 */
export interface SuggestionStats {
  /** Total suggestions generated */
  totalGenerated: number;
  /** Total accepted */
  totalAccepted: number;
  /** Total dismissed */
  totalDismissed: number;
  /** Acceptance rate */
  acceptanceRate: number;
  /** By category */
  byCategory: Record<SuggestionCategory, number>;
  /** By source */
  bySource: Record<SuggestionSource, number>;
  /** Average score */
  avgScore: number;
}
