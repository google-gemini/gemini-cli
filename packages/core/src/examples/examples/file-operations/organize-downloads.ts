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
 * Example: Organize Downloads Folder
 *
 * This example shows how to automatically organize files in a downloads
 * folder into categorized subdirectories.
 */
const example: Example = {
  id: 'organize-downloads',
  title: 'Organize Downloads Folder by File Type',
  description:
    'Automatically sort and organize files in your downloads folder into categorized subdirectories',
  category: 'file-operations',
  tags: ['organization', 'automation', 'cleanup', 'file-management'],
  difficulty: 'beginner',
  estimatedTime: '5-10 minutes',
  requiredTools: ['list_directory', 'move_files', 'create_directory'],
  requiredPermissions: ['directory-read', 'directory-write', 'file-move'],
  examplePrompt: `Organize my ~/Downloads folder by file type:

1. **Analyze Files**: List all files and their types
2. **Create Categories**: Create folders for Documents, Images, Videos, Audio, Archives, Code, etc.
3. **Move Files**: Move files into appropriate category folders
4. **Handle Duplicates**: If files already exist in destination, rename with number suffix
5. **Report**: Show what was moved where

Keep the folder structure clean and logical.`,
  expectedOutcome:
    'Organized downloads folder with files sorted into category subdirectories',
  tips: [
    'Review the organization plan before confirming moves',
    'Can customize categories to your needs',
    'Ask to preserve file creation dates',
    'Works with any directory, not just Downloads',
  ],
  relatedExamples: [
    'batch-rename',
    'deduplicate-files',
    'rename-photos',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/file-organization.md',
  ],
  prerequisites: [
    'Navigate to the directory you want to organize (e.g., cd ~/Downloads)',
  ],
  featured: true,
};

export default example;
