/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';

export interface KittyProtocolStatus {
  enabled: boolean;
  checking: boolean;
}

/**
 * Hook that returns the cached Kitty keyboard protocol status.
 * Detection is done once at app startup to avoid repeated queries.
 */
export function useKittyKeyboardProtocol(): KittyProtocolStatus {
  const [status] = useState<KittyProtocolStatus>({
    enabled: terminalCapabilityManager.isKittyProtocolEnabled(),
    checking: false,
  });

  return status;
}
