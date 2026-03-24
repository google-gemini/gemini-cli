/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A collection of predefined test agents for use in evaluations and tests.
 * Each agent provides both its 'name' (for assertions) and its 'definition'
 * (for file creation).
 */
export const TEST_AGENTS = {
  /**
   * An agent with expertise in updating documentation.
   */
  DOCS_AGENT: {
    name: 'docs-agent',
    definition: `---
name: docs-agent
description: An agent with expertise in updating documentation.
tools:
  - read_file
  - write_file
---
You are the docs agent. Update documentation clearly and accurately.
`,
  },

  /**
   * An agent with expertise in writing and updating tests.
   */
  TESTING_AGENT: {
    name: 'testing-agent',
    definition: `---
name: testing-agent
description: An agent with expertise in writing and updating tests.
tools:
  - read_file
  - write_file
---
You are the test agent. Add or update tests.
`,
  },
} as const;
