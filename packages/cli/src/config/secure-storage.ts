/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as keytar from 'keytar';

const SERVICE_NAME = 'gemini-cli';
const ACCOUNT_NAME = 'gemini-api-key';

export async function setApiKey(apiKey: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
}

export async function getApiKey(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
}
