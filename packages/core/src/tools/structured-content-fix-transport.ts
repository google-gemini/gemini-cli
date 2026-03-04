/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
    JSONRPCMessage,
    JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'node:events';

/**
 * A wrapper transport that intercepts MCP tool call responses and populates
 * `structuredContent` from JSON text content when missing.
 *
 * Issue: Many MCP servers return tool results in `content` (as stringified
 * JSON text) but omit `structuredContent` when the tool has an output schema.
 * The MCP SDK validates that `structuredContent` is present for tools with
 * `outputSchema`, causing error -32600.
 *
 * Fix: Parse the first text content item as JSON and populate
 * `structuredContent` if it is missing. This is safe because:
 * - It only triggers when `structuredContent` is absent
 * - If parsing fails (plain text), it silently ignores
 * - Existing `structuredContent` is never overwritten
 */
export class StructuredContentFixTransport
    extends EventEmitter
    implements Transport {
    constructor(private readonly transport: Transport) {
        super();

        // Forward messages from the underlying transport
        this.transport.onmessage = (message) => {
            this.handleMessage(message);
        };

        this.transport.onclose = () => {
            this.onclose?.();
        };

        this.transport.onerror = (error) => {
            this.onerror?.(error);
        };
    }

    // Transport interface implementation
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;

    async start(): Promise<void> {
        await this.transport.start();
    }

    async close(): Promise<void> {
        await this.transport.close();
    }

    async send(message: JSONRPCMessage): Promise<void> {
        await this.transport.send(message);
    }

    private handleMessage(message: JSONRPCMessage) {
        if (this.isJsonResponse(message)) {
            this.fixStructuredContent(message);
        }
        this.onmessage?.(message);
    }

    private isJsonResponse(message: JSONRPCMessage): message is JSONRPCResponse {
        return 'result' in message || 'error' in message;
    }

    private fixStructuredContent(response: JSONRPCResponse) {
        if (!('result' in response)) return;

        // We can cast because we verified 'result' is in response,
        // but TS might still be picky if the type is a strict union.
        // Let's treat it safely.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
        const result = response.result as any;

        // Check if we have content but missing structuredContent
        if (
            result.content &&
            Array.isArray(result.content) &&
            result.content.length > 0 &&
            !result.structuredContent
        ) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const firstItem = result.content[0];
            if (firstItem.type === 'text' && typeof firstItem.text === 'string') {
                try {
                    // Attempt to parse the text as JSON
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const parsed = JSON.parse(firstItem.text);
                    // If successful, populate structuredContent
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    result.structuredContent = parsed;
                } catch (_) {
                    // Ignored: Content is likely plain text, not JSON.
                }
            }
        }
    }
}
