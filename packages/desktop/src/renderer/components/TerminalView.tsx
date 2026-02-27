/**
 * TerminalView — xterm.js-based terminal that mirrors agent shell activity.
 * All `shell_run` act-phase steps are written to the terminal in real time.
 */

import React, { useEffect, useRef } from 'react';
import type { AgentStep } from '../types.js';

interface Props {
  agentSteps: AgentStep[];
}

// ANSI colour helpers
const ansi = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
};

const PHASE_COLOURS: Record<string, string> = {
  think:   ansi.blue,
  act:     ansi.green,
  observe: ansi.magenta,
};

export function TerminalView({ agentSteps }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef       = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const writtenCount = useRef(0);

  // ── Initialise xterm.js lazily (dynamic import so renderer bundle stays lean)
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      if (!containerRef.current || termRef.current) return;

      const { Terminal }  = await import('@xterm/xterm');
      const { FitAddon }  = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      const term = new Terminal({
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontSize: 12,
        lineHeight: 1.4,
        theme: {
          background:   '#0d0f12',
          foreground:   '#d0d9e7',
          cursor:       '#6470f3',
          black:        '#1c2029',
          brightBlack:  '#404d60',
          blue:         '#6470f3',
          brightBlue:   '#8293f8',
          cyan:         '#08bcb5',
          brightCyan:   '#1ed8ce',
          green:        '#22c55e',
          brightGreen:  '#4ade80',
          yellow:       '#f59e0b',
          brightYellow: '#fbbf24',
          red:          '#ef4444',
          brightRed:    '#f87171',
          magenta:      '#a855f7',
          brightMagenta:'#c084fc',
          white:        '#d0d9e7',
          brightWhite:  '#f0f4ff',
        },
        cursorStyle: 'block',
        scrollback: 5000,
        convertEol: true,
      });

      const fit  = new FitAddon();
      const links = new WebLinksAddon();

      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(containerRef.current);
      fit.fit();

      term.writeln(
        `${ansi.bold}${ansi.cyan}╔═══════════════════════════════╗${ansi.reset}\r\n` +
        `${ansi.bold}${ansi.cyan}║   Gemini Cowork  ─  Terminal  ║${ansi.reset}\r\n` +
        `${ansi.bold}${ansi.cyan}╚═══════════════════════════════╝${ansi.reset}\r\n`,
      );

      termRef.current = term;
      fitRef.current  = fit;

      const ro = new ResizeObserver(() => fit.fit());
      ro.observe(containerRef.current);

      cleanup = () => {
        ro.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current  = null;
      };
    })();

    return () => cleanup?.();
  }, []);

  // ── Write new steps to terminal ─────────────────────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newSteps = agentSteps.slice(writtenCount.current);
    writtenCount.current = agentSteps.length;

    for (const step of newSteps) {
      const colour = PHASE_COLOURS[step.type] ?? ansi.gray;
      const label  = step.type.toUpperCase().padEnd(7);
      const iter   = step.iteration !== undefined ? `#${step.iteration} ` : '';
      const tool   = step.tool ? `${ansi.gray}[${step.tool}] ${ansi.reset}` : '';

      term.writeln(
        `\r\n${colour}${ansi.bold}${label}${ansi.reset} ${ansi.gray}${iter}${ansi.reset}${tool}`,
      );

      // Indent content lines
      const lines = step.content.split('\n').slice(0, 80);
      for (const line of lines) {
        term.writeln(`  ${ansi.dim}${line}${ansi.reset}`);
      }
      if (step.content.split('\n').length > 80) {
        term.writeln(`  ${ansi.gray}… (truncated)${ansi.reset}`);
      }
    }
  }, [agentSteps]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-surface-900"
      style={{ padding: '4px' }}
    />
  );
}
