/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugContextBuilder } from './debugContextBuilder.js';
import type { DebugSnapshot } from './debugContextBuilder.js';

const STOPPED_SNAPSHOT: DebugSnapshot = {
    state: 'stopped',
    stopReason: 'breakpoint',
    location: {
        file: '/app/src/handler.ts',
        line: 42,
        function: 'handleRequest',
    },
    sourceContext: [
        '40:     const user = await getUser(id);',
        '41:     if (!user) {',
        '42: >>> throw new Error("User not found");',
        '43:     }',
        '44:     return user;',
    ],
    stackFrames: [
        { name: 'handleRequest', file: '/app/src/handler.ts', line: 42 },
        { name: 'processRequest', file: '/app/src/server.ts', line: 88 },
        { name: 'onConnection', file: '/app/src/server.ts', line: 15 },
    ],
    variables: {
        id: '"user-123"',
        user: 'null',
        req: '{ method: "GET", url: "/api/user/123" }',
    },
    variableDiff: {
        added: [{ name: 'user', value: 'null' }],
        changed: [{ name: 'id', from: 'undefined', to: '"user-123"' }],
        removed: [],
    },
};

const EXCEPTION_SNAPSHOT: DebugSnapshot = {
    state: 'stopped',
    stopReason: 'exception',
    location: {
        file: '/app/src/db.ts',
        line: 15,
        function: 'query',
    },
    exception: {
        type: 'TypeError',
        message: "Cannot read property 'rows' of undefined",
        stack: "TypeError: Cannot read property 'rows' of undefined\n    at query (/app/src/db.ts:15:18)\n    at getUser (/app/src/handler.ts:10:14)",
    },
    variables: {
        result: 'undefined',
        sql: '"SELECT * FROM users WHERE id = $1"',
    },
};

describe('DebugContextBuilder', () => {
    describe('build', () => {
        it('should build context for stopped state', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const ctx = builder.build();
            expect(ctx).toContain('Debug State');
            expect(ctx).toContain('handler.ts:42');
            expect(ctx).toContain('breakpoint');
            expect(ctx).toContain('handleRequest');
        });

        it('should include variable diff', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const ctx = builder.build({ includeDiff: true });
            expect(ctx).toContain('Changes Since Last Stop');
            expect(ctx).toContain('user-123');
        });

        it('should include source context', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const ctx = builder.build({ includeSource: true });
            expect(ctx).toContain('Source Context');
            expect(ctx).toContain('throw new Error');
        });

        it('should include stack trace', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const ctx = builder.build({ includeStack: true });
            expect(ctx).toContain('Call Stack');
            expect(ctx).toContain('processRequest');
        });

        it('should include variables table', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const ctx = builder.build();
            expect(ctx).toContain('Variables');
            expect(ctx).toContain('user');
            expect(ctx).toContain('null');
        });
    });

    describe('exception context', () => {
        it('should prioritize exception info', () => {
            const builder = new DebugContextBuilder();
            builder.update(EXCEPTION_SNAPSHOT);

            const ctx = builder.build();
            expect(ctx).toContain('Exception');
            expect(ctx).toContain('TypeError');
            expect(ctx).toContain("Cannot read property 'rows'");
        });
    });

    describe('token budget', () => {
        it('should respect token budget', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const short = builder.build({ maxTokens: 100 });
            const long = builder.build({ maxTokens: 5000 });

            expect(short.length).toBeLessThan(long.length);
        });
    });

    describe('buildOneLiner', () => {
        it('should generate one-liner for breakpoint', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);

            const line = builder.buildOneLiner();
            expect(line).toContain('breakpoint');
            expect(line).toContain('handler.ts:42');
        });

        it('should generate one-liner for exception', () => {
            const builder = new DebugContextBuilder();
            builder.update(EXCEPTION_SNAPSHOT);

            const line = builder.buildOneLiner();
            expect(line).toContain('TypeError');
            expect(line).toContain('rows');
        });

        it('should handle no session', () => {
            const builder = new DebugContextBuilder();
            expect(builder.buildOneLiner()).toContain('No debug session');
        });
    });

    describe('empty state', () => {
        it('should handle no snapshot', () => {
            const builder = new DebugContextBuilder();
            const ctx = builder.build();
            expect(ctx).toContain('No active debug session');
        });
    });

    describe('clear', () => {
        it('should reset state', () => {
            const builder = new DebugContextBuilder();
            builder.update(STOPPED_SNAPSHOT);
            builder.clear();

            expect(builder.build()).toContain('No active debug session');
        });
    });

    describe('snapshot history', () => {
        it('should maintain previous snapshots', () => {
            const builder = new DebugContextBuilder(2);
            builder.update(STOPPED_SNAPSHOT);
            builder.update(EXCEPTION_SNAPSHOT);

            // Current should be exception
            expect(builder.buildOneLiner()).toContain('TypeError');
        });
    });
});
