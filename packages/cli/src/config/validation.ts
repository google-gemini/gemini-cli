/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ValidTag {
  DESIGN = 'design',
  DATABASES = 'databases',
  CLOUD = 'cloud',
  SERVICES = 'services',
  DEVOPS = 'devops',
  UTILITIES = 'utilities',
}

export function validateTags(tags: string[]): boolean {
  if (!tags) {
    return true;
  }
  const validTags = Object.values(ValidTag);
  return tags.every((tag) => validTags.includes(tag as ValidTag));
}
