/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a test agent used in evaluations and tests.
 */
export interface TestAgent {
  /** The unique name of the agent. */
  readonly name: string;
  /** The full YAML/Markdown definition of the agent. */
  readonly definition: string;
  /** The standard path where this agent should be saved in a test project. */
  readonly path: string;
  /** A helper to spread this agent directly into a 'files' object for evalTest. */
  readonly asFile: () => Record<string, string>;
}

/**
 * Helper to create a TestAgent with consistent formatting and pathing.
 */
function createAgent(options: {
  name: string;
  description: string;
  tools: string[];
  body: string;
}): TestAgent {
  const definition = `---
name: ${options.name}
description: ${options.description}
tools:
${options.tools.map((t) => `  - ${t}`).join('\n')}
---
${options.body}
`;

  const path = `.gemini/agents/${options.name}.md`;

  return {
    name: options.name,
    definition,
    path,
    asFile: () => ({ [path]: definition }),
  };
}

/**
 * A collection of predefined test agents for use in evaluations and tests.
 */
export const TEST_AGENTS = {
  /**
   * An agent with expertise in updating documentation.
   */
  DOCS_AGENT: createAgent({
    name: 'docs-agent',
    description: 'An agent with expertise in updating documentation.',
    tools: ['read_file', 'write_file'],
    body: 'You are the docs agent. Update documentation clearly and accurately.',
  }),

  /**
   * An agent with expertise in writing and updating tests.
   */
  TESTING_AGENT: createAgent({
    name: 'testing-agent',
    description: 'An agent with expertise in writing and updating tests.',
    tools: ['read_file', 'write_file'],
    body: 'You are the test agent. Add or update tests.',
  }),
} as const;
