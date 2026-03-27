/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DebugErrorClassifier, ErrorCategory, ErrorSeverity } from './debugErrorClassifier.js';

describe('DebugErrorClassifier', () => {
    let classifier: DebugErrorClassifier;

    beforeEach(() => {
        classifier = new DebugErrorClassifier();
    });

    describe('connection errors', () => {
        it('should classify ECONNREFUSED', () => {
            const result = classifier.classify('connect ECONNREFUSED 127.0.0.1:9229');
            expect(result.category).toBe(ErrorCategory.Connection);
            expect(result.severity).toBe(ErrorSeverity.Recoverable);
            expect(result.retryable).toBe(false);
            expect(result.userMessage).toContain('9229');
            expect(result.recovery).toContain('inspect');
        });

        it('should classify ECONNRESET', () => {
            const result = classifier.classify('read ECONNRESET');
            expect(result.category).toBe(ErrorCategory.Connection);
            expect(result.severity).toBe(ErrorSeverity.Transient);
            expect(result.retryable).toBe(true);
        });

        it('should classify ETIMEDOUT', () => {
            const result = classifier.classify('connect ETIMEDOUT');
            expect(result.category).toBe(ErrorCategory.Connection);
            expect(result.retryable).toBe(true);
            expect(result.maxRetries).toBe(3);
        });

        it('should classify EADDRINUSE', () => {
            const result = classifier.classify('listen EADDRINUSE: address already in use :::9229');
            expect(result.category).toBe(ErrorCategory.Connection);
            expect(result.userMessage).toContain('already in use');
        });

        it('should classify not connected', () => {
            const result = classifier.classify("Cannot send 'evaluate': not connected");
            expect(result.category).toBe(ErrorCategory.Connection);
            expect(result.severity).toBe(ErrorSeverity.Fatal);
        });
    });

    describe('timeout errors', () => {
        it('should classify operation timeout', () => {
            const result = classifier.classify('Operation timed out after 15000ms');
            expect(result.category).toBe(ErrorCategory.Timeout);
            expect(result.retryable).toBe(true);
        });

        it('should classify adapter start timeout', () => {
            const result = classifier.classify('Debug adapter did not start in time');
            expect(result.category).toBe(ErrorCategory.Timeout);
            expect(result.recovery).toContain('startup error');
        });
    });

    describe('state errors', () => {
        it('should classify no active session', () => {
            const result = classifier.classify('No active debug session. Use debug_launch first.');
            expect(result.category).toBe(ErrorCategory.State);
            expect(result.recovery).toContain('debug_launch');
        });

        it('should classify invalid state transition', () => {
            const result = classifier.classify('Invalid state transition: running → stepping');
            expect(result.category).toBe(ErrorCategory.State);
            expect(result.severity).toBe(ErrorSeverity.Info);
        });
    });

    describe('adapter errors', () => {
        it('should classify process exit', () => {
            const result = classifier.classify('Process exited with code 1 before debugger started');
            expect(result.category).toBe(ErrorCategory.Adapter);
            expect(result.severity).toBe(ErrorSeverity.Fatal);
        });

        it('should classify adapter crash', () => {
            const result = classifier.classify('Debug adapter crashed with SIGSEGV');
            expect(result.category).toBe(ErrorCategory.Adapter);
            expect(result.severity).toBe(ErrorSeverity.Fatal);
        });
    });

    describe('capability errors', () => {
        it('should classify unsupported features', () => {
            const result = classifier.classify('Operation not supported by this adapter');
            expect(result.category).toBe(ErrorCategory.Capability);
            expect(result.severity).toBe(ErrorSeverity.Info);
        });

        it('should classify function breakpoint not supported', () => {
            const result = classifier.classify('setFunctionBreakpoints not supported');
            expect(result.category).toBe(ErrorCategory.Capability);
            expect(result.recovery).toContain('different');
        });
    });

    describe('user errors', () => {
        it('should classify expression evaluation failure', () => {
            const result = classifier.classify('Expression evaluation failed: SyntaxError');
            expect(result.category).toBe(ErrorCategory.User);
            expect(result.severity).toBe(ErrorSeverity.Info);
        });

        it('should classify unverified breakpoint', () => {
            const result = classifier.classify('breakpoint was not verified by the adapter');
            expect(result.category).toBe(ErrorCategory.User);
            expect(result.recovery).toContain('executable code');
        });
    });

    describe('protocol errors', () => {
        it('should classify malformed messages', () => {
            const result = classifier.classify('Unexpected token in JSON at position 0');
            expect(result.category).toBe(ErrorCategory.Protocol);
            expect(result.retryable).toBe(true);
        });
    });

    describe('resource errors', () => {
        it('should classify OOM', () => {
            const result = classifier.classify('FATAL ERROR: CALL_AND_RETRY_LAST ENOMEM: not enough memory');
            expect(result.category).toBe(ErrorCategory.Resource);
            expect(result.severity).toBe(ErrorSeverity.Fatal);
        });

        it('should classify EMFILE', () => {
            const result = classifier.classify('EMFILE: too many open files');
            expect(result.category).toBe(ErrorCategory.Resource);
        });
    });

    describe('unknown errors', () => {
        it('should classify unknown errors gracefully', () => {
            const result = classifier.classify('Something completely unexpected happened');
            expect(result.category).toBe(ErrorCategory.Unknown);
            expect(result.severity).toBe(ErrorSeverity.Recoverable);
        });
    });

    describe('shouldRetry', () => {
        it('should allow retry for transient errors', () => {
            const error = classifier.classify('read ECONNRESET');
            expect(classifier.shouldRetry(error, 0)).toBe(true);
            expect(classifier.shouldRetry(error, 1)).toBe(true);
            expect(classifier.shouldRetry(error, 2)).toBe(false); // maxRetries = 2
        });

        it('should not retry fatal errors', () => {
            const error = classifier.classify('Process exited with code 1');
            expect(classifier.shouldRetry(error, 0)).toBe(false);
        });
    });

    describe('error log', () => {
        it('should track classified errors', () => {
            classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            classifier.classify('Operation timed out after 5000ms');
            expect(classifier.getErrorLog()).toHaveLength(2);
        });

        it('should compute error frequency', () => {
            classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            classifier.classify('read ECONNRESET');
            classifier.classify('Operation timed out after 5000ms');

            const freq = classifier.getErrorFrequency();
            expect(freq[ErrorCategory.Connection]).toBe(2);
            expect(freq[ErrorCategory.Timeout]).toBe(1);
        });
    });

    describe('detectPatterns', () => {
        it('should detect repeated connection failures', () => {
            classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            classifier.classify('ECONNRESET');
            classifier.classify('ETIMEDOUT on 127.0.0.1:9229');

            const patterns = classifier.detectPatterns();
            expect(patterns.some((p) => p.includes('connection'))).toBe(true);
        });
    });

    describe('toMarkdown', () => {
        it('should generate single error report', () => {
            const error = classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            const md = classifier.toMarkdown(error);
            expect(md).toContain('Debug Error');
            expect(md).toContain('ECONNREFUSED');
            expect(md).toContain('Recovery');
        });

        it('should generate summary report', () => {
            classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            classifier.classify('timed out after 5000ms');

            const md = classifier.toMarkdown();
            expect(md).toContain('Error Summary');
            expect(md).toContain('connection');
            expect(md).toContain('timeout');
        });

        it('should handle empty log', () => {
            const md = classifier.toMarkdown();
            expect(md).toContain('No errors');
        });
    });

    describe('clear', () => {
        it('should clear error log', () => {
            classifier.classify('ECONNREFUSED 127.0.0.1:9229');
            classifier.clear();
            expect(classifier.getErrorLog()).toHaveLength(0);
        });
    });
});
