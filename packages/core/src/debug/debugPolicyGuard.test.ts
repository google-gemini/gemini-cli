/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugPolicyGuard } from './debugPolicyGuard.js';

describe('DebugPolicyGuard', () => {
    describe('default policy', () => {
        const guard = new DebugPolicyGuard();

        it('should require approval for debug_launch', () => {
            const decision = guard.evaluate('debug_launch', { program: 'app.js' });
            expect(decision.requiresApproval).toBe(true);
            expect(decision.risk).toBe('high');
        });

        it('should require approval for debug_evaluate', () => {
            const decision = guard.evaluate('debug_evaluate', { expression: 'x + 1' });
            expect(decision.requiresApproval).toBe(true);
            expect(decision.risk).toBe('high');
        });

        it('should allow read-only operations', () => {
            const ops = ['debug_get_stacktrace', 'debug_get_variables', 'debug_step', 'debug_disconnect'];
            for (const op of ops) {
                const decision = guard.evaluate(op, {});
                expect(decision.allowed).toBe(true);
                expect(decision.risk).toBe('low');
                expect(decision.requiresApproval).toBe(false);
            }
        });

        it('should require approval for debug_attach', () => {
            const decision = guard.evaluate('debug_attach', { port: 5678 });
            expect(decision.requiresApproval).toBe(true);
            expect(decision.risk).toBe('high');
        });
    });

    describe('blocked paths', () => {
        const guard = new DebugPolicyGuard();

        it('should block /etc/ paths', () => {
            const decision = guard.evaluate('debug_launch', { program: '/etc/passwd' });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should block .ssh paths', () => {
            const decision = guard.evaluate('debug_launch', { program: '/home/user/.ssh/config' });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should block .env files', () => {
            expect(guard.isPathAllowed('/app/.env')).toBe(false);
        });

        it('should block files with "secret" in the path', () => {
            expect(guard.isPathAllowed('/app/secrets/keys.json')).toBe(false);
        });

        it('should block breakpoints in blocked paths', () => {
            const decision = guard.evaluate('debug_set_breakpoint', { file: '/etc/shadow' });
            expect(decision.allowed).toBe(false);
        });

        it('should allow normal project paths', () => {
            expect(guard.isPathAllowed('/home/user/project/app.js')).toBe(true);
        });
    });

    describe('dangerous expressions', () => {
        const guard = new DebugPolicyGuard();

        it('should block child_process require', () => {
            const decision = guard.evaluate('debug_evaluate', {
                expression: "require('child_process').exec('rm -rf /')",
            });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should block eval', () => {
            const decision = guard.evaluate('debug_evaluate', {
                expression: 'eval("malicious code")',
            });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should block process.exit', () => {
            const decision = guard.evaluate('debug_evaluate', {
                expression: 'process.exit(1)',
            });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should block fs.unlink', () => {
            const decision = guard.evaluate('debug_evaluate', {
                expression: 'fs.unlink("/important/file")',
            });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should reject expressions exceeding max length', () => {
            const decision = guard.evaluate('debug_evaluate', {
                expression: 'x'.repeat(1001),
            });
            expect(decision.allowed).toBe(false);
        });

        it('should allow safe expressions when approved', () => {
            const lenientGuard = new DebugPolicyGuard({
                allowEvaluateWithoutApproval: true,
            });
            const decision = lenientGuard.evaluate('debug_evaluate', {
                expression: 'user.name',
            });
            expect(decision.allowed).toBe(true);
        });
    });

    describe('remote debugging', () => {
        const guard = new DebugPolicyGuard();

        it('should block remote hosts by default', () => {
            const decision = guard.evaluate('debug_launch', {
                program: 'app.js',
                host: '192.168.1.100',
                port: 9229,
            });
            expect(decision.allowed).toBe(false);
            expect(decision.risk).toBe('critical');
        });

        it('should allow localhost', () => {
            const decision = guard.evaluate('debug_launch', {
                program: 'app.js',
                host: 'localhost',
                port: 9229,
            });
            expect(decision.risk).toBe('high'); // Still high, but not blocked
            expect(decision.risk).not.toBe('critical');
        });
    });

    describe('param sanitization', () => {
        const guard = new DebugPolicyGuard();

        it('should redact sensitive parameters', () => {
            const decision = guard.evaluate('debug_launch', {
                program: 'app.js',
                password: 'secret123',
                apiToken: 'tok_abc',
            });
            expect(decision.sanitizedParams['password']).toBe('[REDACTED]');
            expect(decision.sanitizedParams['apiToken']).toBe('[REDACTED]');
            expect(decision.sanitizedParams['program']).toBe('app.js');
        });
    });

    describe('logpoints', () => {
        const guard = new DebugPolicyGuard();

        it('should classify logpoints as medium risk', () => {
            const decision = guard.evaluate('debug_set_breakpoint', {
                file: '/app/main.js',
                line: 10,
                log_message: 'x = {x}',
            });
            expect(decision.risk).toBe('medium');
        });

        it('should classify normal breakpoints as low risk', () => {
            const decision = guard.evaluate('debug_set_breakpoint', {
                file: '/app/main.js',
                line: 10,
            });
            expect(decision.risk).toBe('low');
        });
    });

    describe('toMarkdown', () => {
        it('should generate policy summary', () => {
            const guard = new DebugPolicyGuard();
            const md = guard.toMarkdown();
            expect(md).toContain('Security Policy');
            expect(md).toContain('debug_launch');
            expect(md).toContain('debug_evaluate');
        });
    });

    describe('custom policy', () => {
        it('should allow launch without approval when configured', () => {
            const guard = new DebugPolicyGuard({
                allowLaunchWithoutApproval: true,
            });
            const decision = guard.evaluate('debug_launch', { program: 'app.js' });
            expect(decision.allowed).toBe(true);
            expect(decision.requiresApproval).toBe(false);
        });
    });
});
