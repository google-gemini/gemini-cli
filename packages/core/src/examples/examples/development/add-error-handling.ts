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
 * Example: Add Comprehensive Error Handling
 *
 * This example shows how to add robust error handling to existing code
 * to improve reliability and user experience.
 */
const example: Example = {
  id: 'add-error-handling',
  title: 'Add Comprehensive Error Handling',
  description:
    'Enhance code with proper error handling, validation, and graceful failure mechanisms',
  category: 'development',
  tags: ['error-handling', 'validation', 'reliability', 'robustness'],
  difficulty: 'intermediate',
  estimatedTime: '10-15 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-read', 'file-write'],
  examplePrompt: `Add comprehensive error handling to @src/api/user-service.ts:

1. **Identify Missing Error Handling**: Find operations that could fail but aren't handled
2. **Add Try-Catch Blocks**: Wrap error-prone operations appropriately
3. **Input Validation**: Add validation for function parameters
4. **Error Messages**: Create clear, actionable error messages
5. **Graceful Degradation**: Ensure failures don't crash the application
6. **Logging**: Add appropriate error logging

Make errors informative for both developers and end users.`,
  expectedOutcome:
    'Code with comprehensive error handling, validation, and clear error messages',
  tips: [
    'Specify the type of errors to handle (network, validation, etc.)',
    'Ask for error handling patterns specific to your language/framework',
    'Request error logging and monitoring integration',
    'Consider both expected and unexpected error scenarios',
  ],
  relatedExamples: [
    'write-tests',
    'refactor-code',
    'review-code-quality',
  ],
  documentationLinks: [
    '/docs/tools/file-operations.md',
    '/docs/examples/error-handling.md',
  ],
  prerequisites: [
    'Have code that needs error handling improvements',
  ],
  featured: false,
};

export default example;
