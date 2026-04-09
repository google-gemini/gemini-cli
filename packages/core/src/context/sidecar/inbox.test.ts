import { describe, it, expect } from 'vitest';
import { LiveInbox, InboxSnapshotImpl } from './inbox.js';
import { DeterministicIdGenerator } from '../system/DeterministicIdGenerator.js';

describe('Inbox', () => {
  it('should publish messages and provide snapshots', () => {
    const inbox = new LiveInbox();
    const idGenerator = new DeterministicIdGenerator('mock-uuid-');

    inbox.publish('test-topic', { data: 'hello' }, idGenerator);
    inbox.publish('other-topic', { data: 'world' }, idGenerator);

    const messages = inbox.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[0].topic).toBe('test-topic');
    expect(messages[0].payload).toEqual({ data: 'hello' });
  });

  it('should drain consumed messages from the snapshot', () => {
    const inbox = new LiveInbox();
    const idGenerator = new DeterministicIdGenerator('mock-uuid-');

    inbox.publish('test-topic', { data: 'hello' }, idGenerator);
    inbox.publish('other-topic', { data: 'world' }, idGenerator);

    const messages = inbox.getMessages();
    const snapshot = new InboxSnapshotImpl(messages);

    const filtered = snapshot.getMessages<{ data: string }>('test-topic');
    expect(filtered.length).toBe(1);
    expect(filtered[0].payload.data).toBe('hello');

    // Consume the message
    snapshot.consume(filtered[0].id);

    // Provide the consumed IDs to the real inbox to drain them
    inbox.drainConsumed(snapshot.getConsumedIds());

    const finalMessages = inbox.getMessages();
    expect(finalMessages.length).toBe(1);
    expect(finalMessages[0].topic).toBe('other-topic');
  });
});
