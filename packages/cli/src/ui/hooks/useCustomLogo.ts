/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import * as fs from 'node:fs/promises';
import { getErrorMessage, debugLogger } from '@google/gemini-cli-core';
import toml from '@iarna/toml';
import type { LogoVariants } from '../types.js';

export function useCustomLogo(
  variantsFilePath: string | undefined,
): LogoVariants | undefined {
  const [variants, setVariants] = useState<LogoVariants | undefined>(undefined);

  useEffect(() => {
    if (!variantsFilePath) {
      setVariants(undefined);
      return;
    }

    const loadVariants = async () => {
      try {
        const content = await fs.readFile(variantsFilePath, 'utf-8');
        const parsed = toml.parse(content) as unknown as LogoVariants;
        setVariants(parsed);
      } catch (e) {
        const msg = `Failed to load custom logo variants from "${variantsFilePath}": ${getErrorMessage(e)}`;
        debugLogger.warn(msg);
        setVariants(undefined);
      }
    };

    loadVariants();
  }, [variantsFilePath]);

  return variants;
}
