/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type {
  ListExperimentsResponse,
  Flag,
  Int32List,
  StringList,
} from './types.js';
import { Storage } from '../../config/storage.js';

import { debugLogger } from '../../utils/debugLogger.js';

export interface Experiments {
  flags: Record<string, Flag>;
  experimentIds: number[];
}

interface RawFlag {
  flagId?: number;
  flag_id?: number;
  boolValue?: boolean;
  bool_value?: boolean;
  floatValue?: number;
  float_value?: number;
  intValue?: string;
  int_value?: string;
  stringValue?: string;
  string_value?: string;
  int32ListValue?: Int32List;
  int32_list_value?: Int32List;
  stringListValue?: StringList;
  string_list_value?: StringList;
}

interface RawListExperimentsResponse {
  flags?: RawFlag[];
  experimentIds?: number[];
  experiment_ids?: number[];
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
        const rawResponse = JSON.parse(content) as RawListExperimentsResponse;
        const response = normalizeLocalResponse(rawResponse);
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

function normalizeLocalResponse(
  raw: RawListExperimentsResponse,
): ListExperimentsResponse {
  const flags = (raw.flags || []).map((flag) => ({
    flagId: flag.flagId ?? flag.flag_id,
    boolValue: flag.boolValue ?? flag.bool_value,
    floatValue: flag.floatValue ?? flag.float_value,
    intValue: flag.intValue ?? flag.int_value,
    stringValue: flag.stringValue ?? flag.string_value,
    int32ListValue: flag.int32ListValue ?? flag.int32_list_value,
    stringListValue: flag.stringListValue ?? flag.string_list_value,
  }));

  return {
    experimentIds: raw.experimentIds ?? raw.experiment_ids,
    flags,
  };
}
