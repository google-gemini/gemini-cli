/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { promises as fs } from 'fs';
import path from 'path';

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
  rules: string[];
  addRule: (rule: string) => void;
}

const PlanContext = createContext<PlanContextValue>({
  steps: [],
  currentStep: 0,
  createPlanFromQuery: () => {},
  interruptPlan: () => {},
  rules: [],
  addRule: () => {},
});

const splitIntoSteps = (query: string): string[] =>
  query
    .split(/(?:,|\band\b|\bthen\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);

const generatePlanFromQuery = (query: string): PlanStep[] => {
  const segments = splitIntoSteps(query);
  if (!segments.length) {
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
  }
  return segments.map((desc, idx) => ({
    id: idx + 1,
    description: desc.charAt(0).toUpperCase() + desc.slice(1),
    status: idx === 0 ? 'in-progress' : 'pending',
    progress: 0,
  }));
};

export const PlanProvider = ({ children }: { children: ReactNode }) => {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [rules, setRules] = useState<string[]>([]);
  const RULES_FILE = path.join(process.cwd(), 'rules.json');

  useEffect(() => {
    (async () => {
      try {
        const data = await fs.readFile(RULES_FILE, 'utf8');
        setRules(JSON.parse(data));
      } catch {
        // ignore if file doesn't exist
      }
    })();
  }, [RULES_FILE]);

  const createPlanFromQuery = (query: string) => {
    const newSteps = generatePlanFromQuery(query);
    setSteps(newSteps);
    setCurrentStep(0);
  };

  const interruptPlan = (query: string) => {
    createPlanFromQuery(query);
  };

  const addRule = (rule: string) => {
    setRules((prev) => {
      const next = [...prev, rule];
      fs.writeFile(RULES_FILE, JSON.stringify(next, null, 2)).catch(() => {});
      return next;
    });
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
      value={{ steps, currentStep, createPlanFromQuery, interruptPlan, rules, addRule }}
    >
      {children}
    </PlanContext.Provider>
  );
};

export const usePlan = () => useContext(PlanContext);

