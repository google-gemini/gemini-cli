# @google/gemini-cli-sdk

The Gemini CLI SDK provides a programmatic interface to interact with Gemini
models and tools.

## Installation

```bash
npm install @google/gemini-cli-sdk
```

## Usage

```typescript
import { GeminiCliAgent } from '@google/gemini-cli-sdk';

async function main() {
  const agent = new GeminiCliAgent({
    instructions: 'You are a helpful assistant.',
  });

  const session = agent.session();
  await session.initialize();

  const controller = new AbortController();
  const signal = controller.signal;

  // Stream responses from the agent
  const stream = session.sendStream('Why is the sky blue?', signal);

  for await (const chunk of stream) {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.value || '');
    }
  }
}

main().catch(console.error);
```
