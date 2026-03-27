/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import { DebugSessionSerializer } from './debugSessionSerializer.js';

// Mock fs for file operations
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            mkdir: vi.fn(async () => undefined),
            writeFile: vi.fn(async () => undefined),
            readFile: vi.fn(async () => '{}'),
        },
    };
});

describe('DebugSessionSerializer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('startSession', () => {
        it('should create a new session', () => {
            const serializer = new DebugSessionSerializer();
            const session = serializer.startSession('app.ts', 'typescript');

            expect(session.id).toBeTruthy();
            expect(session.program).toBe('app.ts');
            expect(session.language).toBe('typescript');
            expect(session.outcome).toBe('in-progress');
            expect(session.events.length).toBeGreaterThan(0); // launch event
        });
    });

    describe('recordEvent', () => {
        it('should add events with sequential IDs', () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');

            serializer.recordEvent('breakpoint-set', { file: 'a.ts', line: 10 });
            serializer.recordEvent('stop', { reason: 'breakpoint' });

            const session = serializer.getCurrentSession();
            expect(session!.events).toHaveLength(3); // launch + 2
            expect(session!.events[1].seq).toBe(1);
            expect(session!.events[2].seq).toBe(2);
        });

        it('should return null when no session', () => {
            const serializer = new DebugSessionSerializer();
            const event = serializer.recordEvent('stop', {});
            expect(event).toBeNull();
        });
    });

    describe('endSession', () => {
        it('should finalize session with outcome', () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');

            const session = serializer.endSession('fixed', 'Found and fixed null pointer');
            expect(session).not.toBeNull();
            expect(session!.outcome).toBe('fixed');
            expect(session!.summary).toBe('Found and fixed null pointer');
            expect(session!.endTime).toBeTruthy();
        });

        it('should clear current session after ending', () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');
            serializer.endSession('fixed', 'Done');

            expect(serializer.getCurrentSession()).toBeNull();
        });
    });

    describe('serialize and deserialize', () => {
        it('should round-trip a session', () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');
            serializer.recordEvent('stop', { reason: 'exception' });
            const session = serializer.endSession('fixed', 'Bug found')!;

            const json = serializer.serialize(session);
            const restored = serializer.deserialize(json);

            expect(restored.id).toBe(session.id);
            expect(restored.program).toBe('app.ts');
            expect(restored.events).toHaveLength(session.events.length);
        });

        it('should throw on invalid JSON', () => {
            const serializer = new DebugSessionSerializer();
            expect(() => serializer.deserialize('{}')).toThrow('Invalid session format');
        });
    });

    describe('saveToFile', () => {
        it('should save session to disk', async () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');
            const session = serializer.endSession('fixed', 'Done')!;

            const filePath = await serializer.saveToFile(session, '/tmp/debug');
            expect(filePath).toContain('debug-session-');
            expect(fs.promises.mkdir).toHaveBeenCalled();
            expect(fs.promises.writeFile).toHaveBeenCalled();
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown summary', () => {
            const serializer = new DebugSessionSerializer();
            serializer.startSession('app.ts', 'typescript');
            serializer.recordEvent('stop', { reason: 'breakpoint' });
            serializer.recordEvent('evaluate', { expression: 'x + 1' });
            const session = serializer.endSession('fixed', 'Null pointer found')!;

            const md = serializer.toMarkdown(session);
            expect(md).toContain('app.ts');
            expect(md).toContain('fixed');
            expect(md).toContain('Null pointer found');
            expect(md).toContain('Timeline');
        });
    });
});
