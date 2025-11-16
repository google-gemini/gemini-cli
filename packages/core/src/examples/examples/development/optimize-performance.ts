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
 * Example: Optimize Code Performance
 *
 * This example demonstrates how to identify and fix performance bottlenecks
 * in existing code.
 */
const example: Example = {
  id: 'optimize-performance',
  title: 'Identify and Fix Performance Bottlenecks',
  description:
    'Analyze code for performance issues and get specific optimization recommendations with implementation',
  category: 'development',
  tags: ['performance', 'optimization', 'efficiency', 'profiling'],
  difficulty: 'advanced',
  estimatedTime: '15-20 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-read', 'file-write'],
  examplePrompt: `Analyze @src/data-processor.ts for performance bottlenecks and optimize it:

1. **Identify Inefficiencies**: Find slow operations, unnecessary loops, redundant calculations
2. **Algorithm Improvements**: Suggest better algorithms or data structures
3. **Caching Opportunities**: Identify repeated calculations that could be cached
4. **I/O Optimization**: Improve file or network operations
5. **Memory Usage**: Reduce unnecessary memory allocations
6. **Implement Optimizations**: Provide optimized code with explanations

Include before/after complexity analysis (Big O notation) where applicable.`,
  expectedOutcome:
    'Optimized code with performance improvements and complexity analysis',
  tips: [
    'Provide context about performance requirements and bottlenecks',
    'Ask for profiling guidance to measure improvements',
    'Request benchmark code to verify optimizations',
    'Consider trade-offs between performance and readability',
  ],
  relatedExamples: [
    'review-code-quality',
    'refactor-code',
    'write-tests',
  ],
  documentationLinks: [
    '/docs/tools/file-operations.md',
    '/docs/examples/performance.md',
  ],
  prerequisites: [
    'Have code with performance issues',
    'Know the performance requirements or constraints',
  ],
  featured: false,
};

export default example;
