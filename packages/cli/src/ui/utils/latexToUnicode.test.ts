/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { convertLatexToUnicode } from './latexToUnicode.js';

describe('convertLatexToUnicode', () => {
  describe('fast path', () => {
    it('returns empty string unchanged', () => {
      expect(convertLatexToUnicode('')).toBe('');
    });

    it('returns text without backslash or dollar unchanged', () => {
      const input = 'hello world 123';
      expect(convertLatexToUnicode(input)).toBe(input);
    });

    it('short-circuits plain ASCII identically', () => {
      const input = 'The quick brown fox jumps over the lazy dog.';
      expect(convertLatexToUnicode(input)).toBe(input);
    });
  });

  describe('issue #25656 examples', () => {
    it('converts the set-of-processes example', () => {
      const input = 'A set of processes $\\{P_0, P_1, \\dots, P_n\\}$ exists';
      expect(convertLatexToUnicode(input)).toBe(
        'A set of processes {P₀, P₁, …, Pₙ} exists',
      );
    });

    it('converts the deadlock arrow example', () => {
      const input = 'If the graph contains no cycles $\\to$ No Deadlock.';
      expect(convertLatexToUnicode(input)).toBe(
        'If the graph contains no cycles → No Deadlock.',
      );
    });
  });

  describe('math delimiters', () => {
    it('strips $...$ when the content contains LaTeX markers', () => {
      expect(convertLatexToUnicode('see $\\alpha$ here')).toBe('see α here');
    });

    it('strips $...$ around single variables', () => {
      expect(convertLatexToUnicode('let $x$ be a value')).toBe(
        'let x be a value',
      );
    });

    it('strips $$...$$ display math', () => {
      expect(convertLatexToUnicode('$$\\alpha + \\beta$$')).toBe('α + β');
    });

    it('leaves currency $5.99 alone', () => {
      expect(convertLatexToUnicode('It costs $5.99 total')).toBe(
        'It costs $5.99 total',
      );
    });

    it('leaves two dollar amounts alone', () => {
      // The regex matches `$5 to $` as a pair, but the inner content is
      // neither mathy nor purely variables, so it is left intact.
      expect(convertLatexToUnicode('prices range $5 to $10')).toBe(
        'prices range $5 to $10',
      );
    });

    it('leaves shell-style $ interpolation alone', () => {
      expect(convertLatexToUnicode('echo $USER $HOME')).toBe(
        'echo $USER $HOME',
      );
    });

    it('does not strip dollars across newlines', () => {
      expect(convertLatexToUnicode('price $5\nfee $3')).toBe(
        'price $5\nfee $3',
      );
    });
  });

  describe('greek letters', () => {
    it('converts lowercase greek', () => {
      expect(convertLatexToUnicode('\\alpha \\beta \\gamma')).toBe('α β γ');
    });

    it('converts uppercase greek', () => {
      expect(convertLatexToUnicode('\\Omega \\Delta')).toBe('Ω Δ');
    });

    it('does not mangle a prefix match', () => {
      // `\alphabet` is not a known command — must stay intact.
      expect(convertLatexToUnicode('\\alphabet')).toBe('\\alphabet');
    });
  });

  describe('named commands', () => {
    it('converts arrows', () => {
      expect(convertLatexToUnicode('\\to \\rightarrow \\Rightarrow')).toBe(
        '→ → ⇒',
      );
    });

    it('converts relations', () => {
      expect(convertLatexToUnicode('\\leq \\geq \\neq \\approx')).toBe(
        '≤ ≥ ≠ ≈',
      );
    });

    it('converts set theory', () => {
      expect(convertLatexToUnicode('\\in \\notin \\cup \\cap')).toBe('∈ ∉ ∪ ∩');
    });

    it('converts logic', () => {
      expect(convertLatexToUnicode('\\forall x \\exists y')).toBe('∀ x ∃ y');
    });

    it('converts large operators', () => {
      expect(convertLatexToUnicode('\\sum \\prod \\int')).toBe('∑ ∏ ∫');
    });

    it('converts ellipses', () => {
      expect(convertLatexToUnicode('a, b, \\dots, z')).toBe('a, b, …, z');
    });

    it('converts infty', () => {
      expect(convertLatexToUnicode('\\infty')).toBe('∞');
    });

    it('leaves unknown commands untouched', () => {
      expect(convertLatexToUnicode('\\thisIsNotReal')).toBe('\\thisIsNotReal');
    });
  });

  describe('escaped specials', () => {
    it('unescapes braces and underscore', () => {
      expect(convertLatexToUnicode('\\{ \\} \\_')).toBe('{ } _');
    });

    it('unescapes percent, ampersand, hash, dollar, pipe', () => {
      expect(convertLatexToUnicode('\\% \\& \\# \\$ \\|')).toBe('% & # $ |');
    });

    it('unescapes backslash-space as a regular space', () => {
      expect(convertLatexToUnicode('word\\ boundary')).toBe('word boundary');
    });

    it('converts \\\\ to a newline inside math mode', () => {
      // `\\` is a LaTeX line break in math/tabular contexts. Only convert
      // inside `$...$` — outside math this would mangle Windows UNC paths
      // (`\\server\share`) and escaped backslashes in code-like prose.
      expect(convertLatexToUnicode('$a\\\\b$')).toBe('a\nb');
    });

    it('leaves \\\\ alone outside math mode', () => {
      expect(convertLatexToUnicode('line1\\\\line2')).toBe('line1\\\\line2');
    });
  });

  describe('text formatting', () => {
    it('wraps textbf in markdown bold', () => {
      expect(convertLatexToUnicode('\\textbf{hello}')).toBe('**hello**');
    });

    it('wraps textit in markdown italic', () => {
      expect(convertLatexToUnicode('\\textit{hello}')).toBe('*hello*');
    });

    it('strips \\text wrapper', () => {
      expect(convertLatexToUnicode('\\text{plain}')).toBe('plain');
    });

    it('strips \\mathrm', () => {
      expect(convertLatexToUnicode('\\mathrm{foo}')).toBe('foo');
    });

    it('handles \\emph as italic', () => {
      expect(convertLatexToUnicode('\\emph{emphasized}')).toBe('*emphasized*');
    });
  });

  describe('fractions and roots', () => {
    it('converts \\frac', () => {
      expect(convertLatexToUnicode('\\frac{a}{b}')).toBe('(a)/(b)');
    });

    it('converts \\sqrt', () => {
      expect(convertLatexToUnicode('\\sqrt{x}')).toBe('√(x)');
    });

    it('converts \\sqrt with index', () => {
      expect(convertLatexToUnicode('\\sqrt[3]{x}')).toBe('3√(x)');
    });

    it('converts \\frac combined with greek', () => {
      expect(convertLatexToUnicode('\\frac{\\alpha}{\\beta}')).toBe('(α)/(β)');
    });
  });

  describe('subscripts and superscripts', () => {
    // Sub/superscripts are only applied inside math delimiters to avoid
    // mangling identifiers like `file_name` and `foo_bar` in regular prose.
    it('converts digit subscripts inside math', () => {
      expect(convertLatexToUnicode('$x_0 + x_1 + x_2$')).toBe('x₀ + x₁ + x₂');
    });

    it('converts digit superscripts inside math', () => {
      expect(convertLatexToUnicode('$E = mc^2$')).toBe('E = mc²');
    });

    it('converts letter subscripts where available', () => {
      expect(convertLatexToUnicode('$P_n$ and $x_i$')).toBe('Pₙ and xᵢ');
    });

    it('converts braced digit subscripts', () => {
      expect(convertLatexToUnicode('$x_{12}$')).toBe('x₁₂');
    });

    it('leaves subscripts with no unicode mapping alone', () => {
      // `q` has no subscript glyph in Unicode — leave the whole operand
      // untouched to avoid inconsistent-looking output.
      expect(convertLatexToUnicode('$x_{abq}$')).toBe('x_{abq}');
    });

    it('does not subscript identifiers in prose', () => {
      // Outside math delimiters, `_` is left alone entirely so that
      // snake_case identifiers and file paths render correctly. This is a
      // deliberate trade-off against model output that emits subscripts
      // unwrapped.
      expect(convertLatexToUnicode('the file_name variable')).toBe(
        'the file_name variable',
      );
      expect(convertLatexToUnicode('_private')).toBe('_private');
    });

    it('does not superscript when character is unmapped in sup', () => {
      // `^Q` — Q has no superscript. The regex only matches when the char is
      // in the map; leave as-is even inside math.
      expect(convertLatexToUnicode('$x^Q$')).toBe('x^Q');
    });

    it('leaves bare x_0 alone outside math', () => {
      // Deliberate: we cannot tell `P_0` (subscript) from `my_0` (identifier)
      // in arbitrary prose, so prefer to preserve identifiers.
      expect(convertLatexToUnicode('x_0 is fine')).toBe('x_0 is fine');
    });
  });

  describe('protection of non-LaTeX content', () => {
    it('leaves Windows paths alone', () => {
      expect(convertLatexToUnicode('C:\\Users\\foo\\bar')).toBe(
        'C:\\Users\\foo\\bar',
      );
    });

    it('leaves Windows UNC paths alone (no line-break rewrite in prose)', () => {
      // `\\server\share\file` must NOT be rewritten to a newline. Line-break
      // conversion is restricted to math mode. See PR #25802.
      expect(convertLatexToUnicode('\\\\server\\share\\file')).toBe(
        '\\\\server\\share\\file',
      );
    });

    it('leaves regex backslash escapes alone', () => {
      expect(convertLatexToUnicode('\\d+\\w*')).toBe('\\d+\\w*');
    });

    it('leaves $ in code-like prose alone', () => {
      expect(convertLatexToUnicode('run $(command)$ to see output')).toBe(
        'run $(command)$ to see output',
      );
    });
  });

  describe('combined scenarios', () => {
    it('handles complex math in prose', () => {
      const input =
        'The complexity is $O(n \\log n)$ for sorting $n$ elements.';
      expect(convertLatexToUnicode(input)).toBe(
        'The complexity is O(n log n) for sorting n elements.',
      );
    });

    it('handles multiple constructs in one line', () => {
      const input = 'Let $\\alpha \\in \\mathbb{R}$ and $\\beta \\geq 0$.';
      expect(convertLatexToUnicode(input)).toBe('Let α ∈ R and β ≥ 0.');
    });

    it('preserves surrounding text exactly', () => {
      const input = 'Before $\\to$ after.';
      expect(convertLatexToUnicode(input)).toBe('Before → after.');
    });

    it('idempotency — running twice yields the same result', () => {
      const input = '$\\{P_0, \\dots, P_n\\}$';
      const once = convertLatexToUnicode(input);
      const twice = convertLatexToUnicode(once);
      expect(twice).toBe(once);
    });
  });
});
