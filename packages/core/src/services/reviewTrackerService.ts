/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/**
 * Service to track resources (files, directories, images) that the agent has
 * actually reviewed or witnessed via tool calls. This helps prevent the agent
 * from hallucinating that it has seen a resource that it hasn't.
 */
export class ReviewTrackerService {
  private readonly reviewedResources = new Set<string>();

  /**
   * Records that a resource has been reviewed.
   * Paths are normalized to ensure consistent tracking.
   * @param resourcePath The absolute or relative path to the resource.
   */
  recordReview(resourcePath: string): void {
    if (!resourcePath) return;
    const normalized = path.normalize(resourcePath);
    this.reviewedResources.add(normalized);
  }

  /**
   * Returns a list of all resources reviewed so far, sorted for deterministic output.
   */
  getReviewedResources(): string[] {
    return Array.from(this.reviewedResources).sort();
  }

  /**
   * Resets the tracker (useful for new sessions/prompts if desired).
   */
  reset(): void {
    this.reviewedResources.clear();
  }
}
