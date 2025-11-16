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
 * Example Registry
 *
 * Central registry for all examples. Provides CRUD operations, search,
 * filtering, and statistics.
 *
 * @module examples/registry
 */

import type {
  Example,
  ExampleSearchQuery,
  ExampleStats,
  ExampleCategory,
  ExampleDifficulty,
} from './types.js';

/**
 * Example Registry Class
 *
 * Manages the collection of all examples, providing search, filter,
 * and retrieval capabilities.
 *
 * @example
 * ```typescript
 * const registry = new ExampleRegistry();
 * await registry.initialize();
 *
 * // Search for examples
 * const results = registry.search({ text: 'git', difficulty: 'beginner' });
 *
 * // Get a specific example
 * const example = registry.get('generate-commit-message');
 *
 * // Get statistics
 * const stats = registry.getStats();
 * ```
 */
export class ExampleRegistry {
  private examples: Map<string, Example> = new Map();
  private initialized = false;

  /**
   * Initialize the registry by loading all examples
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load built-in examples
    await this.loadBuiltInExamples();

    this.initialized = true;
  }

  /**
   * Get a specific example by ID
   *
   * @param id - Example ID
   * @returns The example, or undefined if not found
   */
  get(id: string): Example | undefined {
    return this.examples.get(id);
  }

  /**
   * Get all examples
   *
   * @returns Array of all examples
   */
  getAll(): Example[] {
    return Array.from(this.examples.values());
  }

  /**
   * Search for examples
   *
   * @param query - Search query with filters
   * @returns Matching examples
   */
  search(query: ExampleSearchQuery = {}): Example[] {
    let results = this.getAll();

    // Filter by text (search in title, description, tags)
    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(
        (ex) =>
          ex.title.toLowerCase().includes(searchText) ||
          ex.description.toLowerCase().includes(searchText) ||
          ex.tags.some((tag) => tag.toLowerCase().includes(searchText)),
      );
    }

    // Filter by category
    if (query.category) {
      results = results.filter((ex) => ex.category === query.category);
    }

    // Filter by tags (any match)
    if (query.tags && query.tags.length > 0) {
      results = results.filter((ex) =>
        query.tags!.some((tag) => ex.tags.includes(tag)),
      );
    }

    // Filter by difficulty
    if (query.difficulty) {
      results = results.filter((ex) => ex.difficulty === query.difficulty);
    }

    // Filter by tools
    if (query.tools && query.tools.length > 0) {
      results = results.filter((ex) =>
        query.tools!.some((tool) => ex.requiredTools.includes(tool)),
      );
    }

    // Filter featured only
    if (query.featuredOnly) {
      results = results.filter((ex) => ex.featured === true);
    }

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Get examples by category
   *
   * @param category - Category to filter by
   * @returns Examples in that category
   */
  getByCategory(category: ExampleCategory): Example[] {
    return this.search({ category });
  }

  /**
   * Get featured examples
   *
   * @returns Featured examples
   */
  getFeatured(): Example[] {
    return this.search({ featuredOnly: true });
  }

  /**
   * Get a random example
   *
   * @returns Random example
   */
  getRandom(): Example | undefined {
    const all = this.getAll();
    if (all.length === 0) return undefined;
    const randomIndex = Math.floor(Math.random() * all.length);
    return all[randomIndex];
  }

  /**
   * Get statistics about examples
   *
   * @returns Statistics
   */
  getStats(): ExampleStats {
    const all = this.getAll();

    const byCategory: Record<ExampleCategory, number> = {
      'code-understanding': 0,
      development: 0,
      'file-operations': 0,
      'data-analysis': 0,
      automation: 0,
      documentation: 0,
    };

    const byDifficulty: Record<ExampleDifficulty, number> = {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
    };

    for (const example of all) {
      byCategory[example.category]++;
      byDifficulty[example.difficulty]++;
    }

    return {
      total: all.length,
      byCategory,
      byDifficulty,
      mostPopular: [], // TODO: Track usage
      recentlyAdded: [], // TODO: Track addition dates
    };
  }

  /**
   * Register a new example
   *
   * @param example - Example to register
   */
  register(example: Example): void {
    this.examples.set(example.id, example);
  }

  /**
   * Unregister an example
   *
   * @param id - Example ID to remove
   */
  unregister(id: string): void {
    this.examples.delete(id);
  }

  /**
   * Load built-in examples
   * This imports all examples from the centralized BUILT_IN_EXAMPLES array
   */
  private async loadBuiltInExamples(): Promise<void> {
    // Import the BUILT_IN_EXAMPLES array from the centralized index
    const { BUILT_IN_EXAMPLES } = await import('./examples/index.js');

    // Register all examples from the array
    for (const example of BUILT_IN_EXAMPLES) {
      this.register(example);
    }
  }
}

// Singleton instance
let registryInstance: ExampleRegistry | null = null;

/**
 * Get the global example registry instance
 *
 * @returns The singleton registry instance
 */
export async function getExampleRegistry(): Promise<ExampleRegistry> {
  if (!registryInstance) {
    registryInstance = new ExampleRegistry();
    await registryInstance.initialize();
  }
  return registryInstance;
}

/**
 * Reset the registry (mainly for testing)
 */
export function resetExampleRegistry(): void {
  registryInstance = null;
}
