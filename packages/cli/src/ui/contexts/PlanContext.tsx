/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  progress: number; // 0 to 1
}

interface PlanContextValue {
  steps: PlanStep[];
  currentStep: number;
  createPlanFromQuery: (query: string) => void;
  interruptPlan: (query: string) => void;
}

const PlanContext = createContext<PlanContextValue>({
  steps: [],
  currentStep: 0,
  createPlanFromQuery: () => {},
  interruptPlan: () => {},
});

const generateDefaultPlan = (query: string): PlanStep[] => {
  return [
    {
      id: 1,
      description: `Analyze request: ${query}`,
      status: 'pending',
      progress: 0,
    },
    {
      id: 2,
      description: 'Execute planned steps',
      status: 'pending',
      progress: 0,
    },
  ];
};

export const PlanProvider = ({ children }: { children: ReactNode }) => {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const createPlanFromQuery = (query: string) => {
    const newSteps = generateDefaultPlan(query).map((step, idx) =>
      idx === 0 ? { ...step, status: 'in-progress' } : step,
    );
    setSteps(newSteps);
    setCurrentStep(0);
  };

  const interruptPlan = (query: string) => {
    createPlanFromQuery(query);
  };

  useEffect(() => {
    if (steps.length === 0) return;
    const active = steps[currentStep];
    if (!active || active.status === 'completed') return;
    const interval = setInterval(() => {
      setSteps((prev) =>
        prev.map((s, i) => {
          if (i !== currentStep) return s;
          const nextProgress = Math.min(1, s.progress + 0.1);
          return { ...s, progress: nextProgress, status: 'in-progress' };
        }),
      );
    }, 500);
    return () => clearInterval(interval);
  }, [steps, currentStep]);

  useEffect(() => {
    if (steps.length === 0) return;
    const active = steps[currentStep];
    if (active && active.progress >= 1 && active.status !== 'completed') {
      setSteps((prev) =>
        prev.map((s, i) =>
          i === currentStep ? { ...s, status: 'completed' } : s,
        ),
      );
      if (currentStep + 1 < steps.length) {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === currentStep + 1 ? { ...s, status: 'in-progress' } : s,
          ),
        );
        setCurrentStep((c) => c + 1);
      }
    }
  }, [steps, currentStep]);

  return (
    <PlanContext.Provider
      value={{ steps, currentStep, createPlanFromQuery, interruptPlan }}
    >
      {children}
    </PlanContext.Provider>
  );
};

export const usePlan = () => useContext(PlanContext);

