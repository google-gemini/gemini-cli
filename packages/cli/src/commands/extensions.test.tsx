/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { extensionsCommand } from './extensions.js';
import yargs from 'yargs/yargs';

describe('extensionsCommand', () => {
  it('should have correct command name', () => {
    expect(extensionsCommand.command).toBe('extensions <command>');
  });

  it('should have description', () => {
    expect(extensionsCommand.describe).toBe('Manage Gemini CLI extensions.');
  });

  it('should have builder function', () => {
    expect(extensionsCommand.builder).toBeTypeOf('function');
  });

  it('should have handler function', () => {
    expect(extensionsCommand.handler).toBeTypeOf('function');
  });

  it('should call handler without error', () => {
    expect(() => {
      extensionsCommand.handler!({} as never);
    }).not.toThrow();
  });

  it('should configure yargs with subcommands', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');
    const demandCommandSpy = vi.spyOn(parser, 'demandCommand');
    const versionSpy = vi.spyOn(parser, 'version');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    expect(commandSpy).toHaveBeenCalled();
    expect(demandCommandSpy).toHaveBeenCalledWith(
      1,
      'You need at least one command before continuing.',
    );
    expect(versionSpy).toHaveBeenCalledWith(false);
  });

  it('should register install subcommand', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    const calls = commandSpy.mock.calls.map((call) => call[0]);
    expect(
      calls.some(
        (cmd) =>
          typeof cmd === 'object' &&
          'command' in cmd &&
          typeof cmd.command === 'string' &&
          cmd.command.includes('install'),
      ),
    ).toBe(true);
  });

  it('should register uninstall subcommand', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    const calls = commandSpy.mock.calls.map((call) => call[0]);
    expect(
      calls.some(
        (cmd) =>
          typeof cmd === 'object' &&
          'command' in cmd &&
          typeof cmd.command === 'string' &&
          cmd.command.includes('uninstall'),
      ),
    ).toBe(true);
  });

  it('should register list subcommand', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    const calls = commandSpy.mock.calls.map((call) => call[0]);
    expect(
      calls.some(
        (cmd) =>
          typeof cmd === 'object' &&
          'command' in cmd &&
          typeof cmd.command === 'string' &&
          cmd.command.includes('list'),
      ),
    ).toBe(true);
  });

  it('should register update subcommand', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    const calls = commandSpy.mock.calls.map((call) => call[0]);
    expect(
      calls.some(
        (cmd) =>
          typeof cmd === 'object' &&
          'command' in cmd &&
          typeof cmd.command === 'string' &&
          cmd.command.includes('update'),
      ),
    ).toBe(true);
  });

  it('should register 8 subcommands', () => {
    const parser = yargs();
    const commandSpy = vi.spyOn(parser, 'command');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    // install, uninstall, list, update, disable, enable, link, new
    expect(commandSpy).toHaveBeenCalledTimes(8);
  });

  it('should disable version flag', () => {
    const parser = yargs();
    const versionSpy = vi.spyOn(parser, 'version');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    expect(versionSpy).toHaveBeenCalledWith(false);
  });

  it('should demand at least one command', () => {
    const parser = yargs();
    const demandCommandSpy = vi.spyOn(parser, 'demandCommand');

    if (typeof extensionsCommand.builder === 'function') {
      extensionsCommand.builder(parser as never);
    }

    expect(demandCommandSpy).toHaveBeenCalledWith(1, expect.any(String));
  });
});
