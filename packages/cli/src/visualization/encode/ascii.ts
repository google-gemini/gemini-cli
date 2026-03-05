// ---------------------------------------------------------------------------
// ASCII / ANSI raster emitter
// ---------------------------------------------------------------------------
//
// This emitter wraps the ASCII renderer from @termviz/core.
// It takes the raw Mermaid spec (not the PNG path) and renders it
// as Unicode box-drawing art, then passes it through to stdout.
//
// Note: The visualArtifact renderer will call this path separately
// (it won't use the PNG path since ASCII doesn't decode images).

import { renderMermaidAscii } from '../render/ascii.js';

/**
 * Emit a Mermaid diagram as ASCII/ANSI box-drawing art to stdout.
 * Returns the string (caller writes to stdout).
 */
export function encodeAscii(spec: string, cols = 80): string {
    return renderMermaidAscii(spec, cols);
}
