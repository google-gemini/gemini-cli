/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import * as fs from 'node:fs/promises';
import { getErrorMessage, debugLogger } from '@google/gemini-cli-core';

export interface LogoVariants {
  longAsciiLogo?: string;
  shortAsciiLogo?: string;
  tinyAsciiLogo?: string;
  longAsciiLogoIde?: string;
  shortAsciiLogoIde?: string;
  tinyAsciiLogoIde?: string;
}

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
        const parsed = JSON.parse(content) as LogoVariants;
        setVariants(parsed);
      } catch (e) {
        debugLogger.warn(
          `Failed to load custom logo variants from "${variantsFilePath}": ${getErrorMessage(e)}`,
        );
        setVariants(undefined);
      }
    };

    loadVariants();
  }, [variantsFilePath]);

  return variants;
}
