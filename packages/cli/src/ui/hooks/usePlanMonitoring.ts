/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseMarkdownTodos,
  type Todo,
  type Config,
  debugLogger,
} from '@google/gemini-cli-core';

export function usePlanMonitoring(config: Config) {
  const [planTodos, setPlanTodos] = useState<Todo[] | null>(null);
  const [planFileName, setPlanFileName] = useState<string | null>(null);
  const lastModifiedRef = useRef<number>(0);

  useEffect(() => {
    const plansDir = config.storage.getProjectTempPlansDir();

    const updatePlan = async () => {
      try {
        if (!fs.existsSync(plansDir)) {
          return;
        }

        const files = await fs.promises.readdir(plansDir);
        const mdFiles = files.filter((f) => f.endsWith('.md'));

        if (mdFiles.length === 0) {
          setPlanTodos(null);
          setPlanFileName(null);
          return;
        }

        // Find the most recently modified file
        let latestFile = '';
        let latestMtime = 0;

        for (const file of mdFiles) {
          const filePath = path.join(plansDir, file);
          const stats = await fs.promises.stat(filePath);
          if (stats.mtimeMs > latestMtime) {
            latestMtime = stats.mtimeMs;
            latestFile = file;
          }
        }

        if (
          latestMtime > lastModifiedRef.current ||
          latestFile !== planFileName
        ) {
          const content = await fs.promises.readFile(
            path.join(plansDir, latestFile),
            'utf8',
          );
          const todos = parseMarkdownTodos(content);
          setPlanTodos(todos);
          setPlanFileName(latestFile);
          lastModifiedRef.current = latestMtime;
        }
      } catch (error) {
        debugLogger.error('File operation for updating plan failed', error);
      }
    };

    // Initial check
    void updatePlan();

    // Poll every 2 seconds for updates to the plan directory
    const interval = setInterval(() => {
      void updatePlan();
    }, 2000);

    return () => clearInterval(interval);
  }, [config, planFileName]);

  return { planTodos, planFileName };
}
