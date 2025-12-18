/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type { ListExperimentsResponse, Flag } from './types.js';
import { Storage } from '../../config/storage.js';

import { debugLogger } from '../../utils/debugLogger.js';

export interface Experiments {
  flags: Record<string, Flag>;
  experimentIds: number[];
}

let experimentsPromise: Promise<Experiments> | undefined;

/**
 * Gets the experiments from the server.
 *
 * The experiments are cached so that they are only fetched once.
 */
export async function getExperiments(
  server?: CodeAssistServer,
): Promise<Experiments> {
  if (experimentsPromise) {
    return experimentsPromise;
  }

  experimentsPromise = (async () => {
    if (process.env['GEMINI_LOCAL_EXP'] === 'true') {
      debugLogger.log(
        'GEMINI_LOCAL_EXP is true, attempting to read local experiments',
      );
      try {
        const localPath = path.join(
          Storage.getGlobalGeminiDir(),
          'experiments.json',
        );
        debugLogger.log(`Reading experiments from ${localPath}`);
        const content = await fs.readFile(localPath, 'utf8');
        const response = JSON.parse(content) as ListExperimentsResponse;
        debugLogger.log('Successfully loaded local experiments');
        const parsed = parseExperiments(response);
        debugLogger.log('Parsed local experiments:', parsed);
        return parsed;
      } catch (error) {
        debugLogger.warn(
          'Failed to read local experiments, falling back to server',
          error,
        );
      }
    }

    if (!server) {
      return { flags: {}, experimentIds: [] };
    }

    const metadata = await getClientMetadata();
    const response = await server.listExperiments(metadata);
    const parsed = parseExperiments(response);
    debugLogger.log('Parsed server experiments:', parsed);
    return parsed;
  })();
  return experimentsPromise;
}

function parseExperiments(response: ListExperimentsResponse): Experiments {
  const flags: Record<string, Flag> = {};
  for (const flag of response.flags ?? []) {
    if (flag.flagId) {
      flags[flag.flagId] = flag;
    }
  }
  return {
    flags,
    experimentIds: response.experimentIds ?? [],
  };
}
