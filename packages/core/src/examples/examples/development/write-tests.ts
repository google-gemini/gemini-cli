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
  id: 'generate-unit-tests',
  title: 'Generate Unit Tests for Functions',
  description:
    'Automatically generate comprehensive unit tests with edge cases, mocks, and assertions for your functions',
  category: 'development',
  tags: ['testing', 'unit-tests', 'tdd', 'quality'],
  difficulty: 'beginner',
  estimatedTime: '3-5 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-write'],
  examplePrompt: `Generate comprehensive unit tests for @src/utils/auth.ts

Include:
1. Tests for all exported functions
2. Edge cases (null, undefined, empty values)
3. Error handling tests
4. Mock external dependencies
5. Clear test descriptions
6. Both positive and negative test cases

Use the testing framework already in this project (check package.json).
Write tests to a new file in the appropriate test directory.`,
  expectedOutcome:
    'Complete test file with 10+ test cases covering main functionality and edge cases',
  tips: [
    'Review generated tests to ensure they match your testing patterns',
    'Add more specific edge cases based on your business logic',
    'Run tests to verify they pass: npm test',
    'Consider test coverage goals for your project',
  ],
  relatedExamples: [
    'write-integration-tests',
    'generate-mocks',
    'test-coverage-report',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/testing.md',
  ],
  contextFiles: ['package.json'], // To detect testing framework
  featured: true,
};

export default example;
