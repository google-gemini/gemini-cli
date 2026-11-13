/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ExitCodes, type ExitCode } from './exitCodes.js';
import {
  FatalError,
  FatalAuthenticationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  FatalUntrustedWorkspaceError,
  FatalCancellationError,
} from './errors.js';

describe('ExitCodes', () => {
  it('defines canonical CLI process exit codes matching specifications', () => {
    expect(ExitCodes.SUCCESS).toBe(0);
    expect(ExitCodes.FATAL_AUTHENTICATION_ERROR).toBe(41);
    expect(ExitCodes.FATAL_INPUT_ERROR).toBe(42);
    expect(ExitCodes.FATAL_SANDBOX_ERROR).toBe(44);
    expect(ExitCodes.FATAL_CONFIG_ERROR).toBe(52);
    expect(ExitCodes.FATAL_TURN_LIMITED_ERROR).toBe(53);
    expect(ExitCodes.FATAL_TOOL_EXECUTION_ERROR).toBe(54);
    expect(ExitCodes.FATAL_UNTRUSTED_WORKSPACE_ERROR).toBe(55);
    expect(ExitCodes.FATAL_CANCELLATION_ERROR).toBe(130);
  });

  it('satisfies ExitCode type constraint', () => {
    const code: ExitCode = ExitCodes.SUCCESS;
    expect(typeof code).toBe('number');
  });
});

describe('FatalError subclasses exit code alignment', () => {
  it('assigns matching exit code for base FatalError', () => {
    const error = new FatalError('Custom fatal error', 99);
    expect(error.exitCode).toBe(99);
    expect(error.message).toBe('Custom fatal error');
    expect(error.name).toBe('FatalError');
  });

  it('assigns FATAL_AUTHENTICATION_ERROR (41) to FatalAuthenticationError', () => {
    const error = new FatalAuthenticationError('Auth failed');
    expect(error.exitCode).toBe(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    expect(error.exitCode).toBe(41);
    expect(error.name).toBe('FatalAuthenticationError');
  });

  it('assigns FATAL_INPUT_ERROR (42) to FatalInputError', () => {
    const error = new FatalInputError('Invalid input');
    expect(error.exitCode).toBe(ExitCodes.FATAL_INPUT_ERROR);
    expect(error.exitCode).toBe(42);
    expect(error.name).toBe('FatalInputError');
  });

  it('assigns FATAL_SANDBOX_ERROR (44) to FatalSandboxError', () => {
    const error = new FatalSandboxError('Sandbox failed');
    expect(error.exitCode).toBe(ExitCodes.FATAL_SANDBOX_ERROR);
    expect(error.exitCode).toBe(44);
    expect(error.name).toBe('FatalSandboxError');
  });

  it('assigns FATAL_CONFIG_ERROR (52) to FatalConfigError', () => {
    const error = new FatalConfigError('Bad configuration');
    expect(error.exitCode).toBe(ExitCodes.FATAL_CONFIG_ERROR);
    expect(error.exitCode).toBe(52);
    expect(error.name).toBe('FatalConfigError');
  });

  it('assigns FATAL_TURN_LIMITED_ERROR (53) to FatalTurnLimitedError', () => {
    const error = new FatalTurnLimitedError('Turn limit reached');
    expect(error.exitCode).toBe(ExitCodes.FATAL_TURN_LIMITED_ERROR);
    expect(error.exitCode).toBe(53);
    expect(error.name).toBe('FatalTurnLimitedError');
  });

  it('assigns FATAL_TOOL_EXECUTION_ERROR (54) to FatalToolExecutionError', () => {
    const error = new FatalToolExecutionError('Tool execution aborted');
    expect(error.exitCode).toBe(ExitCodes.FATAL_TOOL_EXECUTION_ERROR);
    expect(error.exitCode).toBe(54);
    expect(error.name).toBe('FatalToolExecutionError');
  });

  it('assigns FATAL_UNTRUSTED_WORKSPACE_ERROR (55) to FatalUntrustedWorkspaceError', () => {
    const error = new FatalUntrustedWorkspaceError('Workspace untrusted');
    expect(error.exitCode).toBe(ExitCodes.FATAL_UNTRUSTED_WORKSPACE_ERROR);
    expect(error.exitCode).toBe(55);
    expect(error.name).toBe('FatalUntrustedWorkspaceError');
  });

  it('assigns FATAL_CANCELLATION_ERROR (130) by default to FatalCancellationError', () => {
    const error = new FatalCancellationError('SIGINT received');
    expect(error.exitCode).toBe(ExitCodes.FATAL_CANCELLATION_ERROR);
    expect(error.exitCode).toBe(130);
    expect(error.name).toBe('FatalCancellationError');
  });

  it('allows custom exit code overrides for FatalCancellationError', () => {
    const error = new FatalCancellationError('Killed with custom signal', 137);
    expect(error.exitCode).toBe(137);
  });
});
