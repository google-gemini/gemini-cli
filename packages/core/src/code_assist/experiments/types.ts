/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

export interface ClientMetadata {
  ide_type?: IdeType;
  ide_version?: string;
  platform?: Platform;
  update_channel?: 'nightly' | 'preview' | 'stable';
  duet_project?: string;
}

export type IdeType = 'GEMINI_CLI';

export type Platform =
  | 'PLATFORM_UNSPECIFIED'
  | 'DARWIN_AMD64'
  | 'DARWIN_ARM64'
  | 'LINUX_AMD64'
  | 'LINUX_ARM64'
  | 'WINDOWS_AMD64';
