/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts common LaTeX-style syntax in model output into terminal-friendly
 * Unicode (and lightweight markdown where appropriate).
 *
 * Terminals cannot natively render LaTeX, but model responses — especially for
 * math, CS, and algorithms — frequently include constructs like `$\{P_0,
 * \dots, P_n\}$` or `$\to$`. Left as-is, the raw backslash commands show up
 * verbatim and make the output look broken.
 *
 * This function is a conservative, lossy post-processor that handles the
 * common cases and leaves anything it does not recognise untouched, so that
 * legitimate backslash content (e.g. Windows paths, regex examples) is not
 * mangled.
 *
 * See issue #25656.
 */

// Greek letters, lower and upper case, plus the common "var" variants.
const GREEK_LETTERS: Readonly<Record<string, string>> = Object.freeze({
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Epsilon: 'Ε',
  Zeta: 'Ζ',
  Eta: 'Η',
  Theta: 'Θ',
  Iota: 'Ι',
  Kappa: 'Κ',
  Lambda: 'Λ',
  Mu: 'Μ',
  Nu: 'Ν',
  Xi: 'Ξ',
  Omicron: 'Ο',
  Pi: 'Π',
  Rho: 'Ρ',
  Sigma: 'Σ',
  Tau: 'Τ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Chi: 'Χ',
  Psi: 'Ψ',
  Omega: 'Ω',
  varepsilon: 'ε',
  vartheta: 'ϑ',
  varphi: 'φ',
  varrho: 'ϱ',
  varsigma: 'ς',
  varpi: 'ϖ',
});

// Named LaTeX commands → Unicode. Covers arrows, relations, set theory,
// logic, large operators, and a handful of common decorations. Anything not
// listed here is deliberately left untouched.
const LATEX_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  // Arrows
  to: '→',
  rightarrow: '→',
  Rightarrow: '⇒',
  leftarrow: '←',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  Leftrightarrow: '⇔',
  mapsto: '↦',
  longrightarrow: '⟶',
  longleftarrow: '⟵',
  longleftrightarrow: '⟷',
  uparrow: '↑',
  downarrow: '↓',
  Uparrow: '⇑',
  Downarrow: '⇓',
  hookrightarrow: '↪',
  hookleftarrow: '↩',

  // Ellipses
  dots: '…',
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',

  // Arithmetic / comparison
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  ast: '∗',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  ll: '≪',
  gg: '≫',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',

  // Set theory
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  emptyset: '∅',
  varnothing: '∅',

  // Logic
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  implies: '⟹',
  iff: '⟺',

  // Large operators
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',

  // Calculus
  partial: '∂',
  nabla: '∇',
  infty: '∞',

  // Misc letters / constants
  ell: 'ℓ',
  hbar: 'ℏ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  beth: 'ℶ',

  // Brackets / delimiters
  lbrace: '{',
  rbrace: '}',
  lbrack: '[',
  rbrack: ']',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',

  // Geometry / misc
  perp: '⊥',
  parallel: '∥',
  angle: '∠',
  triangle: '△',
  square: '□',
  circ: '∘',
  bullet: '•',
  star: '⋆',
  prime: '′',
  dag: '†',
  ddag: '‡',
  therefore: '∴',
  because: '∵',
  top: '⊤',
  bot: '⊥',

  // Operator names (`\log`, `\sin`, …) render in LaTeX as upright text. In a
  // terminal the closest equivalent is the lowercase word itself.
  log: 'log',
  ln: 'ln',
  lg: 'lg',
  exp: 'exp',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  cot: 'cot',
  sec: 'sec',
  csc: 'csc',
  arcsin: 'arcsin',
  arccos: 'arccos',
  arctan: 'arctan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  max: 'max',
  min: 'min',
  sup: 'sup',
  inf: 'inf',
  lim: 'lim',
  limsup: 'lim sup',
  liminf: 'lim inf',
  arg: 'arg',
  det: 'det',
  dim: 'dim',
  ker: 'ker',
  gcd: 'gcd',
  deg: 'deg',
  hom: 'hom',
  mod: 'mod',
  bmod: 'mod',
  pmod: 'mod',

  // Whitespace commands — render as visible space so layout is roughly right.
  quad: '  ',
  qquad: '    ',
  // These are all "thin-space" style commands in LaTeX; render as a single
  // space so the surrounding tokens don't jam together.
  ',': ' ',
  ';': ' ',
  ':': ' ',
  '!': '',
});

// Unicode subscript mappings (digits, operators, and the common letters that
// have full-height subscript glyphs in Unicode).
const SUBSCRIPT_MAP: Readonly<Record<string, string>> = Object.freeze({
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
});

// Unicode superscript mappings. A superset of subscripts — most letters have
// superscript glyphs.
const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = Object.freeze({
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
});

/**
 * Strips `$...$` and `$$...$$` math delimiters when the inner content looks
 * like math, applying the full set of math-mode conversions (including
 * sub/superscripts) to the inner text. The goal is to handle model output
 * without eating dollar signs that appear in ordinary prose (prices,
 * shell examples, etc.).
 *
 * A pair of `$...$` is treated as math when the inner text either:
 *   - contains a LaTeX marker (`\command`, `_`, `^`), or
 *   - is a single letter, possibly with whitespace padding (e.g. `$x$`,
 *     `$ n $`). Shell-style variables like `$USER` are LEFT intact because
 *     multi-letter all-caps sequences look much more like shell vars than
 *     math in practice.
 *
 * A currency expression like `$5.99` (single `$`) never matches the pair
 * regex. `From $5 to $10` matches `$5 to $` as a pair but the inner text is
 * neither mathy nor a single variable, so it is left intact.
 */
function stripMathDelimiters(text: string): string {
  // Display math first, greedy-safe with non-dollar inner class.
  let out = text.replace(/\$\$([^$]+)\$\$/g, (_, inner: string) =>
    applyMathModeConversions(inner),
  );

  // Inline math: lazy, single-line to avoid eating across paragraphs.
  out = out.replace(/\$([^$\n]+?)\$/g, (match, inner: string) => {
    const hasLatexMarkers = /\\[A-Za-z]|[\\_^]/.test(inner);
    const isSingleVariable = /^\s*[A-Za-z]\s*$/.test(inner);
    if (hasLatexMarkers || isSingleVariable) {
      return applyMathModeConversions(inner);
    }
    return match;
  });

  return out;
}

/**
 * Converts `\textbf{..}`, `\textit{..}`, `\emph{..}`, `\text{..}`,
 * `\mathrm{..}`, `\mathbf{..}`, `\mathit{..}`, `\mathsf{..}`, `\mathtt{..}`,
 * and `\operatorname{..}` into markdown-equivalent wrappers or plain text so
 * the regular inline parser picks them up downstream.
 *
 * Only handles a single level of nesting (no inner braces) — this keeps the
 * regex bounded and avoids catastrophic backtracking on adversarial input.
 */
function convertTextFormatting(text: string): string {
  let out = text;
  out = out.replace(
    /\\(?:textbf|mathbf)\{([^{}]*)\}/g,
    (_, inner: string) => `**${inner}**`,
  );
  out = out.replace(
    /\\(?:textit|emph|mathit)\{([^{}]*)\}/g,
    (_, inner: string) => `*${inner}*`,
  );
  out = out.replace(
    /\\(?:text|mathrm|mathsf|mathtt|mathbb|mathcal|mathfrak|operatorname)\{([^{}]*)\}/g,
    (_, inner: string) => inner,
  );
  return out;
}

/**
 * Handles `\frac{a}{b}` → `(a)/(b)` and `\sqrt{x}` → `√(x)`.
 * Only a single level of braces is supported.
 */
function convertFractionsAndRoots(text: string): string {
  let out = text;
  out = out.replace(
    /\\frac\{([^{}]*)\}\{([^{}]*)\}/g,
    (_, num: string, den: string) => `(${num})/(${den})`,
  );
  out = out.replace(
    /\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g,
    (_, index: string, radicand: string) => `${index}√(${radicand})`,
  );
  out = out.replace(
    /\\sqrt\{([^{}]*)\}/g,
    (_, radicand: string) => `√(${radicand})`,
  );
  return out;
}

/**
 * Converts escaped single-character specials (`\{` → `{`, `\_` → `_`, etc.).
 * Runs before command lookup so `\{` is not misread as a command named `{`.
 */
function convertEscapedSpecials(text: string): string {
  // The set is intentionally narrow: only characters that have meaning in
  // LaTeX and also appear unescaped in plain text. We do not unescape `\\`
  // (line break) here — it is handled separately.
  let out = text.replace(/\\([{}[\]_%&#$|])/g, (_, ch: string) => ch);
  // `\ ` (backslash + space) is LaTeX for a non-breaking space; just keep it
  // as a regular space so words do not collide.
  out = out.replace(/\\ /g, ' ');
  return out;
}

/**
 * Converts named commands (alphabetic control sequences) to Unicode. Anything
 * not in the tables is left as-is so unrelated backslash content
 * (e.g. Windows paths) is not disturbed.
 */
function convertNamedCommands(text: string): string {
  return text.replace(
    /\\([A-Za-z]+)(?![A-Za-z])/g,
    (match, name: string) =>
      GREEK_LETTERS[name] ?? LATEX_COMMANDS[name] ?? match,
  );
}

/**
 * Converts the short-form punctuation commands `\,`, `\;`, `\:`, `\!` used
 * for spacing in LaTeX. These are handled separately from alphabetic commands
 * because the regex for the latter only matches letters.
 */
function convertPunctuationCommands(text: string): string {
  // `\,`, `\;`, `\:` all render as a single space; `\!` is a negative space
  // and is stripped.
  return text.replace(/\\([,;:!])/g, (_, ch: string) => {
    switch (ch) {
      case ',':
      case ';':
      case ':':
        return ' ';
      case '!':
        return '';
      default:
        return ch;
    }
  });
}

/**
 * Converts the `\\` line-break command (used inside math environments and
 * tables) to a literal newline. Must run after `\` specials but before any
 * other regex that might see a lingering backslash.
 */
function convertLineBreaks(text: string): string {
  return text.replace(/\\\\/g, '\n');
}

/**
 * Converts subscripts and superscripts to Unicode where every character in
 * the operand maps. If any character has no mapping the whole operand is
 * left alone, to avoid "half-converted" output that looks worse than no
 * conversion.
 */
function convertSubSuperScripts(text: string): string {
  // Braced form first: x_{...}, x^{...}. We only support BMP characters (the
  // mapping tables are ASCII-only), so iterating with `Array.from` over code
  // units is safe and keeps the lint rule against splitting strings happy.
  const charsOf = (s: string): string[] => Array.from(s);

  let out = text.replace(/_\{([^{}]+)\}/g, (match, inner: string) => {
    const chars = charsOf(inner);
    if (chars.every((c) => SUBSCRIPT_MAP[c] !== undefined)) {
      return chars.map((c) => SUBSCRIPT_MAP[c]).join('');
    }
    return match;
  });
  out = out.replace(/\^\{([^{}]+)\}/g, (match, inner: string) => {
    const chars = charsOf(inner);
    if (chars.every((c) => SUPERSCRIPT_MAP[c] !== undefined)) {
      return chars.map((c) => SUPERSCRIPT_MAP[c]).join('');
    }
    return match;
  });

  // Single-character form: x_0, x^2. Only convert when the character actually
  // has a mapping — leaves `file_name` and `foo^bar` alone.
  out = out.replace(
    /([A-Za-z0-9)\]])_([A-Za-z0-9+\-=()])/g,
    (match, base: string, c: string) => {
      const sub = SUBSCRIPT_MAP[c];
      return sub ? `${base}${sub}` : match;
    },
  );
  out = out.replace(
    /([A-Za-z0-9)\]])\^([A-Za-z0-9+\-=()])/g,
    (match, base: string, c: string) => {
      const sup = SUPERSCRIPT_MAP[c];
      return sup ? `${base}${sup}` : match;
    },
  );

  return out;
}

/**
 * Applies the full set of conversions that make sense inside a LaTeX math
 * region (i.e. text that was originally wrapped in `$...$`). This includes
 * sub/superscripts, which are NOT safe to apply to arbitrary prose because
 * they would mangle identifiers like `file_name`.
 */
function applyMathModeConversions(text: string): string {
  let out = text;
  out = convertTextFormatting(out);
  out = convertFractionsAndRoots(out);
  out = convertEscapedSpecials(out);
  out = convertLineBreaks(out);
  out = convertNamedCommands(out);
  out = convertPunctuationCommands(out);
  out = convertSubSuperScripts(out);
  return out;
}

/**
 * Applies conversions that are safe to run on arbitrary prose — anything
 * keyed off explicit LaTeX tokens like `\alpha`, `\textbf{...}`, `\to`. Does
 * NOT touch standalone `_` or `^` so identifiers and snake_case names are
 * preserved.
 */
function applyProseConversions(text: string): string {
  let out = text;
  out = convertTextFormatting(out);
  out = convertFractionsAndRoots(out);
  out = convertEscapedSpecials(out);
  // Deliberately NOT running convertLineBreaks here: outside math delimiters
  // `\\` is far more likely to be a Windows UNC path (`\\server\share`) or an
  // escaped backslash in code-like prose than a LaTeX line break. Legitimate
  // LaTeX line breaks belong inside `$...$` or `$$...$$` and are handled by
  // applyMathModeConversions. See PR #25802 review.
  out = convertNamedCommands(out);
  out = convertPunctuationCommands(out);
  return out;
}

/**
 * Top-level entry point. Two-phase conversion:
 *
 *   1. Strip `$...$` / `$$...$$` math regions, applying math-mode conversions
 *      (including sub/superscripts) to the inner text. The heuristic for
 *      "this dollar pair is math" runs against the ORIGINAL input so that
 *      model-authored LaTeX is recognised before any tokens are rewritten.
 *
 *   2. Run prose-safe conversions over the remaining text, catching
 *      unwrapped LaTeX tokens (`\alpha`, `\to`, `\textbf{...}`) that the
 *      model emitted outside math delimiters.
 *
 * Short-circuits on input that has no LaTeX markers at all (`\` or `$`) so
 * the hot rendering path stays cheap for ordinary prose.
 */
export function convertLatexToUnicode(input: string): string {
  if (!input) return input;
  // Fast path: if there's no backslash and no dollar sign, there's nothing to
  // convert. This keeps the hot rendering path inexpensive for ordinary text.
  if (input.indexOf('\\') === -1 && input.indexOf('$') === -1) {
    return input;
  }

  let text = input;
  text = stripMathDelimiters(text);
  text = applyProseConversions(text);
  return text;
}
