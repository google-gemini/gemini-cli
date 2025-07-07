/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  CustomCommand,
  discoverCustomCommands,
} from '../../config/customCommands.js';

export function useCustomCommandDiscovery() {
  const [commands, setCommands] = useState<CustomCommand[]>([]);

  useEffect(() => {
    discoverCustomCommands().then(setCommands);
  }, []);

  return commands;
}
