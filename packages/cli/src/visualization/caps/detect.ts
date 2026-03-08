import type { TerminalCaps, TerminalProtocol, ColorDepth } from '../types.js';

// ---------------------------------------------------------------------------
// Terminal capability detection (env-var based, no probes for MVP)
// ---------------------------------------------------------------------------

/**
 * Detect the best graphics protocol supported by the current terminal.
 *
 * Detection order (most capable → least):
 *   1. Kitty    — KITTY_WINDOW_ID env var
 *   2. iTerm2   — TERM_PROGRAM=iTerm.app
 *   3. SIXEL    — TERM contains "sixel" or known terminals that support it
 *   4. ASCII    — universal fallback
 *
 * Never blocks, never sends escape probes (safe for non-interactive environments).
 */
export function detectTerminalCaps(): TerminalCaps {
    const protocol = detectProtocol();
    const colorDepth = detectColorDepth();
    const columns = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const supportsUnicode = detectUnicode();

    return { protocol, colorDepth, columns, rows, supportsUnicode };
}

// ---------------------------------------------------------------------------
// Protocol detection
// ---------------------------------------------------------------------------

function detectProtocol(): TerminalProtocol {
    const env = process.env;

    // Kitty — exclusive env var set by Kitty itself
    if (env['KITTY_WINDOW_ID']) {
        return 'kitty';
    }

    // iTerm2
    if (env['TERM_PROGRAM'] === 'iTerm.app' || env['LC_TERMINAL'] === 'iTerm2') {
        return 'iterm2';
    }

    // WezTerm (supports kitty graphics protocol)
    if (env['TERM_PROGRAM'] === 'WezTerm') {
        return 'kitty';
    }

    // SIXEL — check TERM hints and known supporting terminals
    const term = (env['TERM'] ?? '').toLowerCase();
    const termProgram = (env['TERM_PROGRAM'] ?? '').toLowerCase();

    if (
        term.includes('sixel') ||
        termProgram === 'mlterm' ||
        term.startsWith('mlterm') ||
        // Windows Terminal supports sixel in recent versions
        env['WT_SESSION'] !== undefined ||
        // foot (Wayland terminal)
        env['TERM'] === 'foot'
    ) {
        return 'sixel';
    }

    // ASCII / ANSI fallback — always works
    return 'ascii';
}

// ---------------------------------------------------------------------------
// Color depth detection
// ---------------------------------------------------------------------------

function detectColorDepth(): ColorDepth {
    const colorterm = (process.env['COLORTERM'] ?? '').toLowerCase();
    if (colorterm === 'truecolor' || colorterm === '24bit') return 24;

    const term = (process.env['TERM'] ?? '').toLowerCase();
    if (term.includes('256color') || term.includes('truecolor')) return 24;

    return 8;
}

// ---------------------------------------------------------------------------
// Unicode detection
// ---------------------------------------------------------------------------

function detectUnicode(): boolean {
    const lang = (process.env['LANG'] ?? '').toLowerCase();
    const lc_all = (process.env['LC_ALL'] ?? '').toLowerCase();
    const lc_ctype = (process.env['LC_CTYPE'] ?? '').toLowerCase();

    return (
        lang.includes('utf-8') ||
        lang.includes('utf8') ||
        lc_all.includes('utf-8') ||
        lc_all.includes('utf8') ||
        lc_ctype.includes('utf-8') ||
        lc_ctype.includes('utf8') ||
        // macOS default
        process.platform === 'darwin'
    );
}
