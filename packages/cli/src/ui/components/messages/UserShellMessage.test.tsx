/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { UserShellMessage } from './UserShellMessage.js';

describe('UserShellMessage', () => {
  it('should render shell prompt', () => {
    const { lastFrame } = render(<UserShellMessage text="ls -la" />);
    expect(lastFrame()).toContain('$ ');
  });

  it('should render command text', () => {
    const { lastFrame } = render(<UserShellMessage text="pwd" />);
    expect(lastFrame()).toContain('pwd');
  });

  it('should remove leading exclamation mark', () => {
    const { lastFrame } = render(<UserShellMessage text="!echo hello" />);
    expect(lastFrame()).toContain('echo hello');
    expect(lastFrame()).not.toContain('!echo');
  });

  it('should keep text without leading exclamation', () => {
    const { lastFrame } = render(<UserShellMessage text="git status" />);
    expect(lastFrame()).toContain('git status');
  });

  it('should handle empty text', () => {
    const { lastFrame } = render(<UserShellMessage text="" />);
    expect(lastFrame()).toContain('$');
  });

  it('should handle single exclamation mark', () => {
    const { lastFrame } = render(<UserShellMessage text="!" />);
    const output = lastFrame();
    expect(output).toContain('$');
  });

  it('should render complete command', () => {
    const { lastFrame } = render(
      <UserShellMessage text="npm install --save-dev" />,
    );
    expect(lastFrame()).toContain('$ ');
    expect(lastFrame()).toContain('npm install --save-dev');
  });

  it('should handle command with exclamation in middle', () => {
    const { lastFrame } = render(<UserShellMessage text="echo hello!" />);
    expect(lastFrame()).toContain('echo hello!');
  });

  it('should handle long command', () => {
    const longCmd = 'find . -name "*.ts" -type f ! -name "*.test.ts"';
    const { lastFrame } = render(<UserShellMessage text={longCmd} />);
    expect(lastFrame()).toContain(longCmd);
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<UserShellMessage text="test" />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle command with special characters', () => {
    const { lastFrame } = render(
      <UserShellMessage text="grep -r 'pattern' ." />,
    );
    expect(lastFrame()).toContain("grep -r 'pattern' .");
  });

  it('should preserve command exactly when no leading !', () => {
    const cmd = 'docker run -it ubuntu bash';
    const { lastFrame } = render(<UserShellMessage text={cmd} />);
    expect(lastFrame()).toContain(cmd);
  });

  it('should only remove first ! character', () => {
    const { lastFrame } = render(<UserShellMessage text="!!important" />);
    expect(lastFrame()).toContain('!important');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<UserShellMessage text="test command" />);
    }).not.toThrow();
  });
});
