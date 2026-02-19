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
  type A2AStreamEventData,
  extractIdsFromResponse,
  extractAllParts,
  extractTextFromParts,
} from './a2a-bridge-client.js';
import { ChatApiClient } from './chat-api-client.js';
import {
  renderResponse,
  extractFromStreamEvent,
  extractToolApprovals,
} from './response-renderer.js';
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
   * Pushes a text message via Chat API (properly threaded) and returns
   * an empty webhook response. Add-ons createMessageAction ignores
   * thread info and always creates a top-level message in Spaces,
   * so ALL user-visible messages must go through the Chat API.
   */
  private pushAndReturn(
    spaceName: string,
    threadName: string,
    text: string,
  ): ChatResponse {
    this.chatApiClient
      .sendMessage(spaceName, threadName, { text })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`[ChatBridge] Failed to push message: ${msg}`);
      });
    return {};
  }

  /**
   * Handles a MESSAGE event: user sent a text message in Chat.
   * All responses are pushed via Chat API for proper threading in Spaces.
   * The webhook always returns an empty response.
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

    // Handle slash commands — push response via Chat API for threading
    const trimmed = text.trim().toLowerCase();
    if (
      trimmed === '/reset' ||
      trimmed === '/clear' ||
      trimmed === 'reset' ||
      trimmed === 'clear'
    ) {
      this.sessionStore.remove(threadName);
      logger.info(`[ChatBridge] Session cleared for thread ${threadName}`);
      return this.pushAndReturn(
        spaceName,
        threadName,
        'Session cleared. Send a new message to start fresh.',
      );
    }

    const session = this.sessionStore.getOrCreate(threadName, spaceName);

    if (trimmed === '/yolo') {
      session.yoloMode = true;
      logger.info(`[ChatBridge] YOLO mode enabled for thread ${threadName}`);
      return this.pushAndReturn(
        spaceName,
        threadName,
        'YOLO mode enabled. All tool calls will be auto-approved.',
      );
    }

    if (trimmed === '/safe') {
      session.yoloMode = false;
      logger.info(`[ChatBridge] YOLO mode disabled for thread ${threadName}`);
      return this.pushAndReturn(
        spaceName,
        threadName,
        'Safe mode enabled. Tool calls will require approval.',
      );
    }

    logger.info(
      `[ChatBridge] MESSAGE from ${event.user.displayName}: "${text.substring(0, 100)}"`,
    );

    // Handle text-based tool approval responses
    if (session.pendingToolApproval && this.isToolApprovalText(trimmed)) {
      return this.handleToolApprovalText(event, session, trimmed);
    }

    // Guard against overlapping async requests
    if (session.asyncProcessing) {
      return this.pushAndReturn(
        spaceName,
        threadName,
        'Still processing your previous request. Please wait...',
      );
    }

    // Fire-and-forget async processing
    this.processMessageAsync(event, session, text).catch((err) => {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[ChatBridge] Async processing failed: ${msg}`, err);
    });

    // Push "Processing..." via Chat API for proper threading
    return this.pushAndReturn(
      spaceName,
      threadName,
      '_Processing your request..._',
    );
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
   * Handles text-based tool approval responses.
   * Returns an immediate acknowledgment and processes the confirmation
   * asynchronously, pushing the agent's response via Chat API.
   */
  private handleToolApprovalText(
    event: ChatEvent,
    session: SessionInfo,
    trimmed: string,
  ): ChatResponse {
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

    // Fire-and-forget async processing of the tool confirmation
    this.processToolApprovalAsync(event, session, approval, outcome).catch(
      (err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(
          `[ChatBridge] Tool approval async processing failed: ${msg}`,
          err,
        );
      },
    );

    const ackText = isReject
      ? '_Tool rejected._'
      : '_Tool approved, processing..._';
    return this.pushAndReturn(event.space.name, threadName, ackText);
  }

  /**
   * Processes a tool confirmation asynchronously.
   * Sends the confirmation to the A2A server, handles the response,
   * and pushes results to Google Chat via the REST API.
   */
  private async processToolApprovalAsync(
    event: ChatEvent,
    session: SessionInfo,
    approval: { callId: string; taskId: string; toolName: string },
    outcome: string,
  ): Promise<void> {
    const message = event.message!;
    const threadName = message.thread.name;
    const spaceName = event.space.name;

    session.asyncProcessing = true;

    try {
      const response = await this.a2aClient.sendToolConfirmation(
        approval.callId,
        outcome,
        approval.taskId,
        { contextId: session.contextId },
      );

      if (session.cancelled) return;

      const { contextId: newCtxId, taskId: newTaskId } =
        extractIdsFromResponse(response);
      if (newCtxId) session.contextId = newCtxId;
      this.sessionStore.updateTaskId(threadName, newTaskId);

      // Check for new pending approvals in the response
      const newApprovals = extractToolApprovals(response).filter(
        (a) => a.status === 'awaiting_approval',
      );

      if (session.yoloMode && newApprovals.length > 0) {
        // YOLO: auto-approve any new tools
        const autoResult = await this.autoApproveTools(
          session,
          newApprovals,
          session.contextId,
        );
        if (autoResult.lastContextId)
          session.contextId = autoResult.lastContextId;
        if (autoResult.lastTaskId !== undefined) {
          const isTerminal = autoResult.lastState
            ? TERMINAL_STATES.has(autoResult.lastState)
            : false;
          this.sessionStore.updateTaskId(
            threadName,
            isTerminal ? undefined : autoResult.lastTaskId,
          );
        }
        if (autoResult.text) {
          await this.chatApiClient.sendMessage(spaceName, threadName, {
            text: autoResult.text,
          });
        }
      } else if (newApprovals.length > 0) {
        // Non-YOLO: push new approval card
        session.pendingToolApproval = {
          callId: newApprovals[0].callId,
          taskId: newApprovals[0].taskId,
          toolName: newApprovals[0].displayName || newApprovals[0].name,
        };
        const rendered = renderResponse(
          response,
          message.thread.threadKey || threadName,
          threadName,
        );
        await this.chatApiClient.sendMessage(spaceName, threadName, {
          text: rendered.text,
          cardsV2: rendered.cardsV2,
        });
        logger.info(
          `[ChatBridge] Pushed new approval card after confirmation: ${newApprovals[0].displayName || newApprovals[0].name}`,
        );
      } else {
        // No more approvals — push the agent's response
        const rendered = renderResponse(response);
        const responseText = rendered.text || '_Agent completed._';
        await this.chatApiClient.sendMessage(spaceName, threadName, {
          text: responseText,
        });
        logger.info(
          `[ChatBridge] Pushed post-approval response (${responseText.length} chars)`,
        );
      }
    } catch (error) {
      if (session.cancelled) return;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `[ChatBridge] Error in tool approval async: ${errorMsg}`,
        error,
      );
      await this.chatApiClient.sendMessage(spaceName, threadName, {
        text: `Error processing tool confirmation: ${errorMsg}`,
      });
    } finally {
      session.asyncProcessing = false;
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
      // Retry streaming if the A2A server returns 500 (no available instance).
      // With concurrency=1, this happens when another request is in-flight.
      const stream = await this.retryStream(
        () =>
          this.a2aClient.sendMessageStream(text, {
            contextId: session.contextId,
            taskId: session.taskId,
          }),
        session,
      );

      let lastText = '';
      let lastTaskId: string | undefined;
      let lastContextId: string | undefined;
      let lastState: string | undefined;
      let sentFinalResponse = false;

      for await (const streamEvent of stream) {
        // Check if session was cancelled (e.g. by /reset)
        if (session.cancelled) {
          logger.info(
            `[ChatBridge] Session cancelled, stopping stream for ${threadName}`,
          );
          break;
        }

        const extracted = extractFromStreamEvent(streamEvent);

        if (extracted.taskId) lastTaskId = extracted.taskId;
        if (extracted.contextId) lastContextId = extracted.contextId;
        if (extracted.state) lastState = extracted.state;

        // Check for tool approvals needing user input
        const pendingApprovals = extracted.toolApprovals.filter(
          (a) => a.status === 'awaiting_approval',
        );
        if (pendingApprovals.length > 0) {
          // YOLO mode: auto-approve all tools without user interaction
          if (session.yoloMode) {
            const autoApproved = await this.autoApproveTools(
              session,
              pendingApprovals,
              lastContextId,
            );
            if (autoApproved.lastContextId)
              lastContextId = autoApproved.lastContextId;
            if (autoApproved.lastTaskId) lastTaskId = autoApproved.lastTaskId;
            if (autoApproved.lastState) lastState = autoApproved.lastState;
            if (autoApproved.text) lastText = autoApproved.text;
            // Auto-approval loop handles everything; break out of stream
            break;
          }

          // Non-YOLO: push approval card and wait for user input
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
          // Break immediately — the server is waiting for the client to
          // respond to the approval. If we keep waiting for stream events,
          // asyncProcessing stays true and the user's "approve" message
          // hits the async guard.
          break;
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

      // If session was cancelled, don't push any messages
      if (session.cancelled) {
        logger.info(
          `[ChatBridge] Skipping response push for cancelled session ${threadName}`,
        );
        return;
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
      if (session.cancelled) return; // Don't push errors for cancelled sessions
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
   * Retries creating a stream when the A2A server returns 500.
   * Cloud Run returns 500 "no available instance" when concurrency is
   * exhausted. We retry with exponential backoff up to 3 times.
   */
  private async retryStream(
    createStream: () => AsyncGenerator<A2AStreamEventData, void, undefined>,
    session: SessionInfo,
  ): Promise<AsyncGenerator<A2AStreamEventData, void, undefined>> {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 5000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (session.cancelled) return createStream(); // will be caught by caller
      try {
        const stream = createStream();
        // Try to get the first value to verify the stream connects
        const iter = stream[Symbol.asyncIterator]();
        const first = await iter.next();

        // Re-wrap into an async generator that yields the first value
        // then delegates to the rest of the iterator
        async function* replayStream(): AsyncGenerator<
          A2AStreamEventData,
          void,
          undefined
        > {
          if (!first.done) {
            yield first.value;
            yield* { [Symbol.asyncIterator]: () => iter };
          }
        }
        return replayStream();
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        const isRetryable = msg.includes('500') || msg.includes('503');
        if (!isRetryable || attempt === MAX_RETRIES) throw error;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          `[ChatBridge] A2A server unavailable, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    // Should not reach here, but just in case
    return createStream();
  }

  /**
   * Auto-approves tool calls in YOLO mode.
   * Sends all pending approvals in a single batch message to avoid hanging
   * when the agent needs ALL tools approved before proceeding.
   * Loops if the response contains further approval requests.
   */
  private async autoApproveTools(
    session: SessionInfo,
    initialApprovals: Array<{
      callId: string;
      taskId: string;
      name: string;
      displayName: string;
    }>,
    contextId: string | undefined,
  ): Promise<{
    lastContextId?: string;
    lastTaskId?: string;
    lastState?: string;
    text?: string;
  }> {
    let approvalsToProcess = initialApprovals;
    let lastContextId = contextId;
    let lastTaskId: string | undefined;
    let lastState: string | undefined;
    let lastText: string | undefined;
    const approvedNames: string[] = [];
    const MAX_ROUNDS = 10;

    for (let round = 0; round < MAX_ROUNDS && !session.cancelled; round++) {
      if (approvalsToProcess.length === 0) break;

      // Log what we're approving
      for (const a of approvalsToProcess) {
        const label = a.displayName || a.name;
        logger.info(`[ChatBridge] YOLO auto-approving: ${label}`);
        approvedNames.push(label);
      }

      // Send ALL approvals in a single batch message
      const response = await this.a2aClient.sendBatchToolConfirmations(
        approvalsToProcess.map((a) => ({
          callId: a.callId,
          outcome: 'proceed_once',
          taskId: a.taskId,
        })),
        { contextId: lastContextId ?? session.contextId },
      );

      const { contextId: newCtxId, taskId: newTaskId } =
        extractIdsFromResponse(response);
      if (newCtxId) lastContextId = newCtxId;
      if (newTaskId) lastTaskId = newTaskId;

      if (response.kind === 'task' && response.status?.state) {
        lastState = response.status.state;
      }

      // Extract text from this response
      const responseParts = extractAllParts(response);
      const responseText = extractTextFromParts(responseParts);
      if (responseText) lastText = responseText;

      // Break if terminal
      if (lastState && TERMINAL_STATES.has(lastState)) break;

      // Check for more pending approvals
      const newApprovals = extractToolApprovals(response).filter(
        (a) => a.status === 'awaiting_approval',
      );
      approvalsToProcess = newApprovals;
    }

    logger.info(
      `[ChatBridge] YOLO auto-approved ${approvedNames.length} tools: ${approvedNames.join(', ')}`,
    );

    return { lastContextId, lastTaskId, lastState, text: lastText };
  }

  /**
   * Handles a CARD_CLICKED event: user clicked a button on a card.
   * Fires async processing and returns an immediate UPDATE_MESSAGE ack.
   */
  private handleCardClicked(event: ChatEvent): ChatResponse {
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
      const params = action.parameters || [];
      const paramMap = new Map(params.map((p) => [p.key, p.value]));
      const callId = paramMap.get('callId');
      const outcome = paramMap.get('outcome');
      const taskId = paramMap.get('taskId');

      if (!callId || !outcome || !taskId) {
        return { text: 'Error: Missing tool confirmation parameters.' };
      }

      const isReject = outcome === 'cancel';
      const toolName = session.pendingToolApproval?.toolName ?? 'Tool';

      // Clear pending approval tracked for text-based flow
      session.pendingToolApproval = undefined;

      // Fire-and-forget async processing
      this.processToolApprovalAsync(
        event,
        session,
        { callId, taskId, toolName },
        outcome,
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`[ChatBridge] Card click async failed: ${msg}`, err);
      });

      // Update the card in-place with an acknowledgment
      return {
        actionResponse: { type: 'UPDATE_MESSAGE' },
        text: isReject
          ? `*${toolName} — Rejected*`
          : `*${toolName} — Approved, processing...*`,
      };
    }

    return { text: `Unknown action: ${action.actionMethodName}` };
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
