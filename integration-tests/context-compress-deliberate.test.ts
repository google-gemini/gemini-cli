/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest';
import {
  makeTestClientWithResponses,
  readStream,
  buildUpTo50PercentUtilization,
} from './test-helper';

interface ChatMessage {
  text?: string;
  parts: { text: string }[];
}

test('Full interactive compression flow with goal selection', async () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { client, chat, getRequests } = await makeTestClientWithResponses(
    'context-compress-deliberate.responses',
  );

  // The user has a long chat history, passing the trigger threshold
  const stream = await client.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: 'This is a very long conversation history...' }],
      },
      {
        role: 'model',
        parts: [
          {
            text: 'Indeed, it has been a long and fruitful discussion.',
          },
        ],
      },
    ],
  });
  await readStream(stream);

  // The compression prompt is shown, and the user selects "1"
  // The test helper mocks this by adding a "1" to the response queue.
  const secondStream = await client.sendMessage({
    message: 'One more message to trigger the prompt.',
  });
  const response = await readStream(secondStream);

  // Verify that the UI showed the prompt (the mock response contains the prompt text)
  expect(response).toContain('What are you currently working on?');

  // Verify that compression happened
  const thirdStream = await client.sendMessage({
    message: 'This message should be sent with a compressed history.',
  });
  await readStream(thirdStream);

  const requests = getRequests();
  const lastRequest = requests[requests.length - 1];

  // Find the summary message in the history of the last request
  const summaryMessage = lastRequest.history.find((m: ChatMessage) =>
    m.text?.includes('[Previous conversation summary]'),
  );

  expect(summaryMessage).toBeDefined();
  expect(lastRequest.history.length).toBeLessThan(10); // Or some other assertion that history is smaller
});

test('Safety valve scenario forces compression at 50% utilization', async () => {
  const { client, chat } = await makeTestClientWithResponses(
    'context-compress-deliberate.responses',
  );

  // Build up to 50% utilization to trigger safety valve
  await buildUpTo50PercentUtilization(chat, client, 0.5); // 0.5 for 50% utilization

  // Send a message to trigger the compression check
  const stream = await client.sendMessage({
    message: 'This message should trigger the safety valve.',
  });
  const response = await readStream(stream);

  // Verify that the UI prompt *does not* contain opt-out options (since it's a safety valve)
  expect(response).toContain('Context capacity at 50%');
  expect(response).not.toContain("Don't ask me again");
  expect(response).not.toContain('Check in less often');

  // Since it's a safety valve, it should auto-compress without user interaction
  const requests = chat.getRequests();
  const lastRequest = requests[requests.length - 1];

  const summaryMessage = lastRequest.history.find((m: ChatMessage) =>
    m.text?.includes('[Previous conversation summary]'),
  );
  expect(summaryMessage).toBeDefined();
});
