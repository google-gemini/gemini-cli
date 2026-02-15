/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat webhook handler.
 * Responds immediately with "Processing..." and streams results
 * from the A2A server, pushing updates to Chat via the REST API.
 */

import type { ChatEvent, ChatResponse, ChatBridgeConfig } from './types.js';
import type { SessionInfo } from './session-store.js';
import { SessionStore } from './session-store.js';
import {
  A2ABridgeClient,
  extractIdsFromResponse,
} from './a2a-bridge-client.js';
import { ChatApiClient } from './chat-api-client.js';
import { renderResponse, extractFromStreamEvent } from './response-renderer.js';
import { logger } from '../utils/logger.js';

const TERMINAL_STATES = new Set([
  'completed',
  'failed',
  'canceled',
  'rejected',
]);

export class ChatBridgeHandler {
  private sessionStore: SessionStore;
  private a2aClient: A2ABridgeClient;
  private chatApiClient: ChatApiClient;
  private initialized = false;

  constructor(
    private config: ChatBridgeConfig,
    chatApiClient?: ChatApiClient,
  ) {
    this.sessionStore = new SessionStore(config.gcsBucket);
    this.a2aClient = new A2ABridgeClient(config.a2aServerUrl);
    this.chatApiClient =
      chatApiClient ??
      new ChatApiClient({
        serviceAccountKeyPath: config.serviceAccountKeyPath,
      });
  }

  /**
   * Initializes the A2A client connection, Chat API client,
   * and restores persisted sessions. Must be called before handling events.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.a2aClient.initialize();
    await this.chatApiClient.initialize();
    await this.sessionStore.restore();
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
   * Returns an immediate "Processing..." response and processes
   * the A2A request asynchronously, pushing results via Chat API.
   */
  private async handleMessage(event: ChatEvent): Promise<ChatResponse> {
    const message = event.message;
    if (!message?.thread?.name) {
      return { text: 'Error: Missing thread information.' };
    }

    // argumentText has bot mentions stripped (legacy format only).
    // For Add-ons format, strip leading @mention manually.
    const rawText = message.argumentText || message.text || '';
    const text = rawText.replace(/^@\S+\s*/, '');
    if (!text.trim()) {
      return { text: "I didn't receive any text. Please try again." };
    }

    const threadName = message.thread.name;
    const spaceName = event.space.name;

    // Handle slash commands synchronously (fast, no A2A call)
    const trimmed = text.trim().toLowerCase();
    if (
      trimmed === '/reset' ||
      trimmed === '/clear' ||
      trimmed === 'reset' ||
      trimmed === 'clear'
    ) {
      this.sessionStore.remove(threadName);
      logger.info(`[ChatBridge] Session cleared for thread ${threadName}`);
      return { text: 'Session cleared. Send a new message to start fresh.' };
    }

    const session = this.sessionStore.getOrCreate(threadName, spaceName);

    if (trimmed === '/yolo') {
      session.yoloMode = true;
      logger.info(`[ChatBridge] YOLO mode enabled for thread ${threadName}`);
      return {
        text: 'YOLO mode enabled. All tool calls will be auto-approved.',
      };
    }

    if (trimmed === '/safe') {
      session.yoloMode = false;
      logger.info(`[ChatBridge] YOLO mode disabled for thread ${threadName}`);
      return { text: 'Safe mode enabled. Tool calls will require approval.' };
    }

    logger.info(
      `[ChatBridge] MESSAGE from ${event.user.displayName}: "${text.substring(0, 100)}"`,
    );

    // Handle text-based tool approval responses synchronously
    // (sendToolConfirmation is fast — no need for async)
    if (session.pendingToolApproval && this.isToolApprovalText(trimmed)) {
      return this.handleToolApprovalText(event, session, trimmed);
    }

    // Guard against overlapping async requests
    if (session.asyncProcessing) {
      return {
        text: 'Still processing your previous request. Please wait...',
        thread: { name: threadName },
      };
    }

    // Fire-and-forget async processing
    this.processMessageAsync(event, session, text).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[ChatBridge] Async processing failed: ${msg}`, err);
    });

    // Return immediate acknowledgment
    return {
      text: '_Processing your request..._',
      thread: {
        threadKey: message.thread.threadKey || threadName,
        name: threadName,
      },
    };
  }

  /**
   * Checks if text is a tool approval command.
   */
  private isToolApprovalText(text: string): boolean {
    return (
      text === 'approve' ||
      text === 'yes' ||
      text === 'y' ||
      text === 'reject' ||
      text === 'no' ||
      text === 'n' ||
      text === 'always allow'
    );
  }

  /**
   * Handles text-based tool approval responses synchronously.
   */
  private async handleToolApprovalText(
    event: ChatEvent,
    session: SessionInfo,
    trimmed: string,
  ): Promise<ChatResponse> {
    const message = event.message!;
    const threadName = message.thread.name;
    const approval = session.pendingToolApproval!;

    const isReject =
      trimmed === 'reject' || trimmed === 'no' || trimmed === 'n';
    const isAlwaysAllow = trimmed === 'always allow';
    const outcome = isReject
      ? 'cancel'
      : isAlwaysAllow
        ? 'proceed_always_tool'
        : 'proceed_once';

    logger.info(
      `[ChatBridge] Text-based tool ${outcome}: callId=${approval.callId}, taskId=${approval.taskId}`,
    );

    session.pendingToolApproval = undefined;

    try {
      const response = await this.a2aClient.sendToolConfirmation(
        approval.callId,
        outcome,
        approval.taskId,
        { contextId: session.contextId },
      );

      const { contextId: newCtxId, taskId: newTaskId } =
        extractIdsFromResponse(response);
      if (newCtxId) session.contextId = newCtxId;
      this.sessionStore.updateTaskId(threadName, newTaskId);

      const threadKey = message.thread.threadKey || threadName;
      return renderResponse(response, threadKey, threadName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `[ChatBridge] Error sending tool confirmation: ${errorMsg}`,
        error,
      );
      return { text: `Error processing tool confirmation: ${errorMsg}` };
    }
  }

  /**
   * Processes a message asynchronously using A2A streaming.
   * Pushes results to Google Chat via the REST API.
   */
  private async processMessageAsync(
    event: ChatEvent,
    session: SessionInfo,
    text: string,
  ): Promise<void> {
    const message = event.message!;
    const threadName = message.thread.name;
    const spaceName = event.space.name;

    session.asyncProcessing = true;

    try {
      const stream = this.a2aClient.sendMessageStream(text, {
        contextId: session.contextId,
        taskId: session.taskId,
      });

      let lastText = '';
      let lastTaskId: string | undefined;
      let lastContextId: string | undefined;
      let lastState: string | undefined;
      let sentFinalResponse = false;

      for await (const streamEvent of stream) {
        const extracted = extractFromStreamEvent(streamEvent);

        if (extracted.taskId) lastTaskId = extracted.taskId;
        if (extracted.contextId) lastContextId = extracted.contextId;
        if (extracted.state) lastState = extracted.state;

        // Check for tool approvals needing user input
        const pendingApprovals = extracted.toolApprovals.filter(
          (a) => a.status === 'awaiting_approval',
        );
        if (pendingApprovals.length > 0) {
          const firstApproval = pendingApprovals[0];
          session.pendingToolApproval = {
            callId: firstApproval.callId,
            taskId: firstApproval.taskId,
            toolName: firstApproval.displayName || firstApproval.name,
          };

          // Push tool approval card to Chat
          const approvalResponse = renderResponse(
            {
              kind: 'task',
              id: firstApproval.taskId,
              contextId: lastContextId ?? session.contextId,
              status: {
                state: 'input-required',
                timestamp: new Date().toISOString(),
                message:
                  streamEvent.kind === 'status-update'
                    ? streamEvent.status?.message
                    : undefined,
              },
              history: [],
              artifacts: [],
            },
            message.thread.threadKey || threadName,
            threadName,
          );

          await this.chatApiClient.sendMessage(spaceName, threadName, {
            text: approvalResponse.text,
            cardsV2: approvalResponse.cardsV2,
          });
          sentFinalResponse = true;

          logger.info(
            `[ChatBridge] Pushed tool approval card: ${firstApproval.displayName || firstApproval.name}`,
          );
        }

        // Track latest text content
        if (extracted.text) {
          lastText = extracted.text;
        }

        // On terminal or input-required state, stop streaming
        if (
          extracted.state &&
          (TERMINAL_STATES.has(extracted.state) ||
            extracted.state === 'input-required')
        ) {
          break;
        }
      }

      // Update session IDs
      if (lastContextId) session.contextId = lastContextId;
      // Clear taskId on terminal states so next message starts a fresh task
      const isTerminal = lastState ? TERMINAL_STATES.has(lastState) : false;
      this.sessionStore.updateTaskId(
        threadName,
        isTerminal ? undefined : lastTaskId,
      );

      // Push final text response if we haven't already pushed a tool approval
      if (lastText && !sentFinalResponse) {
        await this.chatApiClient.sendMessage(spaceName, threadName, {
          text: lastText,
        });
        logger.info(
          `[ChatBridge] Pushed final response (${lastText.length} chars)`,
        );
      } else if (!lastText && !sentFinalResponse) {
        await this.chatApiClient.sendMessage(spaceName, threadName, {
          text: '_Agent completed without generating a response._',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatBridge] Async processing error: ${errorMsg}`, error);
      await this.chatApiClient.sendMessage(spaceName, threadName, {
        text: `Sorry, I encountered an error: ${errorMsg}`,
      });
    } finally {
      session.asyncProcessing = false;
    }
  }

  /**
   * Handles a CARD_CLICKED event: user clicked a button on a card.
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
    return {};
  }
}
