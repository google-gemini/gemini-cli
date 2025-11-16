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
 * Example: Explain Repository Architecture
 *
 * This example shows users how to get a high-level overview
 * of a codebase's architecture and organization.
 */
const example: Example = {
  id: 'explain-codebase-architecture',
  title: 'Explain Repository Architecture',
  description:
    'Get a high-level overview of how a codebase is organized, including main components, data flow, and entry points',
  category: 'code-understanding',
  tags: ['learning', 'documentation', 'architecture', 'onboarding'],
  difficulty: 'beginner',
  estimatedTime: '3-5 minutes',
  requiredTools: ['read_files', 'list_directory'],
  requiredPermissions: ['directory-read'],
  examplePrompt: `Analyze this repository structure and explain:
1. Overall architecture and patterns used
2. Main components and their purposes
3. How data flows through the system
4. Entry points for new developers
5. Key directories and what they contain

Focus on giving me a mental model I can use to navigate this codebase.`,
  expectedOutcome:
    'Comprehensive architecture overview with component descriptions and navigation guidance',
  tips: [
    'Works best when run from project root directory',
    'Include @README.md for additional context if available',
    'Ask follow-up questions for deeper understanding of specific components',
    'Great for onboarding to a new codebase',
  ],
  relatedExamples: [
    'find-entry-points',
    'understand-data-flow',
    'explain-component',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/get-started/examples.md',
  ],
  prerequisites: [
    'Navigate to the root directory of the project you want to understand',
  ],
  featured: true,
};

export default example;
