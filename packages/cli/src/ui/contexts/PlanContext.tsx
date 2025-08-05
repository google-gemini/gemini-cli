/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  progress: number; // 0 to 1
}

interface PlanContextValue {
  steps: PlanStep[];
  currentStep: number;
  setPlan: (steps: PlanStep[]) => void;
}

const PlanContext = createContext<PlanContextValue>({
  steps: [],
  currentStep: 0,
  setPlan: () => {},
});
export const PlanProvider = ({ children }: { children: ReactNode }) => {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const setPlan = (planSteps: PlanStep[]) => {
    const newSteps: PlanStep[] = planSteps.map((step, idx) => ({
      ...step,
      id: idx + 1,
      status: idx === 0 ? 'in-progress' : 'pending',
      progress: 0,
    }));
    setSteps(newSteps);
    setCurrentStep(0);
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
    <PlanContext.Provider value={{ steps, currentStep, setPlan }}>
      {children}
    </PlanContext.Provider>
  );
};

export const usePlan = () => useContext(PlanContext);
