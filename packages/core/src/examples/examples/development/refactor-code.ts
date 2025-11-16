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
 * Example: Refactor Code
 *
 * This example demonstrates how to get AI assistance with code refactoring
 * to improve structure, readability, and maintainability.
 */
const example: Example = {
  id: 'refactor-code',
  title: 'Refactor Code for Better Structure',
  description:
    'Get intelligent refactoring suggestions to improve code organization, reduce complexity, and enhance maintainability',
  category: 'development',
  tags: ['refactoring', 'clean-code', 'improvement', 'maintainability'],
  difficulty: 'intermediate',
  estimatedTime: '10-15 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-read', 'file-write'],
  examplePrompt: `Refactor @src/utils/data-processor.ts to improve its structure:

1. **Identify Code Smells**: Point out long functions, duplicated code, complex conditionals
2. **Suggest Decomposition**: Break down large functions into smaller, focused ones
3. **Improve Naming**: Recommend better variable and function names
4. **Extract Patterns**: Identify common patterns that could be abstracted
5. **Simplify Logic**: Simplify complex conditional logic
6. **Implement Changes**: Provide the refactored code

Maintain all existing functionality while improving structure.`,
  expectedOutcome:
    'Refactored code with improved structure, better naming, and enhanced readability',
  tips: [
    'Start with one file at a time for focused refactoring',
    'Review suggested changes before applying them',
    'Ask for explanation of refactoring patterns used',
    'Request tests to verify behavior is preserved',
  ],
  relatedExamples: [
    'review-code-quality',
    'write-tests',
    'optimize-performance',
  ],
  documentationLinks: [
    '/docs/tools/file-operations.md',
    '/docs/examples/refactoring.md',
  ],
  prerequisites: [
    'Have code that needs refactoring',
    'Understand the current functionality to verify changes',
  ],
  featured: false,
};

export default example;
