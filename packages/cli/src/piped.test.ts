import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { SessionEngine, type ChatRequest, type ModelEvent } from '@zoe/core';
import { runPipedSession, parseCliFlags } from './index.js';
import { CommandRegistry } from './commands/CommandRegistry.js';

describe('piped CLI sessions', () => {
  it('waits for responses at EOF and preserves conversation order', async () => {
    const requests: ChatRequest[] = [];
    const session = new SessionEngine({ provider: {
      name: 'test',
      async isAvailable() { return true; },
      async *chat(request: ChatRequest): AsyncIterable<ModelEvent> {
        requests.push(request);
        await new Promise(resolve => setTimeout(resolve, 10));
        yield { type: 'complete', fullText: `answer ${requests.length}` };
      },
    } });
    const output: string[] = [];
    await runPipedSession(session, new CommandRegistry(), Readable.from(['first\nsecond\n']), text => output.push(text));
    expect(output).toEqual(['answer 1\n', 'answer 2\n']);
    expect(requests[1].messages.some(m => m.content === 'answer 1')).toBe(true);
    expect(session.getMessages().map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('stops at /exit without executing subsequent input', async () => {
    const session = new SessionEngine();
    const output: string[] = [];
    await runPipedSession(session, new CommandRegistry(), Readable.from(['/version\n/exit\nhello\n']), text => output.push(text));
    expect(output).toEqual(['Zoe v0.1.0\n']);
  });

  it.each([['--model'], ['--model', '--help'], ['--model='], ['--unknown']])('rejects invalid arguments %j', (...args) => {
    expect(() => parseCliFlags(args)).toThrow();
  });
});
