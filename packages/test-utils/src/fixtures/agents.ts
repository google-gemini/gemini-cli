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
  /**
   * An agent with expertise in database schemas, SQL, and creating database migrations.
   */
  DATABASE_AGENT: createAgent({
    name: 'database-agent',
    description:
      'An expert in database schemas, SQL, and creating database migrations.',
    tools: ['read_file', 'write_file'],
    body: 'You are the database agent. Create and update SQL migrations.',
  }),

  /**
   * An agent with expertise in CSS, styling, and UI design.
   */
  CSS_AGENT: createAgent({
    name: 'css-agent',
    description: 'An expert in CSS, styling, and UI design.',
    tools: ['read_file', 'write_file'],
    body: 'You are the CSS agent.',
  }),

  /**
   * An agent with expertise in internationalization and translations.
   */
  I18N_AGENT: createAgent({
    name: 'i18n-agent',
    description: 'An expert in internationalization and translations.',
    tools: ['read_file', 'write_file'],
    body: 'You are the i18n agent.',
  }),

  /**
   * An agent with expertise in security audits and vulnerability patches.
   */
  SECURITY_AGENT: createAgent({
    name: 'security-agent',
    description: 'An expert in security audits and vulnerability patches.',
    tools: ['read_file', 'write_file'],
    body: 'You are the security agent.',
  }),

  /**
   * An agent with expertise in CI/CD, Docker, and deployment scripts.
   */
  DEVOPS_AGENT: createAgent({
    name: 'devops-agent',
    description: 'An expert in CI/CD, Docker, and deployment scripts.',
    tools: ['read_file', 'write_file'],
    body: 'You are the devops agent.',
  }),

  /**
   * An agent with expertise in tracking, analytics, and metrics.
   */
  ANALYTICS_AGENT: createAgent({
    name: 'analytics-agent',
    description: 'An expert in tracking, analytics, and metrics.',
    tools: ['read_file', 'write_file'],
    body: 'You are the analytics agent.',
  }),

  /**
   * An agent with expertise in web accessibility and ARIA roles.
   */
  ACCESSIBILITY_AGENT: createAgent({
    name: 'accessibility-agent',
    description: 'An expert in web accessibility and ARIA roles.',
    tools: ['read_file', 'write_file'],
    body: 'You are the accessibility agent.',
  }),

  /**
   * An agent with expertise in React Native and mobile app development.
   */
  MOBILE_AGENT: createAgent({
    name: 'mobile-agent',
    description: 'An expert in React Native and mobile app development.',
    tools: ['read_file', 'write_file'],
    body: 'You are the mobile agent.',
  }),
} as const;
