/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Policy Guard — Security-Aware Debugging.
 *
 * Critical security layer between the agent and debug tools.
 *
 * The debug tools include operations that are equivalent to
 * arbitrary code execution:
 *   - `debug_launch` spawns a process
 *   - `debug_evaluate` runs arbitrary expressions in the debuggee
 *   - `debug_set_breakpoint` with logpoints can log sensitive data
 *
 * This guard integrates with the existing policy engine pattern
 * (similar to how `run_in_terminal` requires user approval) to:
 *   1. Classify each debug action by risk level
 *   2. Require explicit user approval for high-risk actions
 *   3. Log all debug actions for audit trail
 *   4. Validate inputs to prevent path traversal and injection
 *
 * From the idea7-analysis:
 * > Add `debug` to the tool policy system (same as `shell`)
 * > Require explicit user approval before `debug_launch` and `debug_evaluate`
 * > The `debug_evaluate` action is essentially arbitrary code execution
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyDecision {
    /** Whether the action is allowed */
    allowed: boolean;
    /** Risk level of the action */
    risk: RiskLevel;
    /** Human-readable reason */
    reason: string;
    /** Whether user approval is required */
    requiresApproval: boolean;
    /** Sanitized version of the params (sensitive data redacted) */
    sanitizedParams: Record<string, unknown>;
}

export interface PolicyConfig {
    /** Allow debug_launch without user approval */
    allowLaunchWithoutApproval: boolean;
    /** Allow debug_evaluate without user approval */
    allowEvaluateWithoutApproval: boolean;
    /** Blocked file path patterns (prevent debugging system files) */
    blockedPaths: RegExp[];
    /** Max expression length for debug_evaluate */
    maxExpressionLength: number;
    /** Whether to allow network-related debugger connections */
    allowRemoteDebug: boolean;
}

// ---------------------------------------------------------------------------
// Default Policy
// ---------------------------------------------------------------------------

const DEFAULT_POLICY: PolicyConfig = {
    allowLaunchWithoutApproval: false,
    allowEvaluateWithoutApproval: false,
    blockedPaths: [
        /\/etc\//,
        /\/proc\//,
        /\/sys\//,
        /\.ssh\//,
        /\.env$/,
        /credentials/i,
        /secret/i,
        /password/i,
    ],
    maxExpressionLength: 1000,
    allowRemoteDebug: false,
};

// ---------------------------------------------------------------------------
// DebugPolicyGuard
// ---------------------------------------------------------------------------

/**
 * Security policy guard for debug operations.
 *
 * Usage:
 * ```ts
 * const guard = new DebugPolicyGuard();
 * const decision = guard.evaluate('debug_launch', { program: 'app.js' });
 * if (!decision.allowed && decision.requiresApproval) {
 *   // Ask user for approval
 * }
 * ```
 */
export class DebugPolicyGuard {
    private readonly config: PolicyConfig;

    constructor(config?: Partial<PolicyConfig>) {
        this.config = { ...DEFAULT_POLICY, ...config };
    }

    /**
     * Evaluate whether a debug action is allowed.
     */
    evaluate(action: string, params: Record<string, unknown>): PolicyDecision {
        const sanitizedParams = this.sanitizeParams(params);

        switch (action) {
            case 'debug_launch':
                return this.evaluateLaunch(params, sanitizedParams);
            case 'debug_evaluate':
                return this.evaluateExpression(params, sanitizedParams);
            case 'debug_set_breakpoint':
                return this.evaluateBreakpoint(params, sanitizedParams);
            case 'debug_attach':
                return this.evaluateAttach(params, sanitizedParams);
            default:
                // Read-only operations (get_stacktrace, get_variables, step, disconnect)
                return {
                    allowed: true,
                    risk: 'low',
                    reason: 'Read-only debug operation',
                    requiresApproval: false,
                    sanitizedParams,
                };
        }
    }

    /**
     * Validate a file path for debugging.
     */
    isPathAllowed(filePath: string): boolean {
        return !this.config.blockedPaths.some((pattern) => pattern.test(filePath));
    }

    /**
     * Evaluate debug_launch — spawns a process (HIGH RISK).
     */
    private evaluateLaunch(
        params: Record<string, unknown>,
        sanitizedParams: Record<string, unknown>,
    ): PolicyDecision {
        const program = String(params['program'] ?? '');

        // Check for blocked paths
        if (!this.isPathAllowed(program)) {
            return {
                allowed: false,
                risk: 'critical',
                reason: `Blocked path: debugging ${program} is not allowed for security reasons`,
                requiresApproval: false,
                sanitizedParams,
            };
        }

        // Check for remote debugging
        const port = params['port'];
        if (port && !this.config.allowRemoteDebug) {
            const host = String(params['host'] ?? 'localhost');
            if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0') {
                return {
                    allowed: false,
                    risk: 'critical',
                    reason: `Remote debugging to ${host} is not allowed`,
                    requiresApproval: false,
                    sanitizedParams,
                };
            }
        }

        return {
            allowed: this.config.allowLaunchWithoutApproval,
            risk: 'high',
            reason: `debug_launch spawns a process — equivalent to shell execution`,
            requiresApproval: !this.config.allowLaunchWithoutApproval,
            sanitizedParams,
        };
    }

    /**
     * Evaluate debug_evaluate — arbitrary expression execution (CRITICAL).
     */
    private evaluateExpression(
        params: Record<string, unknown>,
        sanitizedParams: Record<string, unknown>,
    ): PolicyDecision {
        const expression = String(params['expression'] ?? '');

        // Check expression length
        if (expression.length > this.config.maxExpressionLength) {
            return {
                allowed: false,
                risk: 'critical',
                reason: `Expression too long (${String(expression.length)} chars, max ${String(this.config.maxExpressionLength)})`,
                requiresApproval: false,
                sanitizedParams,
            };
        }

        // Check for dangerous patterns
        const dangerousPatterns = [
            /require\s*\(\s*['"]child_process['"]\s*\)/,
            /exec\s*\(/,
            /spawn\s*\(/,
            /eval\s*\(/,
            /Function\s*\(/,
            /process\.exit/,
            /fs\.(unlink|rmdir|rm|writeFile)/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return {
                    allowed: false,
                    risk: 'critical',
                    reason: `Expression contains dangerous pattern: ${pattern.source}`,
                    requiresApproval: false,
                    sanitizedParams,
                };
            }
        }

        return {
            allowed: this.config.allowEvaluateWithoutApproval,
            risk: 'high',
            reason: `debug_evaluate executes arbitrary code in the debuggee context`,
            requiresApproval: !this.config.allowEvaluateWithoutApproval,
            sanitizedParams,
        };
    }

    /**
     * Evaluate debug_set_breakpoint — medium risk for logpoints.
     */
    private evaluateBreakpoint(
        params: Record<string, unknown>,
        sanitizedParams: Record<string, unknown>,
    ): PolicyDecision {
        const file = String(params['file'] ?? '');

        if (!this.isPathAllowed(file)) {
            return {
                allowed: false,
                risk: 'high',
                reason: `Cannot set breakpoint in blocked path: ${file}`,
                requiresApproval: false,
                sanitizedParams,
            };
        }

        // Logpoints execute in the debuggee — medium risk
        if (params['log_message']) {
            return {
                allowed: true,
                risk: 'medium',
                reason: 'Logpoint breakpoint — executes expression in debuggee context',
                requiresApproval: false,
                sanitizedParams,
            };
        }

        return {
            allowed: true,
            risk: 'low',
            reason: 'Standard breakpoint',
            requiresApproval: false,
            sanitizedParams,
        };
    }

    /**
     * Evaluate debug_attach — connecting to a running process.
     */
    private evaluateAttach(
        _params: Record<string, unknown>,
        sanitizedParams: Record<string, unknown>,
    ): PolicyDecision {
        return {
            allowed: false,
            risk: 'high',
            reason: 'debug_attach connects to a running process — requires user approval',
            requiresApproval: true,
            sanitizedParams,
        };
    }

    /**
     * Sanitize parameters for logging (redact sensitive values).
     */
    private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};
        const sensitiveKeys = ['password', 'secret', 'token', 'key', 'credential'];

        for (const [key, value] of Object.entries(params)) {
            if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Generate LLM-friendly summary of the security policy.
     */
    toMarkdown(): string {
        const lines: string[] = [];
        lines.push('### 🔒 Debug Security Policy');
        lines.push('');
        lines.push('| Action | Risk | Approval Required |');
        lines.push('|--------|------|-------------------|');
        lines.push(`| debug_launch | High | ${this.config.allowLaunchWithoutApproval ? 'No' : '**Yes**'} |`);
        lines.push(`| debug_evaluate | High | ${this.config.allowEvaluateWithoutApproval ? 'No' : '**Yes**'} |`);
        lines.push('| debug_attach | High | **Yes** |');
        lines.push('| debug_set_breakpoint | Low-Med | No |');
        lines.push('| debug_get_* / debug_step | Low | No |');
        lines.push('| debug_disconnect | Low | No |');
        lines.push('');
        lines.push(`**Remote debugging**: ${this.config.allowRemoteDebug ? 'Allowed' : 'Blocked'}`);
        lines.push(`**Max expression length**: ${String(this.config.maxExpressionLength)} chars`);

        return lines.join('\n');
    }
}
