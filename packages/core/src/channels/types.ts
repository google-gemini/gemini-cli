/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Payload for the 'channel-message' event, emitted when an MCP server
 * declaring the `gemini/channel` experimental capability sends a
 * `notifications/gemini/channel` notification.
 */
export interface ChannelMessagePayload {
  /** Name of the MCP server acting as the channel. */
  channelName: string;
  /** Sender identifier (e.g. Telegram username, Discord user ID). */
  sender: string;
  /** The message body. */
  content: string;
  /** Unix epoch milliseconds when the message was received. */
  timestamp: number;
  /** Optional correlation ID for two-way channel replies. */
  replyTo?: string;
  /** Extra key-value pairs surfaced as XML attributes on the <channel> tag. */
  metadata?: Record<string, string>;
}

/**
 * Describes the channel capability advertised by an MCP server via
 * `capabilities.experimental['gemini/channel']`.
 */
export interface ChannelCapability {
  /** Whether this channel exposes MCP tools for replying (two-way). */
  supportsReply: boolean;
  /** Human-readable name for the channel (defaults to MCP server name). */
  displayName?: string;
}

/**
 * Simple registry tracking which MCP servers have declared channel capability.
 * Populated by McpClient.registerNotificationHandlers().
 */
export const activeChannels = new Map<string, ChannelCapability>();

/**
 * Returns the names of all MCP servers currently registered as channels.
 */
export function getActiveChannelNames(): string[] {
  return Array.from(activeChannels.keys());
}
