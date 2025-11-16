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
 * Example Library Types
 *
 * This module defines all types for the Example Library feature, which provides
 * a searchable collection of real-world use cases that users can discover, run,
 * and adapt for their own needs.
 *
 * @module examples/types
 */

/**
 * Difficulty level for examples
 */
export type ExampleDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Category of example
 */
export type ExampleCategory =
  | 'code-understanding'
  | 'development'
  | 'file-operations'
  | 'data-analysis'
  | 'automation'
  | 'documentation';

/**
 * Resource links for examples
 */
export interface ExampleResource {
  /** Type of resource */
  type: 'doc' | 'example' | 'video' | 'tutorial';
  /** Display title */
  title: string;
  /** URL or path to resource */
  url: string;
}

/**
 * Complete example definition
 *
 * An example represents a complete, executable use case that demonstrates
 * how to accomplish a specific task with Gemini CLI.
 *
 * @example
 * ```typescript
 * const example: Example = {
 *   id: 'rename-photos-by-content',
 *   title: 'Rename Photos Based on AI-Detected Content',
 *   description: 'Automatically rename photos based on what Gemini sees',
 *   category: 'file-operations',
 *   tags: ['images', 'multimodal', 'batch-processing'],
 *   difficulty: 'beginner',
 *   estimatedTime: '2-5 minutes',
 *   requiredTools: ['read_files', 'write_files'],
 *   requiredPermissions: ['file-write'],
 *   examplePrompt: 'Look at all images in ./photos/ and rename them...',
 *   expectedOutcome: 'Photos renamed with descriptive AI-generated names',
 *   tips: ['Review suggested names before confirming'],
 *   relatedExamples: ['batch-image-resize'],
 *   documentationLinks: ['/docs/tools/file-system.md']
 * };
 * ```
 */
export interface Example {
  /** Unique identifier for the example */
  id: string;

  /** Short, descriptive title */
  title: string;

  /** Detailed description of what the example does */
  description: string;

  /** Primary category */
  category: ExampleCategory;

  /** Tags for filtering and search */
  tags: string[];

  /** Difficulty level */
  difficulty: ExampleDifficulty;

  /** Estimated time to complete */
  estimatedTime: string;

  /** Tools required from Gemini CLI */
  requiredTools: string[];

  /** Permissions needed (e.g., 'file-write', 'shell-execute') */
  requiredPermissions: string[];

  /** The actual prompt to run */
  examplePrompt: string;

  /** What the user should expect to happen */
  expectedOutcome: string;

  /** Helpful tips for users */
  tips: string[];

  /** IDs of related examples */
  relatedExamples: string[];

  /** Links to relevant documentation */
  documentationLinks: string[];

  /** Optional resources */
  resources?: ExampleResource[];

  /** Whether this is a featured example */
  featured?: boolean;

  /** Context files to include (for @ syntax) */
  contextFiles?: string[];

  /** Optional prerequisites to run example */
  prerequisites?: string[];
}

/**
 * Search query for finding examples
 */
export interface ExampleSearchQuery {
  /** Full-text search query */
  text?: string;

  /** Filter by category */
  category?: ExampleCategory;

  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by difficulty */
  difficulty?: ExampleDifficulty;

  /** Filter by required tools */
  tools?: string[];

  /** Only show featured examples */
  featuredOnly?: boolean;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Result from running an example
 */
export interface ExampleResult {
  /** The example that was run */
  example: Example;

  /** Whether execution was successful */
  success: boolean;

  /** Output from execution */
  output?: string;

  /** Error message if failed */
  error?: string;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Files modified during execution */
  filesModified?: string[];
}

/**
 * Statistics about example usage
 */
export interface ExampleStats {
  /** Total number of examples */
  total: number;

  /** Examples by category */
  byCategory: Record<ExampleCategory, number>;

  /** Examples by difficulty */
  byDifficulty: Record<ExampleDifficulty, number>;

  /** Most popular examples (by run count) */
  mostPopular: Array<{
    exampleId: string;
    runCount: number;
  }>;

  /** Recently added examples */
  recentlyAdded: string[];
}

/**
 * User's interaction with an example
 */
export interface ExampleInteraction {
  /** Example ID */
  exampleId: string;

  /** When it was run */
  timestamp: Date;

  /** Whether it succeeded */
  success: boolean;

  /** User's rating (1-5) */
  rating?: number;

  /** User's notes */
  notes?: string;

  /** Whether user saved it as custom command */
  savedAsCommand?: boolean;
}
