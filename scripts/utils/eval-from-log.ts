/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Safe orchestration for generating a reviewable eval draft from
 * one selected Gemini CLI session turn.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getProjectHash,
  loadConversationRecord,
  type ConversationRecord,
} from '@google/gemini-cli-core';
import {
  analyzeSessionTurns,
  selectSessionTurn,
  type ObservedToolCall,
  type SessionTurnAnalysis,
  type SessionTurnCandidate,
} from './session-turns.js';
import { findSensitiveContent, sanitizeContent } from './log-sanitizer.js';
import { generateEvalSkeleton } from './eval-skeleton-generator.js';
import { analyzeEvalSource, type EvalFileAnalysis } from './eval-analysis.js';
import { buildToolRegistry, resolveToolName } from './tool-registry.js';
import { validateInventory, type ValidationResult } from './eval-validate.js';
import type { InventoryResult } from './eval-inventory.js';

const MAX_FIXTURES = 10;
const MAX_FIXTURE_BYTES = 100 * 1024;
const MAX_TOTAL_FIXTURE_BYTES = 500 * 1024;
const MAX_PROMPT_CHARS = 20_000;
const MAX_NAME_CHARS = 200;
const MAX_SUITE_NAME_CHARS = 100;
const MAX_TOOL_ASSERTIONS = 20;
const MAX_SESSION_BYTES = 100 * 1024 * 1024;

const BLOCKED_FIXTURE_BASENAMES = new Set([
  '.npmrc',
  '.netrc',
  '.pypirc',
  'credentials',
  'credentials.json',
  'id_dsa',
  'id_ed25519',
  'id_rsa',
  'service-account.json',
]);

const BLOCKED_FIXTURE_EXTENSIONS = new Set([
  '.crt',
  '.key',
  '.p12',
  '.pem',
  '.pfx',
]);

const BLOCKED_FIXTURE_PATH_SEGMENTS = new Set([
  '.aws',
  '.gemini',
  '.git',
  '.gnupg',
  '.ssh',
]);

const WINDOWS_RESERVED_PATH_COMPONENTS = new Set([
  'AUX',
  'CON',
  'NUL',
  'PRN',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

export interface InspectLogResult {
  projectHash: string;
  analysis: SessionTurnAnalysis;
}

export interface FromLogOptions {
  messageId?: string;
  name: string;
  suiteName?: string;
  expectedTools?: string[];
  forbiddenTools?: string[];
  fixturePaths?: string[];
  noFixturesNeeded?: boolean;
  workspaceRoot?: string;
  outputPath?: string;
  write?: boolean;
  repoRoot?: string;
}

export interface FromLogResult {
  outputPath: string;
  wroteFile: boolean;
  skeleton: string;
  structuralValidationPassed: true;
  warnings: string[];
  selectedTurn: {
    messageId: string;
    prompt: string;
    observedTools: ObservedToolCall[];
    candidatePaths: string[];
  };
  expectedTools: string[];
  forbiddenTools: string[];
  fixturePaths: string[];
}

function displayPath(filePath: string): string {
  return sanitizeContent(filePath, { stripHomePaths: true });
}

function assertSupportedSessionFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${displayPath(filePath)}`);
  }
  if (!fs.statSync(filePath).isFile()) {
    throw new Error(
      `Session path is not a regular file: ${displayPath(filePath)}`,
    );
  }
  if (!filePath.endsWith('.jsonl') && !filePath.endsWith('.json')) {
    throw new Error('Session file must end in .jsonl or .json.');
  }
  if (fs.statSync(filePath).size > MAX_SESSION_BYTES) {
    throw new Error(
      `Session file exceeds the ${MAX_SESSION_BYTES}-byte safety limit.`,
    );
  }
}

function countMalformedSessionLines(content: string, isJsonl: boolean): number {
  if (!isJsonl) {
    try {
      // Legacy .json sessions are complete JSON documents and may be
      // pretty-printed across several lines. The core loader also accepts
      // JSONL-shaped data with this legacy extension, so only fall through to
      // per-line validation when whole-document parsing fails.
      JSON.parse(content);
      return 0;
    } catch {
      // Validate the JSONL-compatible form below.
    }
  }

  let malformed = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      JSON.parse(line);
    } catch {
      malformed += 1;
    }
  }

  return malformed;
}

async function loadSession(filePath: string): Promise<ConversationRecord> {
  const resolved = path.resolve(filePath);
  assertSupportedSessionFile(resolved);

  const buffer = fs.readFileSync(resolved);
  if (buffer.byteLength > MAX_SESSION_BYTES) {
    throw new Error(
      `Session file exceeds the ${MAX_SESSION_BYTES}-byte safety limit.`,
    );
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error('Session file is not valid UTF-8 text.');
  }

  const isJsonl = resolved.endsWith('.jsonl');
  const malformedLineCount = countMalformedSessionLines(content, isJsonl);
  if (malformedLineCount > 0) {
    throw new Error(
      `Session file contains ${malformedLineCount} malformed non-empty line(s). Generation is refused because the logical session may be incomplete.`,
    );
  }

  // Parse the exact bytes validated above. The original session may still be
  // active and append between operations, while the core loader intentionally
  // tolerates malformed lines for resume recovery.
  const snapshotDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gemini-eval-from-log-'),
  );
  const snapshotPath = path.join(
    snapshotDirectory,
    isJsonl ? 'session.jsonl' : 'session.json',
  );
  try {
    fs.writeFileSync(snapshotPath, buffer, { mode: 0o600, flag: 'wx' });
    const conversation = await loadConversationRecord(snapshotPath);
    if (!conversation) {
      throw new Error(
        `Could not load a valid Gemini CLI conversation from ${displayPath(resolved)}.`,
      );
    }
    return conversation;
  } finally {
    fs.rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}

export async function inspectLog(
  sessionPath: string,
): Promise<InspectLogResult> {
  const conversation = await loadSession(sessionPath);
  return {
    projectHash: conversation.projectHash,
    analysis: analyzeSessionTurns(conversation),
  };
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        codePoint === 0x061c ||
        codePoint === 0x200e ||
        codePoint === 0x200f ||
        (codePoint >= 0x2028 && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069))
    ) {
      return true;
    }
  }
  return false;
}

function isPortablePathComponent(component: string): boolean {
  const stem = component.split('.')[0]?.toUpperCase();
  return (
    component.length > 0 &&
    !component.endsWith('.') &&
    !component.endsWith(' ') &&
    !/[<>:"|?*]/.test(component) &&
    !WINDOWS_RESERVED_PATH_COMPONENTS.has(stem)
  );
}

function assertPortableEvalPath(portablePath: string, label: string): void {
  // prepareWorkspace currently rejects the substring anywhere, including an
  // otherwise ordinary filename such as version..txt. Mirror that runtime
  // contract so a generated draft cannot pass structural checks then fail in
  // setup before reaching its guard.
  if (
    portablePath.includes('..') ||
    !portablePath.split('/').every(isPortablePathComponent)
  ) {
    throw new Error(
      `${label} is not portable across supported eval platforms or is rejected by eval workspace setup.`,
    );
  }
}

function normalizeRelativePath(filePath: string): string {
  if (hasControlCharacters(filePath)) {
    throw new Error('Fixture paths must not contain control characters.');
  }
  if (path.isAbsolute(filePath)) {
    throw new Error('Fixture paths must be relative.');
  }

  const normalized = path.normalize(filePath.replace(/[\\/]/g, path.sep));
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error('Unsafe fixture path.');
  }

  return normalized;
}

function assertFixtureNameIsSafe(relativePath: string): void {
  const segments = relativePath
    .split(path.sep)
    .map((segment) => segment.toLowerCase());
  const basename = path.basename(relativePath).toLowerCase();
  const extension = path.extname(basename);
  if (
    segments.some((segment) => BLOCKED_FIXTURE_PATH_SEGMENTS.has(segment)) ||
    (segments.includes('.config') && segments.includes('gcloud')) ||
    basename === '.env' ||
    basename.startsWith('.env.') ||
    BLOCKED_FIXTURE_BASENAMES.has(basename) ||
    BLOCKED_FIXTURE_EXTENSIONS.has(extension)
  ) {
    throw new Error(
      `Fixture ${relativePath} is blocked because its path commonly contains credentials or key material.`,
    );
  }
}

function readBoundedFixture(fd: number, portablePath: string): Buffer {
  const buffer = Buffer.allocUnsafe(MAX_FIXTURE_BYTES + 1);
  let totalBytes = 0;

  while (totalBytes < buffer.byteLength) {
    const bytesRead = fs.readSync(
      fd,
      buffer,
      totalBytes,
      buffer.byteLength - totalBytes,
      null,
    );
    if (bytesRead === 0) {
      break;
    }
    totalBytes += bytesRead;
  }

  if (totalBytes > MAX_FIXTURE_BYTES) {
    throw new Error(
      `Fixture ${portablePath} exceeds the ${MAX_FIXTURE_BYTES}-byte limit.`,
    );
  }

  return buffer.subarray(0, totalBytes);
}

function loadFixtures(
  fixturePaths: string[],
  workspaceRoot: string,
  sessionProjectHash: string,
  warnings: string[],
): Record<string, string> {
  if (fixturePaths.length > MAX_FIXTURES) {
    throw new Error(`At most ${MAX_FIXTURES} fixture files may be included.`);
  }

  const requestedWorkspaceRoot = path.resolve(workspaceRoot);
  const realWorkspaceRoot = fs.realpathSync(requestedWorkspaceRoot);
  if (!fs.statSync(realWorkspaceRoot).isDirectory()) {
    throw new Error('The workspace path must be a directory.');
  }
  const matchingProjectHashes = new Set([
    getProjectHash(requestedWorkspaceRoot),
    getProjectHash(realWorkspaceRoot),
  ]);
  if (!matchingProjectHashes.has(sessionProjectHash)) {
    throw new Error(
      'The selected workspace does not match the session project hash. Use the original workspace or omit fixtures explicitly.',
    );
  }

  const files = Object.create(null) as Record<string, string>;
  const realFiles = new Set<string>();
  const portableFiles = new Set<string>();
  let totalBytes = 0;

  for (const requestedPath of fixturePaths) {
    const normalized = normalizeRelativePath(requestedPath);
    const portablePath = normalized.split(path.sep).join('/');
    if (findSensitiveContent(portablePath).length > 0) {
      throw new Error('A fixture path appears to contain sensitive content.');
    }
    assertPortableEvalPath(portablePath, 'Fixture path');
    const portableKey = portablePath.toLowerCase();
    if (portableFiles.has(portableKey)) {
      throw new Error(`Duplicate fixture path: ${portablePath}`);
    }
    portableFiles.add(portableKey);
    assertFixtureNameIsSafe(normalized);

    const candidate = path.resolve(realWorkspaceRoot, normalized);
    let realCandidate: string;
    try {
      realCandidate = fs.realpathSync(candidate);
    } catch {
      throw new Error(`Fixture file not found: ${portablePath}`);
    }
    if (!isInside(realWorkspaceRoot, realCandidate)) {
      throw new Error(
        `Fixture escapes the selected workspace: ${portablePath}`,
      );
    }
    let candidateStat: fs.Stats;
    try {
      candidateStat = fs.lstatSync(candidate);
    } catch {
      throw new Error(`Fixture could not be inspected safely: ${portablePath}`);
    }
    if (candidateStat.isSymbolicLink()) {
      throw new Error(
        `Fixture is a symbolic link and cannot be reproduced faithfully: ${portablePath}`,
      );
    }
    if (realFiles.has(realCandidate)) {
      throw new Error(`Fixture resolves to a duplicate file: ${portablePath}`);
    }
    realFiles.add(realCandidate);

    // Best-effort race hardening: refuse final-component symlink swaps where
    // the platform supports O_NOFOLLOW, then inspect and read the same opened
    // file descriptor. Node does not expose a portable openat API, so a hostile
    // process can still race a swap of an intermediate directory component.
    const openFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    let fd: number;
    try {
      fd = fs.openSync(candidate, openFlags);
    } catch {
      throw new Error(`Fixture could not be opened safely: ${portablePath}`);
    }

    let buffer: Buffer;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) {
        throw new Error(`Fixture is not a regular file: ${portablePath}`);
      }
      if (stat.size > MAX_FIXTURE_BYTES) {
        throw new Error(
          `Fixture ${portablePath} exceeds the ${MAX_FIXTURE_BYTES}-byte limit.`,
        );
      }
      buffer = readBoundedFixture(fd, portablePath);
    } finally {
      fs.closeSync(fd);
    }

    if (buffer.byteLength > MAX_FIXTURE_BYTES) {
      throw new Error(
        `Fixture ${portablePath} exceeds the ${MAX_FIXTURE_BYTES}-byte limit.`,
      );
    }
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_TOTAL_FIXTURE_BYTES) {
      throw new Error(
        `Fixture set exceeds the ${MAX_TOTAL_FIXTURE_BYTES}-byte total limit.`,
      );
    }
    if (buffer.includes(0)) {
      throw new Error(`Fixture appears to be binary: ${portablePath}`);
    }

    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error(`Fixture is not valid UTF-8 text: ${portablePath}`);
    }

    const findings = findSensitiveContent(content);
    if (findings.length > 0) {
      const first = findings[0];
      throw new Error(
        `Fixture ${portablePath} contains a potential ${first.category} on line ${first.line}. Remove sensitive data before generating a draft.`,
      );
    }

    const sanitized = sanitizeContent(
      sanitizeContent(content, { workspaceRoot: requestedWorkspaceRoot }),
      { workspaceRoot: realWorkspaceRoot },
    );
    if (sanitized !== content) {
      warnings.push(
        `Machine-specific paths were redacted in fixture ${portablePath}. Review the resulting content for fidelity.`,
      );
    }
    files[portablePath] = sanitized;
  }

  return files;
}

function canonicalizeTools(toolNames: string[], optionName: string): string[] {
  const registry = buildToolRegistry();
  const result: string[] = [];

  for (const rawName of toolNames) {
    const name = rawName.trim();
    if (!name) {
      throw new Error(`${optionName} requires a non-empty tool name.`);
    }
    const canonical = resolveToolName(registry, name);
    if (!canonical) {
      throw new Error(`Unknown tool name for ${optionName}: ${name}`);
    }
    if (!result.includes(canonical)) {
      result.push(canonical);
    }
  }

  return result;
}

function assertSafeShortText(
  value: string,
  optionName: string,
  maxLength: number,
): void {
  if (hasControlCharacters(value)) {
    throw new Error(`${optionName} must not contain control characters.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${optionName} must be at most ${maxLength} characters.`);
  }
  const findings = findSensitiveContent(value);
  if (findings.length > 0) {
    throw new Error(`${optionName} appears to contain sensitive content.`);
  }
}

function toFilenameStem(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || 'generated-eval';
}

function assertOutputDirectorySafe(
  realRepoRoot: string,
  outputPath: string,
): void {
  const evalsDir = path.join(realRepoRoot, 'evals');
  let evalsStat: fs.Stats;
  let realEvalsDir: string;
  let realOutputDirectory: string;

  try {
    evalsStat = fs.lstatSync(evalsDir);
    realEvalsDir = fs.realpathSync(evalsDir);
    realOutputDirectory = fs.realpathSync(path.dirname(outputPath));
  } catch {
    throw new Error('The repository evals directory is unavailable or unsafe.');
  }

  if (
    !evalsStat.isDirectory() ||
    evalsStat.isSymbolicLink() ||
    !isInside(realRepoRoot, realEvalsDir)
  ) {
    throw new Error(
      'The repository evals directory must be a real directory, not a symbolic link.',
    );
  }
  if (realOutputDirectory !== realEvalsDir) {
    throw new Error(
      '--output resolves outside the repository evals directory.',
    );
  }
}

function resolveOutputPath(
  repoRoot: string,
  name: string,
  requestedPath: string | undefined,
  write: boolean,
): string {
  const realRepoRoot = fs.realpathSync(repoRoot);
  const evalsDir = path.join(realRepoRoot, 'evals');
  let hasEvalsDirectory = false;
  try {
    hasEvalsDirectory = fs.statSync(evalsDir).isDirectory();
  } catch {
    // Use the sanitized error below if the directory disappeared mid-check.
  }
  if (!hasEvalsDirectory) {
    throw new Error(
      `Repository evals directory not found under ${displayPath(realRepoRoot)}.`,
    );
  }

  if (write && !requestedPath) {
    throw new Error('--output is required when --write is used.');
  }

  const relativePath =
    requestedPath ?? path.join('evals', `${toFilenameStem(name)}.eval.ts`);
  if (path.isAbsolute(relativePath)) {
    throw new Error(
      '--output must be a repository-relative path under evals/.',
    );
  }
  if (hasControlCharacters(relativePath)) {
    throw new Error('--output must not contain control characters.');
  }

  const normalized = path.normalize(relativePath.replace(/[\\/]/g, path.sep));
  if (
    normalized === '..' ||
    normalized.startsWith(`..${path.sep}`) ||
    path.dirname(normalized) !== 'evals' ||
    !normalized.endsWith('.eval.ts')
  ) {
    throw new Error(
      '--output must be a direct child of evals/, end in .eval.ts, and contain no traversal.',
    );
  }
  assertPortableEvalPath(
    path.basename(normalized).split(path.sep).join('/'),
    'Output filename',
  );
  if (path.basename(normalized).startsWith('.')) {
    throw new Error(
      '--output filename must not start with a dot because hidden eval files are not discovered.',
    );
  }

  const outputPath = path.resolve(realRepoRoot, normalized);
  assertOutputDirectorySafe(realRepoRoot, outputPath);
  if (write && fs.existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing file: ${normalized}`);
  }

  return outputPath;
}

function previewCandidatePath(
  rawPath: string,
  requestedWorkspaceRoot: string,
  realWorkspaceRoot: string,
): string {
  if (
    hasControlCharacters(rawPath) ||
    findSensitiveContent(rawPath).length > 0
  ) {
    return '<omitted: unsafe path>';
  }

  const normalizedInput = rawPath.replace(/[\\/]/g, path.sep);
  if (path.isAbsolute(normalizedInput)) {
    const resolved = path.resolve(normalizedInput);
    const roots = Array.from(
      new Set([
        path.resolve(requestedWorkspaceRoot),
        path.resolve(realWorkspaceRoot),
      ]),
    );
    for (const root of roots) {
      if (isInside(root, resolved)) {
        return path.relative(root, resolved).split(path.sep).join('/');
      }
    }
    return '<outside-workspace>';
  }

  const normalized = path.normalize(normalizedInput);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    return '<outside-workspace>';
  }
  return normalized.split(path.sep).join('/');
}

function validateSkeleton(
  skeleton: string,
  outputPath: string,
  repoRoot: string,
): { analysis: EvalFileAnalysis; validation: ValidationResult } {
  const analysis = analyzeEvalSource(skeleton, {
    filePath: outputPath,
    repoRoot,
  });
  const inventory: InventoryResult = {
    totalFiles: 1,
    totalCases: analysis.cases.length,
    repoRoot,
    files: [analysis],
    cases: analysis.cases,
    diagnostics: analysis.diagnostics,
  };
  const validation = validateInventory(inventory, buildToolRegistry());

  if (
    analysis.cases.length !== 1 ||
    analysis.diagnostics.length > 0 ||
    validation.totalViolations > 0
  ) {
    const details = [
      ...analysis.diagnostics.map((diagnostic) => diagnostic.message),
      ...validation.violations.map(
        (violation) => `[${violation.ruleId}] ${violation.message}`,
      ),
    ];
    throw new Error(
      `Generated draft failed structural validation${details.length > 0 ? `: ${details.join('; ')}` : '.'}`,
    );
  }

  return { analysis, validation };
}

export async function fromLog(
  sessionPath: string,
  options: FromLogOptions,
): Promise<FromLogResult> {
  const name = options.name.trim();
  if (!name) {
    throw new Error('--name is required for generation.');
  }
  assertSafeShortText(name, '--name', MAX_NAME_CHARS);

  const suiteName = (options.suiteName ?? 'regression').trim();
  if (!suiteName) {
    throw new Error('--suite requires a non-empty value.');
  }
  assertSafeShortText(suiteName, '--suite', MAX_SUITE_NAME_CHARS);

  const expectedTools = canonicalizeTools(
    options.expectedTools ?? [],
    '--expect-tool',
  );
  const forbiddenTools = canonicalizeTools(
    options.forbiddenTools ?? [],
    '--forbid-tool',
  );
  if (expectedTools.length + forbiddenTools.length > MAX_TOOL_ASSERTIONS) {
    throw new Error(
      `At most ${MAX_TOOL_ASSERTIONS} expected and forbidden tool assertions may be included.`,
    );
  }
  if (expectedTools.length === 0 && forbiddenTools.length === 0) {
    throw new Error(
      'Generation requires at least one explicit --expect-tool or --forbid-tool. Observed tools are never treated as expectations.',
    );
  }
  const overlap = expectedTools.find((tool) => forbiddenTools.includes(tool));
  if (overlap) {
    throw new Error(`Tool cannot be both expected and forbidden: ${overlap}`);
  }

  const fixturePaths = options.fixturePaths ?? [];
  if (fixturePaths.length > 0 && options.noFixturesNeeded) {
    throw new Error(
      '--fixture and --no-fixtures-needed are mutually exclusive.',
    );
  }
  if (fixturePaths.length === 0 && !options.noFixturesNeeded) {
    throw new Error(
      'Choose at least one --fixture or explicitly pass --no-fixtures-needed.',
    );
  }
  const conversation = await loadSession(sessionPath);
  const turn = selectSessionTurn(
    analyzeSessionTurns(conversation),
    options.messageId,
  );

  if (turn.prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Selected prompt exceeds the ${MAX_PROMPT_CHARS}-character limit. Create a smaller synthetic reproduction instead.`,
    );
  }

  const promptFindings = findSensitiveContent(turn.prompt);
  if (promptFindings.length > 0) {
    const first = promptFindings[0];
    throw new Error(
      `Selected prompt contains a potential ${first.category} on line ${first.line}. Generation is refused to avoid publishing sensitive data.`,
    );
  }

  const repoRoot = fs.realpathSync(options.repoRoot ?? process.cwd());
  const requestedWorkspaceRoot = path.resolve(
    options.workspaceRoot ?? process.cwd(),
  );
  const workspaceRoot = fs.realpathSync(requestedWorkspaceRoot);
  const warnings = [
    'Observed tool calls are evidence only; generated assertions come exclusively from explicit expectation options.',
    'Fixture files are copied from the current workspace, not reconstructed from the log. Confirm they represent the required starting state.',
    'Secret detection and path redaction are best effort. Review the complete draft before committing it.',
    'The generated runtime guard must remain until the draft is reviewed and proven to fail before the behavior fix.',
  ];

  const sanitizedPrompt = sanitizeContent(
    sanitizeContent(turn.prompt, { workspaceRoot: requestedWorkspaceRoot }),
    { workspaceRoot },
  );
  if (sanitizedPrompt !== turn.prompt) {
    warnings.push(
      'Machine-specific paths were redacted in the selected prompt.',
    );
  }

  const files =
    fixturePaths.length > 0
      ? loadFixtures(
          fixturePaths,
          requestedWorkspaceRoot,
          conversation.projectHash,
          warnings,
        )
      : {};
  if (fixturePaths.length === 0) {
    warnings.push(
      'No fixtures were included because --no-fixtures-needed was supplied.',
    );
  }
  if (expectedTools.length === 0) {
    warnings.push(
      'This is a negative-only draft. Add a positive outcome assertion during review before removing the runtime guard.',
    );
  }

  const outputPath = resolveOutputPath(
    repoRoot,
    name,
    options.outputPath,
    options.write ?? false,
  );
  const skeleton = await generateEvalSkeleton(
    {
      name,
      suiteName,
      prompt: sanitizedPrompt,
      files,
      expectedTools,
      forbiddenTools,
    },
    outputPath,
  );
  validateSkeleton(skeleton, outputPath, repoRoot);

  if (options.write) {
    // Formatting above is asynchronous. Re-check immediately before writing to
    // narrow the window in which the evals directory could be replaced. This
    // is best-effort hardening because the check and write are not atomic.
    assertOutputDirectorySafe(repoRoot, outputPath);
    fs.writeFileSync(outputPath, skeleton, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }

  return {
    outputPath,
    wroteFile: options.write ?? false,
    skeleton,
    structuralValidationPassed: true,
    warnings,
    selectedTurn: {
      messageId: turn.messageId,
      prompt: sanitizedPrompt,
      observedTools: turn.observedTools,
      candidatePaths: turn.candidatePaths.map((candidate) =>
        previewCandidatePath(candidate, requestedWorkspaceRoot, workspaceRoot),
      ),
    },
    expectedTools,
    forbiddenTools,
    fixturePaths: Object.keys(files),
  };
}

export function formatTurnForDisplay(
  turn: SessionTurnCandidate,
  workspaceRoot: string,
): SessionTurnCandidate {
  const requestedWorkspace = path.resolve(workspaceRoot);
  const realWorkspace = fs.realpathSync(requestedWorkspace);
  const prompt =
    findSensitiveContent(turn.prompt).length > 0
      ? '<prompt omitted: potential sensitive content>'
      : sanitizeContent(
          sanitizeContent(turn.prompt, { workspaceRoot: requestedWorkspace }),
          { workspaceRoot: realWorkspace },
        );

  return {
    ...turn,
    prompt,
    candidatePaths: turn.candidatePaths.map((candidate) =>
      previewCandidatePath(candidate, requestedWorkspace, realWorkspace),
    ),
  };
}
