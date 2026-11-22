/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { RE2JS } from 're2js';

/**
 * A compiled regular expression with RE2 semantics. Matching time is linear in
 * the length of the input.
 *
 * Policy patterns are evaluated on every tool call, against arguments of any
 * size, so they are compiled through this class to keep evaluation time
 * predictable. Patterns use RE2 syntax, which has no lookaround or
 * backreferences, and are passed to the engine as written.
 */
export class SafeRegExp {
  readonly #program: RE2JS;

  /** The pattern text as written by the policy author. */
  readonly source: string;

  private constructor(source: string, program: RE2JS) {
    this.source = source;
    this.#program = program;
  }

  /**
   * Compiles a pattern.
   *
   * @throws {Error} If the pattern is malformed or uses syntax that RE2 does
   *   not support.
   */
  static compile(pattern: string): SafeRegExp {
    let program: RE2JS;
    try {
      program = RE2JS.compile(pattern);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e), { cause: e });
    }
    return new SafeRegExp(pattern, program);
  }

  /**
   * Returns true if the pattern matches anywhere in `input`. Like
   * `RegExp.prototype.test`, the match is not anchored.
   */
  test(input: string): boolean {
    return this.#program.test(input);
  }

  /**
   * The number of instructions the pattern compiles to. Matching cost grows
   * with this number, so it serves as a measure of pattern complexity.
   */
  get programSize(): number {
    return this.#program.programSize();
  }

  toString(): string {
    return this.source;
  }
}
