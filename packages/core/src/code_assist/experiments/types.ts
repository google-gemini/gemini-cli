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
  experiment_ids?: number[];
  flags?: Flag[];
  filtered_flags?: FilteredFlag[];
  debug_string?: string;
}

export interface Flag {
  name?: string;
  bool_value?: boolean;
  float_value?: number;
  int_value?: string; // int64
  string_value?: string;
  int32_list_value?: Int32List;
  string_list_value?: StringList;
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
