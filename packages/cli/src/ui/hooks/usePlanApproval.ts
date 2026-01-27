/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type Config,
  type PlanApprovalRequest,
  MessageBusType,
  ApprovalMode,
  debugLogger,
  isWithinRoot,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import type { HistoryItemWithoutId } from '../types.js';
import { MessageType } from '../types.js';

export interface UsePlanApprovalArgs {
  config: Config;
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
  onApprovalModeChange: (mode: ApprovalMode) => void;
}

export interface UsePlanApprovalReturn {
  planApprovalRequest: PlanApprovalRequest | null;
  planContent: string | undefined;
  handlePlanApprove: (mode: ApprovalMode) => Promise<void>;
  handlePlanFeedback: (feedback: string) => Promise<void>;
  handlePlanCancel: () => Promise<void>;
}

export function usePlanApproval({
  config,
  addItem,
  onApprovalModeChange,
}: UsePlanApprovalArgs): UsePlanApprovalReturn {
  const [planApprovalRequest, setPlanApprovalRequest] =
    useState<PlanApprovalRequest | null>(null);
  const [planContent, setPlanContent] = useState<string | undefined>(undefined);

  const planPath = planApprovalRequest?.planPath;

  useEffect(() => {
    if (!planPath) {
      setPlanContent(undefined);
      return;
    }

    let ignore = false;
    setPlanContent(undefined);

    const plansDir = config.storage.getProjectTempPlansDir();
    if (!isWithinRoot(planPath, plansDir)) {
      setPlanContent(
        'Error: Plan path is outside the designated plans directory.',
      );
      return;
    }

    fs.promises
      .readFile(planPath, 'utf8')
      .then((content) => {
        if (ignore) return;
        setPlanContent(content);
      })
      .catch((err) => {
        if (ignore) return;
        setPlanContent(`Error reading plan file: ${err.message}`);
      });

    return () => {
      ignore = true;
    };
  }, [planPath, config.storage]);

  useEffect(() => {
    const messageBus = config.getMessageBus();

    const planApprovalHandler = (msg: PlanApprovalRequest) => {
      debugLogger.log('Processing plan approval request:', msg.correlationId);
      setPlanApprovalRequest((prev) => {
        if (prev?.correlationId === msg.correlationId) {
          debugLogger.log(
            'Skipping duplicate plan approval request:',
            msg.correlationId,
          );
          return prev;
        }
        return msg;
      });
    };

    messageBus.subscribe(
      MessageBusType.PLAN_APPROVAL_REQUEST,
      planApprovalHandler,
    );

    return () => {
      messageBus.unsubscribe(
        MessageBusType.PLAN_APPROVAL_REQUEST,
        planApprovalHandler,
      );
    };
  }, [config]);

  const handlePlanApprove = useCallback(
    async (mode: ApprovalMode) => {
      if (!planApprovalRequest) return;

      try {
        config.setCurrentPlanPath(planApprovalRequest.planPath);
        config.setApprovalMode(mode);
        onApprovalModeChange(mode);

        const messageBus = config.getMessageBus();
        await messageBus.publish({
          type: MessageBusType.PLAN_APPROVAL_RESPONSE,
          correlationId: planApprovalRequest.correlationId,
          approved: true,
        });

        const modeText =
          mode === ApprovalMode.AUTO_EDIT
            ? 'Edits will be automatically accepted.'
            : 'Edits will require manual acceptance.';
        addItem(
          {
            type: MessageType.INFO,
            text: `Plan approved. ${modeText}`,
          },
          Date.now(),
        );
      } catch (err) {
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to approve plan: ${err instanceof Error ? err.message : String(err)}`,
          },
          Date.now(),
        );
      } finally {
        setPlanApprovalRequest(null);
      }
    },
    [config, planApprovalRequest, onApprovalModeChange, addItem],
  );

  const handlePlanFeedback = useCallback(
    async (feedback: string) => {
      if (!planApprovalRequest) return;

      try {
        const messageBus = config.getMessageBus();
        await messageBus.publish({
          type: MessageBusType.PLAN_APPROVAL_RESPONSE,
          correlationId: planApprovalRequest.correlationId,
          approved: false,
          feedback,
        });
      } finally {
        setPlanApprovalRequest(null);
      }
    },
    [config, planApprovalRequest],
  );

  const handlePlanCancel = useCallback(async () => {
    if (!planApprovalRequest) return;

    try {
      const messageBus = config.getMessageBus();
      await messageBus.publish({
        type: MessageBusType.PLAN_APPROVAL_RESPONSE,
        correlationId: planApprovalRequest.correlationId,
        approved: false,
        feedback:
          'User dismissed the plan approval dialog without providing feedback. The plan is not approved.',
      });
    } finally {
      setPlanApprovalRequest(null);
    }
  }, [config, planApprovalRequest]);

  return {
    planApprovalRequest,
    planContent,
    handlePlanApprove,
    handlePlanFeedback,
    handlePlanCancel,
  };
}
