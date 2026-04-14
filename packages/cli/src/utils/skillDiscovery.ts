/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSubpath, resolveToRealPath } from '@google/gemini-cli-core';

export interface SkillDiscoveryTiming {
  source_dir: string;
  total_duration_ms: number;
  glob_duration_ms: number;
}

export function getDiscoveryReportForSkill<T extends SkillDiscoveryTiming>(
  location: string,
  reports: readonly T[] | undefined,
): T | undefined {
  const resolvedLocation = resolveToRealPath(location);

  return reports
    ?.filter((report) => {
      const resolvedSourceDir = resolveToRealPath(report.source_dir);
      return (
        resolvedLocation === resolvedSourceDir ||
        isSubpath(resolvedSourceDir, resolvedLocation)
      );
    })
    .sort((a, b) => b.source_dir.length - a.source_dir.length)[0];
}
