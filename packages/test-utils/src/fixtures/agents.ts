/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A collection of predefined test agents for use in evaluations and tests.
 * This namespaced object provides direct, typed access to agent definitions
 * with excellent IDE discoverability.
 */
export const TEST_AGENTS = {
  /**
   * An agent with expertise in updating documentation.
   * Tools: read_file, write_file
   */
  DOCS_AGENT: `---
name: docs-agent
description: An agent with expertise in updating documentation.
tools:
  - read_file
  - write_file
---
You are the docs agent. Update documentation clearly and accurately.
`,

  /**
   * An agent with expertise in writing and updating tests.
   * Tools: read_file, write_file
   */
  TEST_AGENT: `---
name: test-agent
description: An agent with expertise in writing and updating tests.
tools:
  - read_file
  - write_file
---
You are the test agent. Add or update tests.
`,
} as const;
