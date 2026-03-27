/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getDebugSystemPrompt, getDebugCapabilitiesSummary } from './debugPrompt.js';

describe('debugPrompt', () => {
    describe('getDebugSystemPrompt', () => {
        it('should include all 7 debug tools', () => {
            const prompt = getDebugSystemPrompt();
            expect(prompt).toContain('debug_launch');
            expect(prompt).toContain('debug_set_breakpoint');
            expect(prompt).toContain('debug_get_stacktrace');
            expect(prompt).toContain('debug_get_variables');
            expect(prompt).toContain('debug_step');
            expect(prompt).toContain('debug_evaluate');
            expect(prompt).toContain('debug_disconnect');
        });

        it('should include debugging workflows', () => {
            const prompt = getDebugSystemPrompt();
            expect(prompt).toContain('my program crashes');
            expect(prompt).toContain('debug this function');
            expect(prompt).toContain('why is X wrong');
        });

        it('should include supported languages', () => {
            const prompt = getDebugSystemPrompt();
            expect(prompt).toContain('Node.js');
            expect(prompt).toContain('Python');
            expect(prompt).toContain('Go');
        });

        it('should include anti-loop rules', () => {
            const prompt = getDebugSystemPrompt();
            expect(prompt).toContain('Never step more than 20 times');
            expect(prompt).toContain('loops');
        });

        it('should include exception breakpoint info', () => {
            const prompt = getDebugSystemPrompt();
            expect(prompt).toContain('Exception breakpoints are automatic');
        });
    });

    describe('getDebugCapabilitiesSummary', () => {
        it('should return a concise summary', () => {
            const summary = getDebugCapabilitiesSummary();
            expect(summary).toContain('DAP');
            expect(summary).toContain('11 pattern matchers');
            expect(summary.length).toBeLessThan(500);
        });
    });
});
