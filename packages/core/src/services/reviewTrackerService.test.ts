/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewTrackerService } from './reviewTrackerService.js';

describe('ReviewTrackerService', () => {
  let service: ReviewTrackerService;

  beforeEach(() => {
    service = new ReviewTrackerService();
  });

  it('should start with an empty list', () => {
    expect(service.getReviewedResources()).toEqual([]);
  });

  it('should record and normalize paths', () => {
    service.recordReview('src/foo/../foo/bar.ts');
    expect(service.getReviewedResources()).toEqual(['src/foo/bar.ts']);
  });

  it('should handle multiple resources and sort them', () => {
    service.recordReview('z.ts');
    service.recordReview('a.ts');
    service.recordReview('m.ts');
    expect(service.getReviewedResources()).toEqual(['a.ts', 'm.ts', 'z.ts']);
  });

  it('should not record duplicates', () => {
    service.recordReview('file.ts');
    service.recordReview('./file.ts');
    expect(service.getReviewedResources()).toEqual(['file.ts']);
  });

  it('should ignore empty paths', () => {
    service.recordReview('');
    expect(service.getReviewedResources()).toEqual([]);
  });

  it('should reset', () => {
    service.recordReview('a.ts');
    service.reset();
    expect(service.getReviewedResources()).toEqual([]);
  });
});
