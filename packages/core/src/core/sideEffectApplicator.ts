/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SideEffectType, type SideEffect } from './sideEffectService.js';
import type { HistoryManager } from './historyManager.js';

/**
 * Interface for a side-effect applicator.
 */
export interface SideEffectApplicator {
  apply(effects: SideEffect[]): void;
}

/**
 * Applicator for history-related side-effects.
 */
export class HistorySideEffectApplicator implements SideEffectApplicator {
  constructor(private readonly historyManager: HistoryManager) {}

  apply(effects: SideEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case SideEffectType.REPLACE_HISTORY:
          this.historyManager.replaceHistory(effect.payload);
          break;
        case SideEffectType.ELIDE_CALL:
          this.historyManager.addElidedCallId(effect.payload);
          break;
        case SideEffectType.ELIDE_TURN:
          this.historyManager.addElidedTurnId(effect.payload);
          break;
        case SideEffectType.ELIDE_BETWEEN:
          this.historyManager.elideBetween(
            effect.payload.startCallId,
            effect.payload.endCallId,
          );
          break;
        case SideEffectType.DISTILL_RESULT:
          this.historyManager.addDistilledResult(
            effect.payload.callId,
            effect.payload.distilledOutput,
          );
          break;
        case SideEffectType.SET_SESSION_CONTEXT:
          this.historyManager.setSessionContext(effect.payload);
          break;
        case SideEffectType.SET_CONTINUITY_ANCHOR:
          this.historyManager.setContinuityAnchor(effect.payload);
          break;
        case SideEffectType.ADD_HISTORY:
          this.historyManager.addMessage(effect.payload);
          break;
      }
    }
  }
}
