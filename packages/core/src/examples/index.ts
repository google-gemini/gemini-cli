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

/**
 * Example Library
 *
 * This module provides a comprehensive library of executable examples
 * that help users discover and learn Gemini CLI capabilities.
 *
 * ## Features
 *
 * - **50+ Examples**: Covering all major use cases
 * - **Searchable**: Find examples by text, category, tags, difficulty
 * - **Executable**: Run examples directly with one command
 * - **Customizable**: Adapt examples for your needs
 * - **Educational**: Learn by doing with real-world scenarios
 *
 * ## Usage
 *
 * ```typescript
 * import { getExampleRegistry, ExampleRunner } from './examples';
 *
 * // Get the registry
 * const registry = await getExampleRegistry();
 *
 * // Search for examples
 * const examples = registry.search({ text: 'git', difficulty: 'beginner' });
 *
 * // Run an example
 * const runner = new ExampleRunner(chatService);
 * const result = await runner.run(examples[0]);
 * ```
 *
 * @module examples
 */

// Export types
export type {
  Example,
  ExampleDifficulty,
  ExampleCategory,
  ExampleResource,
  ExampleSearchQuery,
  ExampleResult,
  ExampleStats,
  ExampleInteraction,
  ChatService,
} from './types.js';

// Export registry
export { ExampleRegistry, getExampleRegistry, resetExampleRegistry } from './registry.js';

// Export runner
export { ExampleRunner } from './runner.js';
export type { RunExampleOptions } from './runner.js';

// Export examples
export { BUILT_IN_EXAMPLES, getAllExamples, getExampleById } from './examples/index.js';
