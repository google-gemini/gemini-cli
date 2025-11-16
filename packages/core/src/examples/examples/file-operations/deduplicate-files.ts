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

import type { Example } from '../../types.js';

/**
 * Example: Find and Remove Duplicate Files
 *
 * This example demonstrates how to identify duplicate files
 * and remove them to save disk space.
 */
const example: Example = {
  id: 'deduplicate-files',
  title: 'Find and Remove Duplicate Files',
  description:
    'Identify duplicate files based on content, show which are duplicates, and safely remove them',
  category: 'file-operations',
  tags: ['cleanup', 'duplicates', 'disk-space', 'organization'],
  difficulty: 'intermediate',
  estimatedTime: '10-15 minutes',
  requiredTools: ['list_directory', 'read_files', 'delete_files'],
  requiredPermissions: ['directory-read', 'file-read', 'file-delete'],
  examplePrompt: `Find and help me remove duplicate files in the current directory:

1. **Scan Directory**: Recursively scan for all files
2. **Identify Duplicates**: Group files by content (not just name)
3. **Show Duplicates**: List each set of duplicates with their sizes and paths
4. **Recommend Keeping**: Suggest which version to keep (shortest path, newest, etc.)
5. **Calculate Savings**: Show how much disk space will be freed
6. **Safe Removal**: Delete duplicates after confirmation

Be cautious and confirm before any deletions.`,
  expectedOutcome:
    'Report of duplicate files with recommendations and safe removal plan',
  tips: [
    'Start with a dry run to see what would be deleted',
    'Can choose to keep originals by path, date, or name',
    'Ask to move duplicates to trash instead of permanent delete',
    'Useful for photo libraries and download folders',
  ],
  relatedExamples: [
    'organize-downloads',
    'batch-rename',
    'rename-photos',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/file-cleanup.md',
  ],
  prerequisites: [
    'Navigate to the directory you want to deduplicate',
    'Have backup of important files before running',
  ],
  featured: false,
};

export default example;
