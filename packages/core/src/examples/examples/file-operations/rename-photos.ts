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

const example: Example = {
  id: 'rename-photos-by-content',
  title: 'Rename Photos Based on AI-Detected Content',
  description:
    'Automatically rename photos in a directory based on what Gemini sees in them',
  category: 'file-operations',
  tags: ['images', 'multimodal', 'batch-processing', 'automation'],
  difficulty: 'beginner',
  estimatedTime: '2-5 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-write'],
  examplePrompt: `Look at all images in ./photos/ and rename them based on what you see.
Use descriptive names like 'beach-sunset.jpg' or 'mountain-hike.jpg'.
Keep original file extensions. Show me the list of renames before applying.`,
  expectedOutcome: 'Photos renamed with descriptive AI-generated names',
  tips: [
    'Review suggested names before confirming',
    'Works best with JPG and PNG formats',
    'Can process 50+ images in one run',
    'Creates backup list of original names',
  ],
  relatedExamples: ['batch-image-resize', 'extract-text-from-images'],
  documentationLinks: ['/docs/tools/file-system.md'],
  featured: true,
};

export default example;
