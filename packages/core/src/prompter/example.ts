/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Prompt, prompt } from './prompter.js';

// prompts can be functions that depend on context
export const identity = prompt(
  (ctx) =>
    `You are Gemini CLI, an ${ctx.preamble?.interactive ? 'interactive' : 'autonomous'} CLI agent.`,
);

// or they can be objects representing an XML or Markdown section
export const securityMandates = prompt({
  tag: 'security',
  attrs: { importance: 'MAXIMUM' },
  content: 'Never log or commit secrets. Protect .env and .git folders.',
});

// they can compose together, with individual content parts resolving based
// on context and not rendering if conditions aren't met
export const subagents = prompt({
  id: 'subagents',
  heading: 'Available Subagents',
  condition: (ctx) => (ctx.subAgents?.length ?? 0) > 0,
  content: [
    'Sub-agents are specialized expert agents. Each sub-agent is available as a tool of the same name. You MUST delegate tasks to the sub-agent with the most relevant expertise.',
    {
      tag: 'available_subagents',
      content: (ctx) =>
        ctx.subAgents?.map((s) => `- ${s.name}: ${s.description}`).join('\n') ||
        '',
    },
  ],
});

export const emptySection = prompt({
  heading: 'This Should Not Render',
  content: '', // Empty content causes section to be skipped
});

const myPrompt = new Prompt(
  identity,
  {
    id: 'general_guidance',
    heading: 'General Guidance',
    content: [
      'The following sections tell you how to behave. ALWAYS FOLLOW.',
      securityMandates,
    ],
  },
  { heading: 'Stuff You Can Use', content: subagents },
  emptySection,
);

// We can add new prompt elements dynamically
myPrompt.add('Here is an added note.');

// We can dynamically contribute to sections by ID, allowing for
// post-facto composability when adding new features
myPrompt.contribute({
  general_guidance: 'Be nice to humans.',
  subagents: 'Consider using the web_search subagent for recent info.',
});

//eslint-disable-next-line no-console
console.log(
  await myPrompt.render({
    preamble: { interactive: true },
    subAgents: [{ name: 'foo', description: 'does foo stuff' }],
  }),
);
