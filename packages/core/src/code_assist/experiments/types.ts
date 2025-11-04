/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientMetadata } from '../types.js';

export interface ListExperimentsRequest {
  project: string;
  metadata?: ClientMetadata;
}

export interface ListExperimentsResponse {
  experimentIds?: number[];
  flags?: Flag[];
  filteredFlags?: FilteredFlag[];
  debugString?: string;
}

export interface Flag {
  name?: string;
  boolValue?: boolean;
  floatValue?: number;
  intValue?: string; // int64
  stringValue?: string;
  int32ListValue?: Int32List;
  stringListValue?: StringList;
}

export interface Int32List {
  values?: number[];
}

export interface StringList {
  values?: string[];
}

export interface FilteredFlag {
  name?: string;
  reason?: string;
}
