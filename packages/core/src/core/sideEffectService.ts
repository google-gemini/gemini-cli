/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Types of side-effects that can be triggered by tools or the system.
 */
export enum SideEffectType {
  REPLACE_HISTORY = 'REPLACE_HISTORY',
  ELIDE_CALL = 'ELIDE_CALL',
  ELIDE_TURN = 'ELIDE_TURN',
  ELIDE_BETWEEN = 'ELIDE_BETWEEN',
  DISTILL_RESULT = 'DISTILL_RESULT',
  ADD_HISTORY = 'ADD_HISTORY',
  SET_SESSION_CONTEXT = 'SET_SESSION_CONTEXT',
  SET_CONTINUITY_ANCHOR = 'SET_CONTINUITY_ANCHOR',
  REPROMPT = 'REPROMPT',
}

/**
 * Interface for a side-effect.
 */
export interface SideEffect {
  type: SideEffectType;
  payload: any;
}

/**
 * Service for collecting and applying side-effects at safe sync points.
 */
export class SideEffectService {
  private pendingSideEffects: SideEffect[] = [];
  private currentTurnId: string | undefined;

  /**
   * Gets the IDs of turns marked for elision in the pending queue.
   */
  getPendingElidedTurnIds(): Set<string> {
    const ids = new Set<string>();
    for (const effect of this.pendingSideEffects) {
      if (effect.type === SideEffectType.ELIDE_TURN) {
        ids.add(effect.payload);
      }
    }
    return ids;
  }

  /**
   * Sets the ID of the turn currently being processed.
   */
  setCurrentTurnId(turnId: string): void {
    this.currentTurnId = turnId;
  }

  /**
   * Clears the current turn ID.
   */
  clearCurrentTurnId(): void {
    this.currentTurnId = undefined;
  }

  /**
   * Gets the ID of the turn currently being processed.
   */
  getCurrentTurnId(): string | undefined {
    return this.currentTurnId;
  }

  /**
   * Queues a side-effect for later application.
   */
  queueSideEffect(effect: SideEffect): void {
    debugLogger.debug(`[PROJECT CLARITY] Queuing side-effect: ${effect.type}`, {
      payload:
        effect.type === SideEffectType.REPLACE_HISTORY
          ? '<history>'
          : effect.payload,
    });
    this.pendingSideEffects.push(effect);
  }

  /**
   * Clears all pending side-effects.
   */
  clearPending(): void {
    this.pendingSideEffects = [];
  }

  /**
   * Returns all pending side-effects and clears the queue.
   */
  flush(): SideEffect[] {
    const effects = [...this.pendingSideEffects];
    this.pendingSideEffects = [];
    return effects;
  }

  /**
   * Helper to queue a history replacement.
   */
  replaceHistory(newHistory: Content[]): void {
    this.queueSideEffect({
      type: SideEffectType.REPLACE_HISTORY,
      payload: newHistory,
    });
  }

  /**
   * Helper to queue a call elision.
   */
  elideCall(callId: string): void {
    this.queueSideEffect({
      type: SideEffectType.ELIDE_CALL,
      payload: callId,
    });
  }

  /**
   * Helper to queue a turn elision.
   */
  elideTurn(turnId: string): void {
    this.queueSideEffect({
      type: SideEffectType.ELIDE_TURN,
      payload: turnId,
    });
  }

  /**
   * Helper to queue an "elide between" operation.
   */
  elideBetween(startCallId: string, endCallId: string): void {
    this.queueSideEffect({
      type: SideEffectType.ELIDE_BETWEEN,
      payload: { startCallId, endCallId },
    });
  }

  /**
   * Helper to queue a distilled result.
   */
  distillResult(callId: string, distilledOutput: any): void {
    this.queueSideEffect({
      type: SideEffectType.DISTILL_RESULT,
      payload: { callId, distilledOutput },
    });
  }

  /**
   * Helper to set the singleton session context.
   */
  setSessionContext(context: string): void {
    this.queueSideEffect({
      type: SideEffectType.SET_SESSION_CONTEXT,
      payload: context,
    });
  }

  /**
   * Helper to set the continuity anchor (snapshot summary).
   */
  setContinuityAnchor(anchor: string | undefined): void {
    this.queueSideEffect({
      type: SideEffectType.SET_CONTINUITY_ANCHOR,
      payload: anchor,
    });
  }

  /**
   * Helper to clear the continuity anchor.
   */
  clearContinuityAnchor(): void {
    this.setContinuityAnchor(undefined);
  }

  /**
   * Signals that the agent should be re-prompted immediately after the current turn.
   */
  reprompt(): void {
    this.queueSideEffect({
      type: SideEffectType.REPROMPT,
      payload: true,
    });
  }
}
