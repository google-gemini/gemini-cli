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
  /** Full webhook URL for card button actions (HTTP Add-ons need a URL, not a function name). */
  private webhookUrl: string | undefined;

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
    // For HTTP Add-ons, card button action.function must be a full HTTPS URL.
    // Set CHAT_WEBHOOK_URL env var to the bridge's public webhook endpoint.
    this.webhookUrl = process.env['CHAT_WEBHOOK_URL'] || undefined;
    if (this.webhookUrl) {
      logger.info(`[ChatBridge] Button action URL: ${this.webhookUrl}`);
    }
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
      // Stream the tool confirmation to collect text as it arrives
      const stream = this.a2aClient.sendToolConfirmationStream(
        approval.callId,
        outcome,
        approval.taskId,
        { contextId: session.contextId },
      );

      let lastText = '';
      let lastTaskId: string | undefined;
      let lastContextId: string | undefined;
      let lastState: string | undefined;
      let sentResponse = false;

      for await (const streamEvent of stream) {
        if (session.cancelled) break;

        const extracted = extractFromStreamEvent(streamEvent);
        if (extracted.taskId) lastTaskId = extracted.taskId;
        if (extracted.contextId) lastContextId = extracted.contextId;
        if (extracted.state) lastState = extracted.state;
        if (extracted.text) lastText = extracted.text;

        // Check for new tool approvals
        const pending = extracted.toolApprovals.filter(
          (a) => a.status === 'awaiting_approval',
        );
        if (pending.length > 0) {
          if (session.yoloMode) {
            // YOLO: auto-approve via streaming
            const autoResult = await this.autoApproveTools(
              session,
              pending,
              lastContextId,
            );
            if (autoResult.lastContextId)
              lastContextId = autoResult.lastContextId;
            if (autoResult.lastTaskId) lastTaskId = autoResult.lastTaskId;
            if (autoResult.lastState) lastState = autoResult.lastState;
            if (autoResult.text) lastText = autoResult.text;
          } else {
            // Non-YOLO: push approval card
            session.pendingToolApproval = {
              callId: pending[0].callId,
              taskId: pending[0].taskId,
              toolName: pending[0].displayName || pending[0].name,
            };
            // Build a minimal task response for the card renderer
            const cardResponse = renderResponse(
              {
                kind: 'task',
                id: pending[0].taskId,
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
              this.webhookUrl,
            );
            await this.chatApiClient.sendMessage(spaceName, threadName, {
              text: cardResponse.text,
              cardsV2: cardResponse.cardsV2,
            });
            sentResponse = true;
            logger.info(
              `[ChatBridge] Pushed approval card after confirmation: ${pending[0].displayName || pending[0].name}`,
            );
          }
          break;
        }
      }

      if (session.cancelled) return;

      // Update session IDs
      if (lastContextId) session.contextId = lastContextId;
      const isTerminal = lastState ? TERMINAL_STATES.has(lastState) : false;
      this.sessionStore.updateTaskId(
        threadName,
        isTerminal ? undefined : lastTaskId,
      );

      // Push final text if we haven't already pushed a card
      if (lastText && !sentResponse) {
        await this.chatApiClient.sendMessage(spaceName, threadName, {
          text: lastText,
        });
        logger.info(
          `[ChatBridge] Pushed post-approval response (${lastText.length} chars): "${lastText.substring(0, 200)}"`,
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

      let eventCount = 0;
      // Track the latest pending approvals across events — only act on them
      // when the server signals input-required (meaning it actually needs input).
      // In server YOLO mode, tools are auto-approved so the stream continues
      // past the brief 'awaiting_approval' status without hitting input-required.
      let latestPendingApprovals: Array<{
        callId: string;
        taskId: string;
        name: string;
        displayName: string;
      }> = [];
      let approvalStatusMessage: unknown;

      for await (const streamEvent of stream) {
        // Check if session was cancelled (e.g. by /reset)
        if (session.cancelled) {
          logger.info(
            `[ChatBridge] Session cancelled, stopping stream for ${threadName}`,
          );
          break;
        }

        eventCount++;
        const extracted = extractFromStreamEvent(streamEvent);

        if (extracted.taskId) lastTaskId = extracted.taskId;
        if (extracted.contextId) lastContextId = extracted.contextId;
        if (extracted.state) lastState = extracted.state;

        // Log each event for debugging
        logger.info(
          `[ChatBridge] Stream event #${eventCount}: kind=${streamEvent.kind}, ` +
            `state=${extracted.state ?? 'n/a'}, text=${extracted.text.length} chars, ` +
            `approvals=${extracted.toolApprovals.filter((a) => a.status === 'awaiting_approval').length}`,
        );

        // Track latest text content
        if (extracted.text) {
          lastText = extracted.text;
        }

        // Track tool approvals — always update with latest state so
        // stale approvals are cleared when the server auto-approves.
        const pending = extracted.toolApprovals.filter(
          (a) => a.status === 'awaiting_approval',
        );
        latestPendingApprovals = pending;
        if (pending.length > 0) {
          approvalStatusMessage =
            streamEvent.kind === 'status-update'
              ? streamEvent.status?.message
              : undefined;
        }

        // On terminal or input-required state, stop streaming.
        // input-required means the server is asking for user action
        // (tool approval or follow-up message).
        if (
          extracted.state &&
          (TERMINAL_STATES.has(extracted.state) ||
            extracted.state === 'input-required')
        ) {
          break;
        }
      }

      logger.info(
        `[ChatBridge] Stream complete: ${eventCount} events, ` +
          `state=${lastState ?? 'none'}, text=${lastText.length} chars, ` +
          `pendingApprovals=${latestPendingApprovals.length}`,
      );

      // Handle pending approvals (only relevant when server sent input-required)
      if (latestPendingApprovals.length > 0 && lastState === 'input-required') {
        if (session.yoloMode) {
          // Bridge YOLO mode: auto-approve all tools
          const autoApproved = await this.autoApproveTools(
            session,
            latestPendingApprovals,
            lastContextId,
          );
          if (autoApproved.lastContextId)
            lastContextId = autoApproved.lastContextId;
          if (autoApproved.lastTaskId) lastTaskId = autoApproved.lastTaskId;
          if (autoApproved.lastState) lastState = autoApproved.lastState;
          if (autoApproved.text) lastText = autoApproved.text;
        } else {
          // Non-YOLO: push approval card and wait for user input
          const firstApproval = latestPendingApprovals[0];
          session.pendingToolApproval = {
            callId: firstApproval.callId,
            taskId: firstApproval.taskId,
            toolName: firstApproval.displayName || firstApproval.name,
          };

          const approvalResponse = renderResponse(
            {
              kind: 'task',
              id: firstApproval.taskId,
              contextId: lastContextId ?? session.contextId,
              status: {
                state: 'input-required',
                timestamp: new Date().toISOString(),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                message: approvalStatusMessage as
                  | import('@a2a-js/sdk').Message
                  | undefined,
              },
              history: [],
              artifacts: [],
            },
            message.thread.threadKey || threadName,
            threadName,
            this.webhookUrl,
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
          `[ChatBridge] Pushed final response (${lastText.length} chars): "${lastText.substring(0, 200)}"`,
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
   * Auto-approves tool calls in YOLO mode using streaming.
   * Sends approvals and collects streamed text from the SSE response.
   * The A2A server streams text incrementally and closes with final:true
   * at input-required (more tools) or completed (done).
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
    const MAX_ROUNDS = 20;

    for (let round = 0; round < MAX_ROUNDS && !session.cancelled; round++) {
      if (approvalsToProcess.length === 0) break;

      for (const a of approvalsToProcess) {
        const label = a.displayName || a.name;
        logger.info(`[ChatBridge] YOLO auto-approving: ${label}`);
        approvedNames.push(label);
      }

      // Stream tool confirmations — text arrives incrementally via SSE
      const stream = this.a2aClient.sendBatchToolConfirmationsStream(
        approvalsToProcess.map((a) => ({
          callId: a.callId,
          outcome: 'proceed_once',
          taskId: a.taskId,
        })),
        { contextId: lastContextId ?? session.contextId },
      );

      approvalsToProcess = [];

      // Consume the stream, collecting text and detecting new tool approvals
      let eventCount = 0;
      for await (const event of stream) {
        if (session.cancelled) break;
        eventCount++;

        const extracted = extractFromStreamEvent(event);
        if (extracted.taskId) lastTaskId = extracted.taskId;
        if (extracted.contextId) lastContextId = extracted.contextId;
        if (extracted.state) lastState = extracted.state;
        if (extracted.text) lastText = extracted.text;

        logger.info(
          `[ChatBridge] YOLO event #${eventCount}: kind=${event.kind}, ` +
            `state=${extracted.state ?? 'n/a'}, text=${extracted.text.length} chars`,
        );

        // New tool approvals → break to send them in next round
        const pending = extracted.toolApprovals.filter(
          (a) => a.status === 'awaiting_approval',
        );
        if (pending.length > 0) {
          approvalsToProcess = pending;
          break;
        }
      }

      logger.info(
        `[ChatBridge] YOLO round ${round}: state=${lastState ?? 'none'}, ` +
          `text=${lastText?.length ?? 0} chars, newApprovals=${approvalsToProcess.length}`,
      );

      if (lastState && TERMINAL_STATES.has(lastState)) break;
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

    if (
      action.actionMethodName === 'tool_confirmation' ||
      action.actionMethodName === this.webhookUrl
    ) {
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
