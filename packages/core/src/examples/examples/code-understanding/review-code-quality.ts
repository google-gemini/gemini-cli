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
 * Example: Review Code Quality
 *
 * This example demonstrates how to get an AI-powered code review
 * that identifies issues, suggests improvements, and highlights best practices.
 */
const example: Example = {
  id: 'review-code-quality',
  title: 'Review Code for Quality and Best Practices',
  description:
    'Get comprehensive code review feedback including style issues, potential bugs, performance problems, and improvement suggestions',
  category: 'code-understanding',
  tags: ['review', 'quality', 'best-practices', 'refactoring', 'code-review'],
  difficulty: 'intermediate',
  estimatedTime: '5-10 minutes',
  requiredTools: ['read_files'],
  requiredPermissions: ['file-read'],
  examplePrompt: `Review the code in @src and provide a comprehensive quality assessment:

1. **Code Style & Consistency**: Identify style inconsistencies and deviation from best practices
2. **Potential Bugs**: Flag suspicious patterns that might lead to bugs
3. **Performance Issues**: Highlight inefficient code that could be optimized
4. **Maintainability**: Assess code organization, naming, and documentation
5. **Security Concerns**: Identify potential security vulnerabilities
6. **Improvement Suggestions**: Provide specific, actionable recommendations

Focus on the most impactful improvements and explain why each matters.`,
  expectedOutcome:
    'Detailed code review with categorized findings and prioritized improvement suggestions',
  tips: [
    'Use @filename to review specific files instead of entire directories',
    'Ask for examples of how to fix specific issues',
    'Request prioritization of issues by severity',
    'Follow up with "implement the top 3 suggestions"',
  ],
  relatedExamples: [
    'refactor-code',
    'find-vulnerabilities',
    'optimize-performance',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/code-review.md',
  ],
  prerequisites: [
    'Have code files you want reviewed in the current directory',
  ],
  featured: false,
};

export default example;
