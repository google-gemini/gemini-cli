/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve, join } from 'node:path';

// Only names used by StartupProfiler are recorded. Arbitrary performance marks
// and their details can contain user data and must not enter a timing report.
export const STARTUP_PHASES = new Set([
  'cli_startup',
  'load_settings',
  'setup_worktree',
  'cleanup_ops',
  'parse_arguments',
  'load_cli_config',
  'setup_terminal',
  'initialize_app',
  'authenticate',
  'discover_tools',
  'load_builtin_commands',
]);

const ENTRYPOINTS = new Set([
  'npm',
  'cross-env',
  'start',
  'check-build-status',
  'sandbox-command',
  'cli',
]);

export const milliseconds = (value) => Math.round(value * 1000) / 1000;

export function getProcessLabel(entrypoint, npmEntrypoint, root) {
  if (!entrypoint) return undefined;
  const actual = resolve(entrypoint);
  if (npmEntrypoint && actual === resolve(npmEntrypoint)) return 'npm';
  const paths = new Map([
    [join(root, 'node_modules/.bin/cross-env'), 'cross-env'],
    [join(root, 'node_modules/.bin/cross-env.js'), 'cross-env'],
    [join(root, 'node_modules/cross-env/src/bin/cross-env.js'), 'cross-env'],
    [join(root, 'scripts/start.js'), 'start'],
    [join(root, 'scripts/check-build-status.js'), 'check-build-status'],
    [join(root, 'scripts/sandbox_command.js'), 'sandbox-command'],
    [join(root, 'packages/cli'), 'cli'],
    [join(root, 'packages/cli/dist/index.js'), 'cli'],
  ]);
  return paths.get(actual);
}

export function createPhaseCollector(processStartMs) {
  const starts = new Map();
  const phases = new Map();

  return {
    collect(entries) {
      let changed = false;
      // Marks and measures can be delivered together, including on exit.
      for (const entry of entries) {
        if (entry.entryType !== 'mark') continue;
        const match = /^startup:([^:]+):start$/.exec(entry.name);
        if (
          match &&
          STARTUP_PHASES.has(match[1]) &&
          !starts.has(match[1]) &&
          Number.isFinite(entry.startTime)
        ) {
          starts.set(match[1], entry.startTime);
          changed = true;
        }
      }
      for (const entry of entries) {
        if (
          entry.entryType === 'measure' &&
          STARTUP_PHASES.has(entry.name) &&
          !phases.has(entry.name) &&
          starts.get(entry.name) === entry.startTime &&
          Number.isFinite(entry.duration) &&
          entry.duration >= 0
        ) {
          phases.set(entry.name, {
            name: entry.name,
            startMs: milliseconds(processStartMs + entry.startTime),
            durationMs: milliseconds(entry.duration),
          });
          changed = true;
        }
      }
      return changed;
    },
    snapshot() {
      return [...phases.values()].sort((a, b) => a.startMs - b.startMs);
    },
  };
}

// Explicit projection also keeps unexpected fields out of an aggregate report.
export function summarizeProfiles(profiles) {
  const processes = profiles
    .filter(
      (profile) =>
        profile &&
        profile.schemaVersion === 1 &&
        ENTRYPOINTS.has(profile.entrypoint) &&
        Number.isInteger(profile.pid) &&
        Number.isInteger(profile.ppid) &&
        Number.isFinite(profile.processStartMs) &&
        Array.isArray(profile.phases),
    )
    .map((profile) => {
      const phases = profile.phases
        .filter(
          (phase) =>
            phase &&
            STARTUP_PHASES.has(phase.name) &&
            Number.isFinite(phase.startMs) &&
            Number.isFinite(phase.durationMs) &&
            phase.durationMs >= 0,
        )
        .slice(0, STARTUP_PHASES.size)
        .map(({ name, startMs, durationMs }) => ({
          name,
          startMs,
          durationMs,
        }));
      const result = {
        pid: profile.pid,
        ppid: profile.ppid,
        entrypoint: profile.entrypoint,
        processStartMs: profile.processStartMs,
        phases,
      };
      return result;
    })
    .sort((a, b) => a.processStartMs - b.processStartMs);

  const summary = { schemaVersion: 1, processes };
  // A supervisor can restart the CLI during testing. Report the first startup.
  const cli = processes.find(
    (profile) =>
      profile.entrypoint === 'cli' &&
      profile.phases.some((phase) => phase.name === 'cli_startup'),
  );
  const startup = cli?.phases.find((phase) => phase.name === 'cli_startup');
  if (startup) {
    summary.launchToCliMainMs = startup.startMs;
    summary.preMainMs = milliseconds(startup.startMs - cli.processStartMs);
    summary.cliStartupEndMs = milliseconds(
      startup.startMs + startup.durationMs,
    );
  }
  return summary;
}
