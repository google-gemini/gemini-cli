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
 * Example: Trace Function Calls
 *
 * This example shows how to trace where and how a function is called
 * throughout a codebase.
 */
const example: Example = {
  id: 'trace-function-calls',
  title: 'Trace Function Usage Across Codebase',
  description:
    'Find all places where a function is called, understand its usage patterns, and identify potential issues',
  category: 'code-understanding',
  tags: ['debugging', 'analysis', 'call-graph', 'tracing', 'dependencies'],
  difficulty: 'intermediate',
  estimatedTime: '5-10 minutes',
  requiredTools: ['read_files', 'search_files'],
  requiredPermissions: ['file-read'],
  examplePrompt: `Find and analyze all usages of the function "processUserData" in this codebase:

1. **Call Sites**: List every file and line where it's called
2. **Usage Patterns**: How is it being used? What parameters are passed?
3. **Call Chain**: Trace the call stack - what calls it, and what does it call?
4. **Potential Issues**: Any problematic usage patterns?
5. **Impact Analysis**: What would break if we changed this function?

Provide a clear visualization of the call graph if possible.`,
  expectedOutcome:
    'Complete trace of function usage with call sites, patterns, and impact analysis',
  tips: [
    'Replace "processUserData" with your actual function name',
    'Use with @src to focus on specific directories',
    'Ask for visualization of the call graph',
    'Great for understanding impact before refactoring',
  ],
  relatedExamples: [
    'explain-codebase-architecture',
    'review-code-quality',
    'refactor-code',
  ],
  documentationLinks: [
    '/docs/tools/search.md',
    '/docs/examples/code-analysis.md',
  ],
  prerequisites: [
    'Know the function name you want to trace',
  ],
  featured: false,
};

export default example;
