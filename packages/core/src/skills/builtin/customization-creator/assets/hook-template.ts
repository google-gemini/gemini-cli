/* eslint-disable no-restricted-imports */
import { defineHook } from '@google/gemini-cli-core';

export default defineHook({
  name: 'my-hook',
  // See docs/hooks/reference.md for all available events
  events: ['before-agent', 'after-model'], 
  async handler(event, context) {
    if (event.type === 'before-agent') {
      context.ui.print('Hook intercepting before agent runs...');
      
      // Example: Inject additional context into the prompt
      event.context.prompt += '\nNote: Consider local time constraints.';
    }

    if (event.type === 'after-model') {
      // Example: Log model output
      // console.log(event.context.response.text);
    }
  },
});
