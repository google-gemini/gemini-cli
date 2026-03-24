/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A collection of predefined test agents for use in evaluations and tests.
 */
export const TEST_AGENTS = {
  'docs-agent': `---
name: docs-agent
description: An agent with expertise in updating documentation.
tools:
  - read_file
  - write_file
---
You are the docs agent. Update documentation clearly and accurately.
`,
  'test-agent': `---
name: test-agent
description: An agent with expertise in writing and updating tests.
tools:
  - read_file
  - write_file
---
You are the test agent. Add or update tests.
`,
} as const;

/**
 * The names of the available test agents.
 */
export type TestAgentName = keyof typeof TEST_AGENTS;

/**
 * Retrieves the definition for a specific test agent.
 *
 * @param name The name of the test agent to retrieve.
 * @returns The YAML/Markdown definition of the agent.
 */
export function getTestAgent(name: TestAgentName): string {
  return TEST_AGENTS[name];
}
