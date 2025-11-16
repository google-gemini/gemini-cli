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
 * Example: Batch Rename Files
 *
 * This example shows how to rename multiple files at once
 * using intelligent pattern matching and replacement.
 */
const example: Example = {
  id: 'batch-rename',
  title: 'Batch Rename Files with Patterns',
  description:
    'Rename multiple files at once using pattern matching, sequential numbering, or intelligent naming',
  category: 'file-operations',
  tags: ['rename', 'batch', 'organization', 'pattern-matching'],
  difficulty: 'beginner',
  estimatedTime: '5-10 minutes',
  requiredTools: ['list_directory', 'rename_files'],
  requiredPermissions: ['directory-read', 'file-rename'],
  examplePrompt: `Help me batch rename files in the current directory:

Current pattern: IMG_####.jpg
Desired pattern: vacation-2024-####.jpg

1. **List Files**: Show all files matching the pattern
2. **Preview Changes**: Show what each file will be renamed to
3. **Check for Conflicts**: Ensure no naming conflicts
4. **Sequential Numbers**: Preserve or reset numbering
5. **Execute Rename**: Rename files after confirmation

Make the renaming predictable and reversible if needed.`,
  expectedOutcome:
    'Files renamed according to the specified pattern with clear before/after preview',
  tips: [
    'Always preview changes before confirming',
    'Can use date/time patterns from file metadata',
    'Ask for case conversion (lowercase, uppercase, title case)',
    'Useful for organizing photos, documents, and downloads',
  ],
  relatedExamples: [
    'rename-photos',
    'organize-downloads',
    'deduplicate-files',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/file-renaming.md',
  ],
  prerequisites: [
    'Navigate to the directory containing files to rename',
  ],
  featured: false,
};

export default example;
