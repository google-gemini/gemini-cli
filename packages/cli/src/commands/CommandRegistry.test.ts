/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './CommandRegistry.js';
import { SessionEngine, KnowledgeStore } from '@zoe/core';

describe('CommandRegistry', () => {
  it('detects slash commands', () => {
    const registry = new CommandRegistry();
    expect(registry.isCommand('/help')).toBe(true);
    expect(registry.isCommand('/exit')).toBe(true);
    expect(registry.isCommand('/model')).toBe(true);
    expect(registry.isCommand('/learn')).toBe(true);
    expect(registry.isCommand('/solve')).toBe(true);
    expect(registry.isCommand('/debug')).toBe(true);
    expect(registry.isCommand('/review')).toBe(true);
    expect(registry.isCommand('/explain')).toBe(true);
    expect(registry.isCommand('/hint')).toBe(true);
    expect(registry.isCommand('hello')).toBe(false);
  });

  it('executes /help and returns command list', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();
    let exited = false;

    const result = await registry.execute('/help', {
      session,
      exit: () => {
        exited = true;
      },
    });

    expect(typeof result).toBe('string');
    expect(result).toContain('Available commands:');
    expect(result).toContain('/help');
    expect(result).toContain('/learn');
    expect(result).toContain('/solve');
    expect(result).toContain('/debug');
    expect(result).toContain('/review');
    expect(result).toContain('/explain');
    expect(result).toContain('/hint');
    expect(result).toContain('/model');
    expect(result).toContain('/exit');
    expect(result).toContain('/clear');
    expect(exited).toBe(false);
  });

  it('inspects and switches model with /model', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine({ model: 'placeholder' });

    // Inspect
    const inspectResult = await registry.execute('/model', {
      session,
      exit: () => {},
    });
    expect(inspectResult).toContain('Active provider: placeholder');
    expect(inspectResult).toContain('Active model: placeholder');

    // Switch to ollama model
    const switchResult = await registry.execute('/model llama3.2', {
      session,
      exit: () => {},
    });
    expect(switchResult).toContain('Switched model to llama3.2 (ollama)');
    expect(session.getModel()).toBe('llama3.2');
    expect(session.getProvider().name).toBe('ollama');
  });

  it('executes mentoring commands and sends prompt through session', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    await registry.execute('/learn closures', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].content).toContain('Teach me about: closures');
  });

  it('executes /hint and triggers progressive hints', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    await registry.execute('/hint', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages[0].content).toContain('Level 1');
  });

  it('executes /version', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const result = await registry.execute('/version', {
      session,
      exit: () => {},
    });

    expect(result).toBe('Zoe v0.1.0');
  });

  it('executes /exit and triggers exit callback', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();
    let exited = false;

    await registry.execute('/exit', {
      session,
      exit: () => {
        exited = true;
      },
    });

    expect(exited).toBe(true);
  });

  it('returns helpful message for unknown commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const result = await registry.execute('/unknown', {
      session,
      exit: () => {},
    });

    expect(result).toContain('Unknown command: /unknown');
  });

  it('inspects and switches active mentoring policy via /policy', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const inspectResult = await registry.execute('/policy', {
      session,
      exit: () => {},
    });
    expect(inspectResult).toContain('Active policy: Deep Code Comprehension');

    const switchResult = await registry.execute('/policy solve', {
      session,
      exit: () => {},
    });
    expect(switchResult).toContain('Switched active policy to: Guided Problem Solving (solve)');
    expect(session.mentor.getActivePolicy().intent).toBe('solve');

    const errorResult = await registry.execute('/policy invalid_mode', {
      session,
      exit: () => {},
    });
    expect(errorResult).toContain('Unknown policy: invalid_mode');
  });

  it('executes /ponytail and /simplify commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    // Without arguments: switches active policy and returns description
    const activateResult = await registry.execute('/ponytail', {
      session,
      exit: () => {},
    });
    expect(activateResult).toContain('Activated Ponytail Minimalist Philosopher mode');
    expect(session.mentor.getActivePolicy().intent).toBe('ponytail');

    // With target: sends prompt with Ponytail policy
    await registry.execute('/simplify package.json', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].content).toContain('Ponytail minimalist philosophy');

    // /policy ponytail switches to Ponytail
    const policyResult = await registry.execute('/policy ponytail', {
      session,
      exit: () => {},
    });
    expect(policyResult).toContain('Switched active policy to: Ponytail Minimalist Philosopher (ponytail)');
  });

  it('executes /archify and /diagram commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    // Without arguments: adds topology system message
    await registry.execute('/archify', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toContain('SYSTEM ARCHITECTURE TOPOLOGY');
    expect(session.mentor.getActivePolicy().intent).toBe('archify');

    // With target: sends prompt with Archify policy
    await registry.execute('/diagram database', {
      session,
      exit: () => {},
    });
    const updatedMessages = session.getMessages();
    const lastUserMsg = updatedMessages.find((m) => m.content.includes('Visually diagram'));
    expect(lastUserMsg).toBeDefined();

    // /policy archify switches to Archify
    const policyResult = await registry.execute('/policy archify', {
      session,
      exit: () => {},
    });
    expect(policyResult).toContain('Switched active policy to: Archify Visual Reasoner (archify)');
  });

  it('executes /knowledge, /progress, /mastered, and /practice commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine({
      knowledge: new KnowledgeStore(undefined, { autoSave: false }),
    });

    // Initially empty knowledge summary
    const emptyResult = await registry.execute('/knowledge', {
      session,
      exit: () => {},
    });
    expect(emptyResult).toContain('No concepts recorded yet');

    // /practice registers in-progress concept
    const practiceResult = await registry.execute('/practice rate limiting', {
      session,
      exit: () => {},
    });
    expect(practiceResult).toContain("Marked 'rate limiting' as In-Progress / Practicing ⚡");

    // /mastered marks concept as mastered
    const masteredResult = await registry.execute('/mastered closures', {
      session,
      exit: () => {},
    });
    expect(masteredResult).toContain("Marked 'closures' as Mastered ★");

    // /progress outputs dashboard with both concepts
    const progressResult = await registry.execute('/progress', {
      session,
      exit: () => {},
    });
    expect(progressResult).toContain('DEVELOPER KNOWLEDGE & CONCEPT MASTERY');
    expect(progressResult).toContain('★ Mastered:');
    expect(progressResult).toContain('closures');
    expect(progressResult).toContain('⚡ In-Progress / Practicing:');
    expect(progressResult).toContain('rate limiting');
  });

  it('executes /challenge and /quiz commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine({
      knowledge: new KnowledgeStore(undefined, { autoSave: false }),
    });

    // Execute /challenge without arguments (selects from graph or default)
    await registry.execute('/challenge', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toContain('SOCRATIC ENGINEERING CHALLENGE');
    expect(session.mentor.getActivePolicy().intent).toBe('challenge');

    // Execute /quiz with explicit concept
    await registry.execute('/quiz rate limiting', {
      session,
      exit: () => {},
    });
    const updatedMessages = session.getMessages();
    const challengeMsg = updatedMessages.find((m) => m.content.includes('Concept: rate limiting'));
    expect(challengeMsg).toBeDefined();

    // /policy challenge switches to ChallengePolicy
    const policyResult = await registry.execute('/policy challenge', {
      session,
      exit: () => {},
    });
    expect(policyResult).toContain('Switched active policy to: Socratic Challenge Evaluator (challenge)');
  });

  it('executes /symbols and /find commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine({
      knowledge: new KnowledgeStore(undefined, { autoSave: false }),
    });

    // Populate mock symbol in session's symbolIndex
    session.getSymbolIndex().indexFile('packages/core/src/session/SessionEngine.ts', 'export class SessionEngine {}');

    // /symbols lists matching symbols
    const symbolsResult = await registry.execute('/symbols engine', {
      session,
      exit: () => {},
    });
    expect(symbolsResult).toContain('SessionEngine');
    expect(symbolsResult).toContain('CLASS');

    // /find locates symbol with exact file location
    const findResult = await registry.execute('/find SessionEngine', {
      session,
      exit: () => {},
    });
    expect(findResult).toContain('Found 1 declaration for \'SessionEngine\'');
    expect(findResult).toContain('packages/core/src/session/SessionEngine.ts:1');

    // /find for non-existent symbol
    const notFoundResult = await registry.execute('/find UnknownSymbol', {
      session,
      exit: () => {},
    });
    expect(notFoundResult).toContain("Symbol 'UnknownSymbol' not found");
  });
});
