/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat webhook handler.
 * Processes incoming Google Chat events, forwards them to the A2A server,
 * and converts responses back to Google Chat format.
 */

import type { ChatEvent, ChatResponse, ChatBridgeConfig } from './types.js';
import { SessionStore } from './session-store.js';
import {
  A2ABridgeClient,
  extractIdsFromResponse,
} from './a2a-bridge-client.js';
import { renderResponse } from './response-renderer.js';
import { logger } from '../utils/logger.js';

export class ChatBridgeHandler {
  private sessionStore: SessionStore;
  private a2aClient: A2ABridgeClient;
  private initialized = false;

  constructor(private config: ChatBridgeConfig) {
    this.sessionStore = new SessionStore();
    this.a2aClient = new A2ABridgeClient(config.a2aServerUrl);
  }

  /**
   * Initializes the A2A client connection.
   * Must be called before handling events.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.a2aClient.initialize();
    this.initialized = true;
    logger.info(
      `[ChatBridge] Handler initialized, connected to ${this.config.a2aServerUrl}`,
    );
  }

  /**
   * Main entry point for handling Google Chat webhook events.
   */
  async handleEvent(event: ChatEvent): Promise<ChatResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info(
      `[ChatBridge] Received event: type=${event.type}, space=${event.space.name}`,
    );

    switch (event.type) {
      case 'MESSAGE':
        return this.handleMessage(event);
      case 'CARD_CLICKED':
        return this.handleCardClicked(event);
      case 'ADDED_TO_SPACE':
        return this.handleAddedToSpace(event);
      case 'REMOVED_FROM_SPACE':
        return this.handleRemovedFromSpace(event);
      default:
        logger.warn(`[ChatBridge] Unknown event type: ${event.type}`);
        return { text: 'Unknown event type.' };
    }
  }

  /**
   * Handles a MESSAGE event: user sent a text message in Chat.
   */
  private async handleMessage(event: ChatEvent): Promise<ChatResponse> {
    const message = event.message;
    if (!message?.thread?.name) {
      return { text: 'Error: Missing thread information.' };
    }

    const text = message.argumentText || message.text || '';
    if (!text.trim()) {
      return { text: "I didn't receive any text. Please try again." };
    }

    const threadName = message.thread.name;
    const spaceName = event.space.name;
    const session = this.sessionStore.getOrCreate(threadName, spaceName);

    logger.info(
      `[ChatBridge] MESSAGE from ${event.user.displayName}: "${text.substring(0, 100)}"`,
    );

    try {
      const response = await this.a2aClient.sendMessage(text, {
        contextId: session.contextId,
        taskId: session.taskId,
      });

      // Update session with new IDs from response
      const { contextId, taskId } = extractIdsFromResponse(response);
      if (contextId) {
        session.contextId = contextId;
      }
      this.sessionStore.updateTaskId(threadName, taskId);

      // Convert A2A response to Chat format
      const threadKey = message.thread.threadKey || threadName;
      return renderResponse(response, threadKey);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatBridge] Error handling message: ${errorMsg}`, error);
      return {
        text: `Sorry, I encountered an error processing your request: ${errorMsg}`,
      };
    }
  }

  /**
   * Handles a CARD_CLICKED event: user clicked a button on a card.
   * Used for tool approval/rejection flows.
   */
  private async handleCardClicked(event: ChatEvent): Promise<ChatResponse> {
    const action = event.action;
    if (!action) {
      return { text: 'Error: Missing action data.' };
    }

    const threadName = event.message?.thread?.name;
    if (!threadName) {
      return { text: 'Error: Missing thread information.' };
    }

    const session = this.sessionStore.get(threadName);
    if (!session) {
      return { text: 'Error: No active session found for this thread.' };
    }

    logger.info(
      `[ChatBridge] CARD_CLICKED: function=${action.actionMethodName}`,
    );

    if (action.actionMethodName === 'tool_confirmation') {
      return this.handleToolConfirmation(event, session.contextId);
    }

    return { text: `Unknown action: ${action.actionMethodName}` };
  }

  /**
   * Handles tool confirmation actions from card button clicks.
   */
  private async handleToolConfirmation(
    event: ChatEvent,
    contextId: string,
  ): Promise<ChatResponse> {
    const params = event.action?.parameters || [];
    const paramMap = new Map(params.map((p) => [p.key, p.value]));

    const callId = paramMap.get('callId');
    const outcome = paramMap.get('outcome');
    const taskId = paramMap.get('taskId');

    if (!callId || !outcome || !taskId) {
      return { text: 'Error: Missing tool confirmation parameters.' };
    }

    logger.info(
      `[ChatBridge] Tool confirmation: callId=${callId}, outcome=${outcome}, taskId=${taskId}`,
    );

    try {
      const response = await this.a2aClient.sendToolConfirmation(
        callId,
        outcome,
        taskId,
        { contextId },
      );

      // Update session
      const threadName = event.message?.thread?.name;
      if (threadName) {
        const { contextId: newContextId, taskId: newTaskId } =
          extractIdsFromResponse(response);
        if (newContextId) {
          const session = this.sessionStore.get(threadName);
          if (session) session.contextId = newContextId;
        }
        this.sessionStore.updateTaskId(threadName, newTaskId);
      }

      return renderResponse(response);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `[ChatBridge] Error sending tool confirmation: ${errorMsg}`,
        error,
      );
      return {
        text: `Error processing tool confirmation: ${errorMsg}`,
      };
    }
  }

  /**
   * Handles ADDED_TO_SPACE event: bot was added to a space or DM.
   */
  private handleAddedToSpace(event: ChatEvent): ChatResponse {
    const spaceType = event.space.type === 'DM' ? 'DM' : 'space';
    logger.info(`[ChatBridge] Bot added to ${spaceType}: ${event.space.name}`);
    return {
      text:
        `Hello! I'm the Gemini CLI Agent. Send me a message to get started with code generation and development tasks.\n\n` +
        `I can:\n` +
        `- Generate code from natural language\n` +
        `- Edit files and run commands\n` +
        `- Answer questions about code\n\n` +
        `I'll ask for your approval before executing tools.`,
    };
  }

  /**
   * Handles REMOVED_FROM_SPACE event: bot was removed from a space.
   */
  private handleRemovedFromSpace(event: ChatEvent): ChatResponse {
    logger.info(`[ChatBridge] Bot removed from space: ${event.space.name}`);
    // Clean up any sessions for this space
    return {};
  }
}
