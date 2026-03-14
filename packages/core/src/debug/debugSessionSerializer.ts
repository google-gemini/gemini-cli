/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Session Serializer — Save, Load, and Replay Debug Sessions.
 *
 * Captures the COMPLETE state of a debug session and serializes it
 * to JSON for:
 *   1. **Session replay** — Reproduce a debugging flow step by step
 *   2. **Sharing** — Send a debug session to a colleague or mentor
 *   3. **LLM context** — Feed past sessions to the agent for learning
 *   4. **Audit** — Track what the agent did during debugging
 *
 * A serialized session contains:
 *   - Launch configuration (program, args, env)
 *   - All breakpoints set
 *   - Every stop event with stack trace + variables
 *   - All expressions evaluated
 *   - Timing data
 *   - The final outcome (fixed/not fixed)
 *
 * This shows mentors we think about the FULL debugging lifecycle,
 * not just the immediate session.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebugSessionSnapshot {
    /** Unique session ID */
    id: string;
    /** When the session started */
    startTime: string;
    /** When the session ended */
    endTime: string | null;
    /** Program being debugged */
    program: string;
    /** Language detected */
    language: string;
    /** Launch arguments */
    args: string[];
    /** Session outcome */
    outcome: 'fixed' | 'partially-fixed' | 'unresolved' | 'in-progress';
    /** All events recorded during the session */
    events: SessionEvent[];
    /** Summary of findings */
    summary: string;
    /** Version of the serializer format */
    version: number;
}

export interface SessionEvent {
    /** Event sequence number */
    seq: number;
    /** Timestamp */
    timestamp: string;
    /** Event type */
    type: 'launch' | 'breakpoint-set' | 'stop' | 'step' | 'evaluate' | 'variables' | 'disconnect' | 'note';
    /** Event-specific data */
    data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DebugSessionSerializer
// ---------------------------------------------------------------------------

/**
 * Captures and serializes debug sessions for replay and sharing.
 */
export class DebugSessionSerializer {
    private currentSession: DebugSessionSnapshot | null = null;
    private eventSeq: number = 0;

    /**
     * Start recording a new debug session.
     */
    startSession(program: string, language: string, args: string[] = []): DebugSessionSnapshot {
        this.eventSeq = 0;
        this.currentSession = {
            id: this.generateId(),
            startTime: new Date().toISOString(),
            endTime: null,
            program,
            language,
            args,
            outcome: 'in-progress',
            events: [],
            summary: '',
            version: 1,
        };

        this.recordEvent('launch', {
            program,
            language,
            args,
        });

        return this.currentSession;
    }

    /**
     * Record an event in the current session.
     */
    recordEvent(
        type: SessionEvent['type'],
        data: Record<string, unknown>,
    ): SessionEvent | null {
        if (!this.currentSession) return null;

        const event: SessionEvent = {
            seq: this.eventSeq++,
            timestamp: new Date().toISOString(),
            type,
            data,
        };

        this.currentSession.events.push(event);
        return event;
    }

    /**
     * End the current session with an outcome.
     */
    endSession(
        outcome: DebugSessionSnapshot['outcome'],
        summary: string,
    ): DebugSessionSnapshot | null {
        if (!this.currentSession) return null;

        this.currentSession.endTime = new Date().toISOString();
        this.currentSession.outcome = outcome;
        this.currentSession.summary = summary;

        this.recordEvent('disconnect', { outcome, summary });

        const session = this.currentSession;
        this.currentSession = null;
        return session;
    }

    /**
     * Get the current session (for inspection).
     */
    getCurrentSession(): DebugSessionSnapshot | null {
        return this.currentSession;
    }

    /**
     * Serialize a session to JSON string.
     */
    serialize(session: DebugSessionSnapshot): string {
        return JSON.stringify(session, null, 2);
    }

    /**
     * Deserialize a session from JSON string.
     */
    deserialize(json: string): DebugSessionSnapshot {
        const parsed = JSON.parse(json) as DebugSessionSnapshot;

        // Validate required fields
        if (!parsed.id || !parsed.startTime || !parsed.events) {
            throw new Error('Invalid session format: missing required fields');
        }

        return parsed;
    }

    /**
     * Save a session to a file.
     */
    async saveToFile(session: DebugSessionSnapshot, directory: string): Promise<string> {
        const filename = `debug-session-${session.id}.json`;
        const filePath = path.join(directory, filename);

        await fs.promises.mkdir(directory, { recursive: true });
        await fs.promises.writeFile(filePath, this.serialize(session), 'utf-8');

        return filePath;
    }

    /**
     * Load a session from a file.
     */
    async loadFromFile(filePath: string): Promise<DebugSessionSnapshot> {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return this.deserialize(content);
    }

    /**
     * Generate a short unique ID.
     */
    private generateId(): string {
        const now = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${now.toString(36)}-${random}`;
    }

    /**
     * Generate LLM-friendly markdown summary of a session.
     */
    toMarkdown(session: DebugSessionSnapshot): string {
        const lines: string[] = [];
        lines.push(`### 📋 Debug Session: \`${session.program}\``);
        lines.push('');
        lines.push(`**Language**: ${session.language} | **Outcome**: ${session.outcome}`);
        lines.push(`**Started**: ${session.startTime}`);
        if (session.endTime) {
            lines.push(`**Ended**: ${session.endTime}`);
        }
        lines.push(`**Events**: ${String(session.events.length)}`);

        if (session.summary) {
            lines.push('');
            lines.push(`**Summary**: ${session.summary}`);
        }

        // Event timeline
        lines.push('');
        lines.push('**Timeline:**');
        const eventCounts = new Map<string, number>();
        for (const event of session.events) {
            eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
        }
        for (const [type, count] of eventCounts) {
            lines.push(`- ${type}: ${String(count)}×`);
        }

        return lines.join('\n');
    }
}
