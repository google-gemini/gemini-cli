/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useMemo } from 'react';
import type { HistoryItem, HistoryItemToolGroup } from '../types.js';
import { PlanService, debugLogger } from '@google/gemini-cli-core';

/**
 * Data structure for a presented plan from the present_plan tool.
 */
export interface PresentedPlanData {
  title: string;
  content: string;
  affectedFiles: string[];
  dependencies: string[];
  displayText: string;
}

/**
 * Hook that watches history for present_plan tool results and triggers
 * plan completion actions (auto-save and dialog).
 */
export function usePlanCompletion(
  history: HistoryItem[],
  projectRoot: string | undefined,
  originalPrompt: string,
  onPlanPresented: (planData: PresentedPlanData, planId: string) => void,
) {
  const processedPlanIdsRef = useRef<Set<number>>(new Set());

  // Find the most recent presented plan in history
  const presentedPlan = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (entry.type !== 'tool_group') {
        continue;
      }
      const toolGroup = entry as HistoryItemToolGroup;
      for (const tool of toolGroup.tools) {
        if (
          typeof tool.resultDisplay === 'object' &&
          tool.resultDisplay !== null &&
          'presentedPlan' in tool.resultDisplay
        ) {
          return {
            historyId: entry.id,
            planData: tool.resultDisplay.presentedPlan as PresentedPlanData,
          };
        }
      }
    }
    return null;
  }, [history]);

  // Auto-save and trigger callback when a new plan is presented
  useEffect(() => {
    if (!presentedPlan) return;
    if (processedPlanIdsRef.current.has(presentedPlan.historyId)) return;

    // Mark as processed
    processedPlanIdsRef.current.add(presentedPlan.historyId);

    const { planData } = presentedPlan;

    // Auto-save as draft
    const savePlan = async () => {
      try {
        const planService = new PlanService(projectRoot);
        const planId = await planService.savePlan(
          planData.content,
          planData.title,
          originalPrompt,
        );
        debugLogger.log('Plan auto-saved as draft:', planId);
        onPlanPresented(planData, planId);
      } catch (error) {
        debugLogger.warn('Error auto-saving plan:', error);
      }
    };

    void savePlan();
  }, [presentedPlan, projectRoot, originalPrompt, onPlanPresented]);
}
