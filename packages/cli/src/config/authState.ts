/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import stripJsonComments from 'strip-json-comments';
import { AuthType, Storage } from '@google/gemini-cli-core';

export interface AuthStateData {
  selectedType?: string;
}

export function parseAuthType(value: unknown): AuthType | undefined {
  switch (value) {
    case AuthType.LOGIN_WITH_GOOGLE:
    case AuthType.USE_GEMINI:
    case AuthType.USE_VERTEX_AI:
    case AuthType.LEGACY_CLOUD_SHELL:
    case AuthType.COMPUTE_ADC:
      return value;
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNestedSelectedType(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const security = value['security'];
  if (!isRecord(security)) {
    return undefined;
  }
  const auth = security['auth'];
  if (!isRecord(auth)) {
    return undefined;
  }
  const selectedType = auth['selectedType'];
  return typeof selectedType === 'string' ? selectedType : undefined;
}

function getSelectedType(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const selectedType = value['selectedType'];
  return typeof selectedType === 'string' ? selectedType : undefined;
}

function readLegacySelectedType(): string | undefined {
  try {
    const settingsPath = Storage.getGlobalSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(
      stripJsonComments(fs.readFileSync(settingsPath, 'utf-8')),
    );
    return getNestedSelectedType(parsed);
  } catch {
    return undefined;
  }
}

export function loadAuthState(): AuthStateData {
  const authStatePath = Storage.getAuthStatePath();
  try {
    if (fs.existsSync(authStatePath)) {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(authStatePath, 'utf-8'),
      );
      return {
        selectedType: getSelectedType(parsed),
      };
    }
  } catch {
    return {};
  }

  const selectedType = readLegacySelectedType();
  if (selectedType) {
    saveAuthState(selectedType);
    return { selectedType };
  }

  return {};
}

export function saveAuthState(selectedType: string | undefined): void {
  const authStatePath = Storage.getAuthStatePath();
  fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
  const authState: AuthStateData = {};
  if (selectedType !== undefined) {
    authState.selectedType = selectedType;
  }
  fs.writeFileSync(
    authStatePath,
    `${JSON.stringify(authState, null, 2)}\n`,
    'utf-8',
  );
}
