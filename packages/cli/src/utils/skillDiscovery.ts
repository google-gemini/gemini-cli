/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SkillDiscoveryTiming {
  source_dir: string;
  total_duration_ms: number;
  glob_duration_ms: number;
}

export function getDiscoveryReportForSkill<T extends SkillDiscoveryTiming>(
  location: string,
  reports: readonly T[] | undefined,
): T | undefined {
  return reports
    ?.filter((report) => location.startsWith(report.source_dir))
    .sort((a, b) => b.source_dir.length - a.source_dir.length)[0];
}
